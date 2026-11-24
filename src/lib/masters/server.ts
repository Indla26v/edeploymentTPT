import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { accommodations, components, idCardHeaders, instructions, ranks, shifts, stations, teams, units, vehicles } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { UserError, isStateLevel, scopeUnitIds } from "@/lib/authz/authorize";
import { unitScope } from "@/lib/authz/scoped";
import type { DbOrTx } from "@/lib/auth/accounts";
import { saveImage } from "@/lib/storage";
import { MASTER_DEFS, type FieldDef, type MasterDef, type MasterKey, type Option } from "./defs";

type AnyTable = PgTable & { id: PgColumn; unitId?: PgColumn };

const TABLES: Record<MasterKey, AnyTable> = {
  ranks: ranks as unknown as AnyTable,
  units: units as unknown as AnyTable,
  components: components as unknown as AnyTable,
  accommodation: accommodations as unknown as AnyTable,
  vehicles: vehicles as unknown as AnyTable,
  teams: teams as unknown as AnyTable,
  shifts: shifts as unknown as AnyTable,
  instructions: instructions as unknown as AnyTable,
  "id-card-headers": idCardHeaders as unknown as AnyTable,
};

export function getDef(key: string): MasterDef | null {
  return (MASTER_DEFS as Record<string, MasterDef>)[key] ?? null;
}

const PHONE = /^[6-9]\d{9}$/;

function fieldSchema(f: FieldDef): z.ZodType {
  const optionalText = z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null));
  switch (f.type) {
    case "text":
    case "textarea":
      return f.required ? z.string().trim().min(1, `Enter ${f.label.toLowerCase()}`).max(f.type === "textarea" ? 4000 : 200) : optionalText;
    case "phone":
      return z
        .string()
        .trim()
        .optional()
        .transform((v) => (v ? v : null))
        .refine((v) => v === null || PHONE.test(v), "Enter a 10-digit mobile number");
    case "number": {
      const n = z.coerce.number({ message: `Enter ${f.label.toLowerCase()}` }).int("Whole numbers only").min(f.min ?? 0, `Minimum ${f.min ?? 0}`).max(f.max ?? 1_000_000, `Maximum ${f.max}`);
      return f.required ? n : z.union([z.literal("").transform(() => null), n]).optional().transform((v) => v ?? null);
    }
    case "time":
      return z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a time");
    case "date":
      return f.required
        ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter ${f.label.toLowerCase()}`)
        : z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("").transform(() => null)]).optional().transform((v) => v ?? null);
    case "select": {
      if (Array.isArray(f.options)) {
        const values = f.options.map((o) => o.value) as [string, ...string[]];
        return f.required ? z.enum(values, { message: `Choose ${f.label.toLowerCase()}` }) : z.union([z.enum(values), z.literal("").transform(() => null)]).optional().transform((v) => v ?? null);
      }
      if (f.options === "stations") {
        return f.required ? z.string().uuid(`Choose ${f.label.toLowerCase()}`) : z.union([z.string().uuid(), z.literal("").transform(() => null)]).optional().transform((v) => v ?? null);
      }
      return optionalText;
    }
    case "boolean":
      return z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).optional().transform((v) => v ?? false);
    case "image":
      return z.string().nullable().optional();
    case "latlng":
      return z
        .object({
          lat: z.union([z.coerce.number().min(-90).max(90), z.literal("").transform(() => null)]).nullable().optional(),
          lng: z.union([z.coerce.number().min(-180).max(180), z.literal("").transform(() => null)]).nullable().optional(),
        })
        .optional();
    case "composition":
      return z
        .array(z.object({ rankCode: z.string().min(1), count: z.coerce.number().int().min(1, "At least 1").max(500) }))
        .optional()
        .transform((v) => v ?? []);
  }
}

export function schemaFor(fields: FieldDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.name] = fieldSchema(f);
  return z.object(shape);
}

export function buildSchema(def: MasterDef) {
  return schemaFor(def.fields);
}

/**
 * Reads FormData produced by `toFormData` into plain values; uploads image files to storage.
 * Returns a field error when an image is rejected.
 */
export async function readForm(
  fields: FieldDef[],
  formData: FormData,
  imageFolder: (field: string) => Parameters<typeof saveImage>[1],
): Promise<{ values: Record<string, unknown> } | { error: string; field: string }> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = formData.get(f.name);
    if (f.type === "image") {
      if (raw instanceof File && raw.size > 0) {
        try {
          values[f.name] = await saveImage(raw, imageFolder(f.name));
        } catch (e) {
          return { error: (e as Error).message, field: f.name };
        }
      } else if (raw === "__remove__") values[f.name] = null;
    } else if (f.type === "latlng" || f.type === "composition") {
      values[f.name] = raw ? JSON.parse(String(raw)) : undefined;
    } else values[f.name] = raw === null ? undefined : String(raw);
  }
  return { values };
}

/** Converts validated form values to table columns (latlng → lat/lng). */
function toColumns(def: MasterDef, values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = values[f.name];
    if (f.type === "latlng") {
      const ll = (v ?? {}) as { lat?: number | null; lng?: number | null };
      out.lat = ll.lat ?? null;
      out.lng = ll.lng ?? null;
    } else if (f.type === "image") {
      if (v !== undefined) out[f.name] = v;
    } else out[f.name] = v;
  }
  return out;
}

export type MasterRow = Record<string, unknown> & { id: string };

export async function listMaster(user: CurrentUser, def: MasterDef): Promise<MasterRow[]> {
  const table = TABLES[def.key];
  const db = getDb();
  const where = def.scope === "unit" && table.unitId ? unitScope(user, table.unitId) : sql`true`;
  const order = def.key === "units" ? asc(units.displayOrder) : def.key === "ranks" ? asc(ranks.seniority) : asc(table.id);
  const rows = (await db.select().from(table).where(where).orderBy(order)) as Record<string, unknown>[];
  return rows.map((r) => {
    const row: MasterRow = { ...(r as object), id: String(r.id) } as MasterRow;
    if (def.fields.some((f) => f.type === "latlng")) row.location = { lat: r.lat ?? null, lng: r.lng ?? null };
    for (const k of Object.keys(row)) if (row[k] instanceof Date) row[k] = (row[k] as Date).toISOString();
    return row;
  });
}

/** Options for selects backed by data (stations in scope, active ranks). */
export async function dynamicOptions(user: CurrentUser): Promise<{ stations: Option[]; ranks: Option[] }> {
  const db = getDb();
  const [st, rk] = await Promise.all([
    db.select({ value: stations.id, label: stations.name }).from(stations).where(unitScope(user, stations.unitId)).orderBy(asc(stations.displayOrder)),
    db.select({ value: ranks.code, label: ranks.code }).from(ranks).where(eq(ranks.isActive, true)).orderBy(asc(ranks.seniority)),
  ]);
  return { stations: st, ranks: rk };
}

async function assertRowInScope(db: DbOrTx, user: CurrentUser, def: MasterDef, id: string) {
  const table = TABLES[def.key];
  const [row] = (await db.select().from(table).where(eq(table.id, id)).limit(1)) as Record<string, unknown>[];
  if (!row) throw new UserError(`That ${def.singular} no longer exists.`);
  if (def.scope === "unit") {
    const ids = scopeUnitIds(user);
    if (ids && !ids.includes(String(row.unitId))) throw new UserError(`That ${def.singular} belongs to another unit.`);
  }
  return row;
}

export async function saveMaster(db: DbOrTx, user: CurrentUser, def: MasterDef, id: string | null, values: Record<string, unknown>) {
  const table = TABLES[def.key];
  const cols = toColumns(def, values);
  if (id) {
    const before = await assertRowInScope(db, user, def, id);
    await db.update(table).set(cols).where(eq(table.id, id));
    return { id, before };
  }
  if (def.scope === "unit") {
    if (!user.unitId || isStateLevel(user)) throw new UserError("Switch to a unit role to add this.");
    cols.unitId = user.unitId;
  }
  if (def.key === "units") {
    const [m] = await db.select({ n: sql<number>`coalesce(max(${units.displayOrder}), 0)`.mapWith(Number) }).from(units);
    cols.displayOrder = (m?.n ?? 0) + 1;
  }
  const [row] = (await db.insert(table).values(cols).returning({ id: table.id })) as { id: string }[];
  return { id: row!.id, before: null };
}

export async function deleteMaster(db: DbOrTx, user: CurrentUser, def: MasterDef, id: string) {
  const table = TABLES[def.key];
  const before = await assertRowInScope(db, user, def, id);
  await db.delete(table).where(eq(table.id, id));
  return before;
}

export async function reorderUnits(db: DbOrTx, ids: string[]) {
  const existing = await db.select({ id: units.id }).from(units).where(inArray(units.id, ids));
  if (existing.length !== ids.length) throw new UserError("The list changed. Reload and try again.");
  for (const [i, id] of ids.entries()) await db.update(units).set({ displayOrder: i + 1 }).where(and(eq(units.id, id)));
}

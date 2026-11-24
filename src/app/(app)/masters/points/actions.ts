"use server";

import { refresh } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { deploymentPoints, stations } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { UserError, assertUnit, can, isStateLevel } from "@/lib/authz/authorize";
import { readWorkbook } from "@/lib/excel";
import { mutate, type ActionResult } from "@/lib/server/mutate";
import type { ImportResult } from "@/components/masters/import-sheet";
import { INTENSITY, MOBILITY, GENDER_REQ, parsePointRows } from "@/lib/masters/import-points";


const pointSchema = z.object({
  name: z.string().trim().min(2, "Enter the point name").max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  stationId: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .transform((v) => v || null),
  location: z.object({ lat: z.number({ error: "Pick the location" }).min(-90).max(90), lng: z.number({ error: "Pick the location" }).min(-180).max(180) }),
  defaultPriority: z.coerce.number().int().min(1).max(4),
  defaultIntensity: z.enum(INTENSITY),
  defaultMobility: z.enum(MOBILITY),
  genderReq: z.enum(GENDER_REQ),
  isActive: z.boolean(),
});

export async function savePointAction(id: string | null, input: z.input<typeof pointSchema>) {
  return mutate({
    permission: "masters.points.manage",
    schema: pointSchema,
    input,
    message: id ? "Point updated" : "Point added",
    run: async ({ tx, user, data, audit }) => {
      if (!user.unitId || isStateLevel(user)) throw new UserError("Switch to a unit role to manage points.");
      if (data.stationId) {
        const [st] = await tx.select({ unitId: stations.unitId }).from(stations).where(eq(stations.id, data.stationId)).limit(1);
        if (!st) throw new UserError("That station no longer exists.");
        assertUnit(user, st.unitId);
      }
      const { location, ...rest } = data;
      const cols = { ...rest, lat: location.lat, lng: location.lng };
      if (id) {
        const [before] = await tx.select().from(deploymentPoints).where(eq(deploymentPoints.id, id)).limit(1);
        if (!before) throw new UserError("That point no longer exists.");
        assertUnit(user, before.unitId);
        await tx.update(deploymentPoints).set(cols).where(eq(deploymentPoints.id, id));
        await audit({ action: "point.update", entity: "deployment_point", entityId: id, before, after: cols });
      } else {
        const [row] = await tx.insert(deploymentPoints).values({ ...cols, unitId: user.unitId }).returning({ id: deploymentPoints.id });
        await audit({ action: "point.create", entity: "deployment_point", entityId: row!.id, after: cols });
      }
      refresh();
    },
  });
}

export async function deletePointAction(id: string) {
  return mutate({
    permission: "masters.points.manage",
    schema: z.object({ id: z.string().uuid() }),
    input: { id },
    message: "Point deleted",
    run: async ({ tx, user, data, audit }) => {
      const [p] = await tx.select().from(deploymentPoints).where(eq(deploymentPoints.id, data.id)).limit(1);
      if (!p) throw new UserError("That point no longer exists.");
      assertUnit(user, p.unitId);
      await tx.delete(deploymentPoints).where(eq(deploymentPoints.id, data.id));
      await audit({ action: "point.delete", entity: "deployment_point", entityId: data.id, before: p });
      refresh();
    },
  });
}

/** Excel import of the points library: check (preview) → import. Same name in the unit updates the point. */
export async function importPointsAction(formData: FormData): Promise<ActionResult<ImportResult>> {
  const user = await requireUser();
  if (!can(user, "masters.points.manage")) return { ok: false, error: "You don't have permission to do this." };
  if (!user.unitId || isStateLevel(user)) return { ok: false, error: "Switch to a unit role to import points." };
  const unitId = user.unitId;
  const file = formData.get("file");
  const commit = formData.get("commit") === "true";
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an Excel file (.xlsx)." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "The file is larger than 5 MB." };
  let rows: Record<string, string>[];
  try {
    rows = await readWorkbook(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "That file couldn't be read. Use the template (.xlsx)." };
  }
  if (rows.length === 0) return { ok: false, error: "The sheet has no rows." };
  if (rows.length > 2000) return { ok: false, error: "Import at most 2,000 rows at a time." };

  const { valid, errors } = parsePointRows(rows);
  let created = 0;
  let updated = 0;
  if (commit && valid.length) {
    const res = await mutate({
      permission: "masters.points.manage",
      schema: z.object({}),
      input: {},
      run: async ({ tx, audit }) => {
        const existing = await tx
          .select({ id: deploymentPoints.id, name: deploymentPoints.name })
          .from(deploymentPoints)
          .where(and(eq(deploymentPoints.unitId, unitId), inArray(deploymentPoints.name, valid.map((v) => v.name))));
        const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e.id]));
        for (const v of valid) {
          const hit = byName.get(v.name.toLowerCase());
          if (hit) {
            await tx.update(deploymentPoints).set(v).where(eq(deploymentPoints.id, hit));
            updated++;
          } else {
            await tx.insert(deploymentPoints).values({ ...v, unitId });
            created++;
          }
        }
        await audit({ action: "point.import", entity: "deployment_point", after: { created, updated, skipped: errors.length } });
        refresh();
      },
    });
    if (!res.ok) return res;
  }
  return { ok: true, data: { total: rows.length, valid: valid.length, created, updated, errors: errors.slice(0, 200) } };
}

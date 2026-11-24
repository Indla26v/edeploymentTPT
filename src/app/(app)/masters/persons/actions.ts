"use server";

import { refresh } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { persons, ranks, stations, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { CurrentUser } from "@/lib/auth/session";
import { UserError, assertStation, can } from "@/lib/authz/authorize";
import { readWorkbook } from "@/lib/excel";
import { readForm } from "@/lib/masters/server";
import { mutate, type ActionResult } from "@/lib/server/mutate";
import type { DbOrTx } from "@/lib/auth/accounts";
import { scopeStationIds, scopeUnitIds } from "@/lib/authz/authorize";
import { personFields } from "./fields";

const AVAIL = ["available", "on_leave", "medical_leave", "suspended", "deputation", "other"] as const;
const personSchema = z.object({
  name: z.string().trim().min(2, "Enter the officer's name").max(120),
  genNo: z.string().trim().regex(/^[A-Za-z0-9/-]{1,12}$/, "Gen No: letters, digits, / or - (max 12)"),
  rankId: z.string().uuid("Choose a rank"),
  stationId: z.string().uuid("Choose a station"),
  gender: z.enum(["male", "female"]),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter date of birth"),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[6-9]\d{9}$/.test(v), "Enter a 10-digit mobile number"),
  availability: z.enum(AVAIL),
  fitness: z.enum(["fit", "light_duty_only"]),
  photoUrl: z.string().nullable().optional(),
  signatureUrl: z.string().nullable().optional(),
});

async function stationUnit(db: DbOrTx, user: CurrentUser, stationId: string) {
  const [st] = await db.select({ unitId: stations.unitId }).from(stations).where(eq(stations.id, stationId)).limit(1);
  if (!st) throw new UserError("That station no longer exists.");
  assertStation(user, stationId, st.unitId);
  return st.unitId;
}

function checkAge(dob: string) {
  const d = new Date(`${dob}T00:00:00Z`);
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (Number.isNaN(age) || age < 18 || age > 65) throw new UserError("Date of birth must give an age between 18 and 65.");
}

export async function savePersonAction(id: string | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const read = await readForm(personFields([], [], false), formData, (f) => (f === "photoUrl" ? "persons" : "signatures"));
  if ("error" in read) return { ok: false, error: read.error, fieldErrors: { [read.field]: read.error } };
  return mutate({
    permission: "masters.persons.manage",
    schema: personSchema,
    input: read.values,
    message: id ? "Officer updated" : "Officer added",
    run: async ({ tx, user, data, audit }) => {
      checkAge(data.dob);
      const unitId = await stationUnit(tx, user, data.stationId);
      const [rank] = await tx.select({ id: ranks.id }).from(ranks).where(eq(ranks.id, data.rankId)).limit(1);
      if (!rank) throw new UserError("That rank no longer exists.");
      const [dup] = await tx.select({ id: persons.id }).from(persons).where(and(eq(persons.unitId, unitId), eq(persons.genNo, data.genNo))).limit(1);
      if (dup && dup.id !== id) throw new UserError(`Gen No ${data.genNo} is already used in this unit.`);
      const cols = { ...data, unitId, photoUrl: data.photoUrl, signatureUrl: data.signatureUrl };
      if (data.photoUrl === undefined) delete (cols as Partial<typeof cols>).photoUrl;
      if (data.signatureUrl === undefined) delete (cols as Partial<typeof cols>).signatureUrl;
      if (id) {
        const [before] = await tx.select().from(persons).where(eq(persons.id, id)).limit(1);
        if (!before) throw new UserError("That officer no longer exists.");
        await stationUnit(tx, user, before.stationId);
        await tx.update(persons).set(cols).where(eq(persons.id, id));
        await audit({ action: "person.update", entity: "person", entityId: id, before, after: data });
        refresh();
        return { id };
      }
      const [row] = await tx.insert(persons).values(cols as typeof persons.$inferInsert).returning({ id: persons.id });
      await audit({ action: "person.create", entity: "person", entityId: row!.id, after: data });
      refresh();
      return { id: row!.id };
    },
  });
}

const quickSchema = z.object({ id: z.string().uuid(), availability: z.enum(AVAIL).optional(), fitness: z.enum(["fit", "light_duty_only"]).optional() });

/** Inline availability / fitness change from the table. */
export async function updatePersonStatusAction(input: z.input<typeof quickSchema>) {
  return mutate({
    permission: "masters.persons.manage",
    schema: quickSchema,
    input,
    run: async ({ tx, user, data, audit }) => {
      const [p] = await tx.select().from(persons).where(eq(persons.id, data.id)).limit(1);
      if (!p) throw new UserError("That officer no longer exists.");
      await stationUnit(tx, user, p.stationId);
      const patch = { ...(data.availability ? { availability: data.availability } : {}), ...(data.fitness ? { fitness: data.fitness } : {}) };
      await tx.update(persons).set(patch).where(eq(persons.id, data.id));
      await audit({ action: "person.status", entity: "person", entityId: data.id, before: { availability: p.availability, fitness: p.fitness }, after: patch });
      refresh();
    },
  });
}

/** Removes an officer from active lists (kept for history) and deactivates their login. */
export async function removePersonAction(id: string) {
  return mutate({
    permission: "masters.persons.manage",
    schema: z.object({ id: z.string().uuid() }),
    input: { id },
    message: "Officer removed",
    run: async ({ tx, user, data, audit }) => {
      const [p] = await tx.select().from(persons).where(eq(persons.id, data.id)).limit(1);
      if (!p) throw new UserError("That officer no longer exists.");
      await stationUnit(tx, user, p.stationId);
      await tx.update(persons).set({ isActive: false }).where(eq(persons.id, data.id));
      await tx.update(users).set({ isActive: false }).where(eq(users.personId, data.id));
      await audit({ action: "person.remove", entity: "person", entityId: data.id, before: p });
      refresh();
    },
  });
}

export type ImportPreview = { total: number; valid: number; created: number; updated: number; errors: { row: number; message: string }[] };

function parseDob(v: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return null;
}

/**
 * Excel import for police persons. First call (commit=false) validates and previews; second call commits.
 * Rows are matched on Gen No within the unit: existing officers are updated, new ones created.
 */
export async function importPersonsAction(formData: FormData): Promise<ActionResult<ImportPreview>> {
  const user = await requireUser();
  if (!can(user, "masters.persons.manage")) return { ok: false, error: "You don't have permission to do this." };
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
  if (rows.length > 5000) return { ok: false, error: "Import at most 5,000 rows at a time." };

  const db = getDb();
  const unitIds = scopeUnitIds(user);
  const stationIds = scopeStationIds(user);
  const [rankRows, stationRows] = await Promise.all([
    db.select({ id: ranks.id, code: ranks.code }).from(ranks),
    db.select({ id: stations.id, code: stations.code, unitId: stations.unitId }).from(stations).where(unitIds === null ? undefined : inArray(stations.unitId, unitIds.length ? unitIds : ["00000000-0000-0000-0000-000000000000"])),
  ]);
  const rankBy = new Map(rankRows.map((r) => [r.code.toLowerCase(), r.id]));
  const stationBy = new Map(stationRows.filter((s) => !stationIds || stationIds.includes(s.id)).map((s) => [s.code.toLowerCase(), s]));

  const errors: ImportPreview["errors"] = [];
  const valid: (typeof persons.$inferInsert)[] = [];
  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const get = (k: string) => (r[k] ?? "").trim();
    const rankId = rankBy.get(get("Rank").toLowerCase());
    const st = stationBy.get(get("Station Code").toLowerCase());
    const gender = get("Gender").toLowerCase().startsWith("f") ? "female" : get("Gender").toLowerCase().startsWith("m") ? "male" : null;
    const dob = parseDob(get("Date of birth"));
    const phone = get("Mobile").replace(/\D/g, "") || null;
    const fitness = /light/i.test(get("Fitness")) ? "light_duty_only" : "fit";
    const availRaw = get("Availability").toLowerCase().replace(/\s+/g, "_");
    const availability = (AVAIL as readonly string[]).includes(availRaw) ? (availRaw as (typeof AVAIL)[number]) : "available";
    const problems: string[] = [];
    if (!get("Gen No")) problems.push("Gen No missing");
    if (!get("Name")) problems.push("Name missing");
    if (!rankId) problems.push(`unknown rank "${get("Rank")}"`);
    if (!st) problems.push(`unknown or out-of-scope station "${get("Station Code")}"`);
    if (!gender) problems.push("Gender must be Male or Female");
    if (!dob) problems.push("Date of birth must be YYYY-MM-DD or DD-MM-YYYY");
    if (phone && !/^[6-9]\d{9}$/.test(phone)) problems.push("Mobile must be 10 digits");
    if (problems.length) {
      errors.push({ row: rowNo, message: problems.join("; ") });
      return;
    }
    valid.push({ unitId: st!.unitId, stationId: st!.id, rankId: rankId!, genNo: get("Gen No"), name: get("Name"), gender: gender!, dob: dob!, phone, fitness, availability });
  });

  let created = 0;
  let updated = 0;
  if (commit && valid.length) {
    const res = await mutate({
      permission: "masters.persons.manage",
      schema: z.object({}),
      input: {},
      run: async ({ tx, audit }) => {
        for (const v of valid) {
          const [existing] = await tx.select({ id: persons.id }).from(persons).where(and(eq(persons.unitId, v.unitId), eq(persons.genNo, v.genNo))).limit(1);
          if (existing) {
            await tx.update(persons).set({ ...v, isActive: true }).where(eq(persons.id, existing.id));
            updated++;
          } else {
            await tx.insert(persons).values(v);
            created++;
          }
        }
        await audit({ action: "person.import", entity: "person", after: { created, updated, skipped: errors.length } });
        refresh();
      },
    });
    if (!res.ok) return res;
  }
  return { ok: true, data: { total: rows.length, valid: valid.length, created, updated, errors: errors.slice(0, 200) } };
}

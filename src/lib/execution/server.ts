import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { DbOrTx } from "../auth/accounts";
import { attendance, persons, planComponents, planPoints, planPublications, planWindows, plans, ranks, sectors, slots, stations, type PublicationEntry } from "../db/schema";
import { ageOn } from "../placement/server";
import { CHECKIN_RADIUS_M, metresBetween } from "./allocate";

export type AttendanceStatus = "present" | "checked_out" | "absent" | "pending";
const GRACE_MIN = 15;

export async function latestSnapshot(db: DbOrTx, planId: string): Promise<{ version: number; entries: PublicationEntry[]; publishedAt: Date } | null> {
  const [p] = await db.select().from(planPublications).where(eq(planPublications.planId, planId)).orderBy(desc(planPublications.version)).limit(1);
  return p ? { version: p.version, entries: p.snapshot, publishedAt: p.publishedAt } : null;
}

/** The published duty roster with each officer's posting and live attendance status. */
export async function getRoster(db: DbOrTx, planId: string, now = new Date()) {
  const snap = await latestSnapshot(db, planId);
  if (!snap || snap.entries.length === 0) return { version: 0, startsAt: null as Date | null, rows: [] };
  const [w] = await db.select({ start: sql<string>`min(${planWindows.startsAt})`, end: sql<string>`max(${planWindows.endsAt})` }).from(planWindows).where(eq(planWindows.planId, planId));
  const startsAt = w?.start ? new Date(w.start) : null;
  const slotIds = snap.entries.map((e) => e.slotId);
  const personIds = snap.entries.map((e) => e.personId);
  const slotRows = await db
    .select({ id: slots.id, batch: slots.batch, role: slots.role, priority: slots.priority, intensity: slots.intensity, pointId: slots.pointId, point: planPoints.name, lat: planPoints.lat, lng: planPoints.lng, sectorId: sectors.id, sector: sectors.name, batches: sectors.batches, instructions: sectors.instructions, componentId: planComponents.id, component: planComponents.name })
    .from(slots)
    .innerJoin(sectors, eq(sectors.id, slots.sectorId))
    .innerJoin(planComponents, eq(planComponents.id, slots.planComponentId))
    .leftJoin(planPoints, eq(planPoints.id, slots.pointId))
    .where(inArray(slots.id, slotIds));
  const people = await db
    .select({ id: persons.id, name: persons.name, genNo: persons.genNo, phone: persons.phone, gender: persons.gender, dob: persons.dob, photoUrl: persons.photoUrl, rank: ranks.code, seniority: ranks.seniority, stationId: stations.id, station: stations.name })
    .from(persons)
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .innerJoin(stations, eq(stations.id, persons.stationId))
    .where(inArray(persons.id, personIds));
  const last = await db.execute<{ person_id: string; event: "check_in" | "check_out"; at: string; flagged: boolean; distance_m: number | null }>(sql`
    select distinct on (person_id) person_id, event, at, flagged, distance_m from attendance where plan_id = ${planId} order by person_id, at desc`);
  const lastBy = new Map(last.rows.map((r) => [r.person_id, r]));
  const late = startsAt ? now.getTime() > startsAt.getTime() + GRACE_MIN * 60e3 : false;
  const rows = snap.entries
    .map((e) => {
      const s = slotRows.find((x) => x.id === e.slotId);
      const p = people.find((x) => x.id === e.personId);
      if (!s || !p) return null;
      const l = lastBy.get(p.id);
      const status: AttendanceStatus = l ? (l.event === "check_in" ? "present" : "checked_out") : late ? "absent" : "pending";
      const { dob, ...person } = p;
      return {
        ...person,
        age: ageOn(dob, startsAt ?? now),
        slotId: s.id,
        posting: s.point ?? `${s.sector} ${s.role === "sector_incharge" ? "incharge" : "liaison"}`,
        role: s.role,
        batch: s.batch,
        batches: s.batches,
        sectorId: s.sectorId,
        sector: s.sector,
        componentId: s.componentId,
        component: s.component,
        priority: s.priority,
        lat: s.lat,
        lng: s.lng,
        instructions: s.instructions,
        status,
        lastAt: l ? new Date(l.at) : null,
        flagged: l?.flagged ?? false,
        distanceM: l?.distance_m ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.component.localeCompare(b.component) || a.sector.localeCompare(b.sector) || a.posting.localeCompare(b.posting) || a.seniority - b.seniority);
  return { version: snap.version, startsAt, rows };
}

export type Roster = Awaited<ReturnType<typeof getRoster>>;
export type RosterRow = Roster["rows"][number];

export function summarize(rows: { status: AttendanceStatus }[]) {
  const c = { total: rows.length, present: 0, absent: 0, pending: 0, checked_out: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

/** Record a check-in / check-out; flags it when far from the posting point. */
export async function recordAttendance(
  db: DbOrTx,
  input: { planId: string; personId: string; event: "check_in" | "check_out"; lat?: number | null; lng?: number | null; accuracyM?: number | null; via: "qr" | "manual"; recordedBy?: string | null },
) {
  const [plan] = await db.select({ status: plans.status, title: plans.title }).from(plans).where(eq(plans.id, input.planId)).limit(1);
  if (!plan || !["published", "live"].includes(plan.status)) return { ok: false as const, error: "Check-in is open only for published or live bandobasts." };
  const snap = await latestSnapshot(db, input.planId);
  const entry = snap?.entries.find((e) => e.personId === input.personId);
  if (!entry) return { ok: false as const, error: "This officer is not on the published duty roster." };
  const [pt] = await db.select({ lat: planPoints.lat, lng: planPoints.lng }).from(slots).leftJoin(planPoints, eq(planPoints.id, slots.pointId)).where(eq(slots.id, entry.slotId)).limit(1);
  const here = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null;
  const distanceM = here && pt?.lat != null && pt.lng != null ? metresBetween(here, { lat: pt.lat, lng: pt.lng }) : null;
  const flagged = distanceM !== null && distanceM > CHECKIN_RADIUS_M;
  await db.insert(attendance).values({ planId: input.planId, personId: input.personId, slotId: entry.slotId, event: input.event, lat: here?.lat ?? null, lng: here?.lng ?? null, accuracyM: input.accuracyM ?? null, distanceM, flagged, via: input.via, recordedBy: input.recordedBy ?? null });
  return { ok: true as const, distanceM, flagged, plan: plan.title };
}

/** Last event for one officer (for the check-in page). */
export async function lastEvent(db: DbOrTx, planId: string, personId: string) {
  const [r] = await db.select().from(attendance).where(and(eq(attendance.planId, planId), eq(attendance.personId, personId))).orderBy(desc(attendance.at)).limit(1);
  return r ?? null;
}


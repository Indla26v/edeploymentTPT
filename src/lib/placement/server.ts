import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { DbOrTx } from "../auth/accounts";
import type { CurrentUser } from "../auth/session";
import { assignments, persons, planComponents, planPersonnel, planPoints, planWindows, plans, preferences, ranks, sectors, slotPoints, slots, stations } from "../db/schema";
import { seesWholePlans } from "../plans/server";
import type { Officer, PointProfile, Slot } from "./rules";

export type BoardSlot = {
  id: string;
  planComponentId: string;
  sectorId: string;
  pointId: string | null;
  pointIds: string[];
  batch: number;
  rankId: string;
  rank: string;
  role: "member" | "sector_incharge" | "liaison";
  seq: number;
  priority: number;
  intensity: "high" | "medium" | "low";
  genderReq: "any" | "male" | "female";
  dropped: boolean;
};

export type BoardOfficer = {
  personId: string;
  name: string;
  genNo: string;
  phone: string | null;
  gender: "male" | "female";
  age: number;
  fitness: "fit" | "light_duty_only";
  rankId: string;
  rank: string;
  seniority: number;
  stationId: string;
  station: string;
  lat: number | null;
  lng: number | null;
  /** slot ids this officer was asked for (via a CO preference) */
  preferredSlotIds: string[];
};

export function ageOn(dob: string, on: Date): number {
  const d = new Date(`${dob}T00:00:00Z`);
  let a = on.getUTCFullYear() - d.getUTCFullYear();
  if (on.getUTCMonth() < d.getUTCMonth() || (on.getUTCMonth() === d.getUTCMonth() && on.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

/** Everything about a plan's placement (no scope filtering — callers decide what may be edited). */
export async function loadPlacement(db: DbOrTx, planId: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  const [w] = await db.select({ start: sql<string>`min(${planWindows.startsAt})` }).from(planWindows).where(eq(planWindows.planId, planId));
  const startsOn = w?.start ? new Date(w.start) : new Date();
  const comps = await db.select().from(planComponents).where(eq(planComponents.planId, planId)).orderBy(asc(planComponents.displayOrder));
  const secs = await db.select({ id: sectors.id, planComponentId: sectors.planComponentId, name: sectors.name, batches: sectors.batches, displayOrder: sectors.displayOrder }).from(sectors).where(eq(sectors.planId, planId)).orderBy(asc(sectors.displayOrder));
  const pts = await db
    .select({ id: planPoints.id, sectorId: planPoints.sectorId, planComponentId: planPoints.planComponentId, name: planPoints.name, lat: planPoints.lat, lng: planPoints.lng, priority: planPoints.priority, intensity: planPoints.intensity, mobility: planPoints.mobility, genderReq: planPoints.genderReq })
    .from(planPoints)
    .where(eq(planPoints.planId, planId))
    .orderBy(asc(planPoints.displayOrder));
  const slotRows = await db
    .select({ s: slots, rank: ranks.code, seniority: ranks.seniority })
    .from(slots)
    .innerJoin(ranks, eq(ranks.id, slots.rankId))
    .where(eq(slots.planId, planId))
    .orderBy(asc(slots.batch), asc(ranks.seniority), asc(slots.seq));
  const links = slotRows.length ? await db.select().from(slotPoints).where(inArray(slotPoints.slotId, slotRows.map((r) => r.s.id))) : [];
  const boardSlots: BoardSlot[] = slotRows.map(({ s, rank }) => ({
    id: s.id,
    planComponentId: s.planComponentId,
    sectorId: s.sectorId,
    pointId: s.pointId,
    pointIds: links.filter((l) => l.slotId === s.id).map((l) => l.pointId),
    batch: s.batch,
    rankId: s.rankId,
    rank,
    role: s.role,
    seq: s.seq,
    priority: s.priority,
    intensity: s.intensity,
    genderReq: s.genderReq,
    dropped: s.dropped,
  }));

  const pool = await db
    .select({
      personId: persons.id,
      name: persons.name,
      genNo: persons.genNo,
      phone: persons.phone,
      gender: persons.gender,
      dob: persons.dob,
      fitness: persons.fitness,
      rankId: persons.rankId,
      rank: ranks.code,
      seniority: ranks.seniority,
      stationId: stations.id,
      station: stations.name,
      lat: stations.lat,
      lng: stations.lng,
    })
    .from(planPersonnel)
    .innerJoin(persons, eq(persons.id, planPersonnel.personId))
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .innerJoin(stations, eq(stations.id, persons.stationId))
    .where(eq(planPersonnel.planId, planId))
    .orderBy(asc(ranks.seniority), asc(persons.name));
  const prefs = await db
    .select({ personId: preferences.personId, pointId: preferences.pointId, planComponentId: preferences.planComponentId })
    .from(preferences)
    .where(and(eq(preferences.planId, planId), eq(preferences.kind, "person"), eq(preferences.status, "active")));
  const officers: BoardOfficer[] = pool.map((p) => {
    const mine = prefs.filter((x) => x.personId === p.personId);
    const preferredSlotIds = boardSlots
      .filter((s) => s.role === "member" && mine.some((m) => (m.pointId ? s.pointIds.includes(m.pointId) : s.planComponentId === m.planComponentId)))
      .map((s) => s.id);
    const { dob, ...rest } = p;
    return { ...rest, age: ageOn(dob, startsOn), preferredSlotIds };
  });

  const current = await db.select().from(assignments).where(eq(assignments.planId, planId));
  return { plan: plan!, components: comps, sectors: secs, points: pts, slots: boardSlots, officers, assignments: current };
}

export type Placement = Awaited<ReturnType<typeof loadPlacement>>;

/** Components the user may place in: the IO all of them, a CO their own. */
export function editableComponents(user: CurrentUser, p: Placement): Set<string> {
  if (user.activeRole === "INITIATING_OFFICER" && user.permissions.has("placement.override")) return new Set(p.components.map((c) => c.id));
  if (user.activeRole === "COMPONENT_OFFICER" && user.permissions.has("placement.edit_own_component")) return new Set(p.components.filter((c) => c.coUserId === user.id).map((c) => c.id));
  return new Set();
}

export function canSeePlacement(user: CurrentUser, p: Placement): boolean {
  return seesWholePlans(user) || p.components.some((c) => c.coUserId === user.id);
}

/** Rule-engine view of a slot: each slot is its own "point" carrying the (merged) point profile. */
export function engineSlot(s: BoardSlot, p: Placement): { slot: Slot; point: PointProfile } {
  const primary = p.points.find((x) => x.id === s.pointId);
  const sector = p.sectors.find((x) => x.id === s.sectorId);
  return {
    slot: { id: s.id, pointId: s.id, rankCode: s.rank, role: s.role === "member" ? "regular" : s.role },
    point: {
      id: s.id,
      name: primary?.name ?? `${sector?.name ?? "Sector"} ${s.role === "sector_incharge" ? "incharge" : "liaison"}`,
      priority: Math.min(4, Math.max(1, s.priority)) as 1 | 2 | 3 | 4,
      intensity: s.intensity,
      mobility: primary?.mobility ?? "static",
      genderReq: s.genderReq,
      lat: primary?.lat ?? undefined,
      lng: primary?.lng ?? undefined,
    },
  };
}

export function engineOfficer(o: BoardOfficer): Officer {
  return {
    id: o.personId,
    name: o.name,
    rankCode: o.rank,
    rankSeniority: o.seniority,
    age: o.age,
    gender: o.gender,
    fitness: o.fitness,
    stationName: o.station,
    homeLat: o.lat ?? undefined,
    homeLng: o.lng ?? undefined,
    preferredPointIds: o.preferredSlotIds,
  };
}


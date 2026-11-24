import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { CurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { accommodationAllotments, accommodations, equipmentAllocations, equipmentStock, equipmentTypes, idCardHeaders, planComponents, planEquipmentRequirements, planPublications, planWindows, plans, stations } from "@/lib/db/schema";
import { getRoster } from "@/lib/execution/server";
import { loadPlan } from "@/lib/plans/server";

/** Roster for screens: a CO sees their own components only. */
export async function scopedRoster(user: CurrentUser, planId: string) {
  const db = getDb();
  const plan = await loadPlan(db, user, planId);
  const roster = await getRoster(db, plan.id);
  let rows = roster.rows;
  if (user.activeRole === "COMPONENT_OFFICER") {
    const mine = await db.select({ id: planComponents.id }).from(planComponents).where(and(eq(planComponents.planId, plan.id), eq(planComponents.coUserId, user.id)));
    rows = rows.filter((r) => mine.some((m) => m.id === r.componentId));
  }
  return { plan, ...roster, rows };
}

export async function getDocumentsData(user: CurrentUser, planId: string) {
  const r = await scopedRoster(user, planId);
  const headers = await getDb().select({ id: idCardHeaders.id, title: idCardHeaders.title }).from(idCardHeaders).where(eq(idCardHeaders.unitId, r.plan.unitId));
  const comps = [...new Map(r.rows.map((x) => [x.componentId, x.component])).entries()].map(([id, name]) => ({ id, name }));
  const sectors = [...new Map(r.rows.map((x) => [x.sectorId, { id: x.sectorId, name: x.sector, componentId: x.componentId }])).values()];
  const stationsUsed = [...new Map(r.rows.map((x) => [x.stationId, x.station])).entries()].map(([id, name]) => ({ id, name, n: r.rows.filter((y) => y.stationId === id).length }));
  return { ...r, headers, components: comps, sectors, stations: stationsUsed };
}

export async function getAccommodationData(user: CurrentUser, planId: string) {
  const db = getDb();
  const r = await scopedRoster(user, planId);
  const lodgings = await db.select().from(accommodations).where(eq(accommodations.unitId, r.plan.unitId)).orderBy(asc(accommodations.name));
  const allot = await db.select().from(accommodationAllotments).where(eq(accommodationAllotments.planId, r.plan.id));
  const [w] = await db.select({ start: sql<string>`min(${planWindows.startsAt})`, end: sql<string>`max(${planWindows.endsAt})` }).from(planWindows).where(eq(planWindows.planId, r.plan.id));
  return { ...r, lodgings, allotments: allot, startsAt: w?.start ? new Date(w.start) : null, endsAt: w?.end ? new Date(w.end) : null };
}

export async function getEquipmentData(user: CurrentUser, planId: string) {
  const db = getDb();
  const plan = await loadPlan(db, user, planId);
  const types = await db.select({ id: equipmentTypes.id, name: equipmentTypes.name }).from(equipmentTypes).where(eq(equipmentTypes.unitId, plan.unitId)).orderBy(asc(equipmentTypes.name));
  const need = await db
    .select({ equipmentTypeId: planEquipmentRequirements.equipmentTypeId, planComponentId: planEquipmentRequirements.planComponentId, component: planComponents.name, quantity: planEquipmentRequirements.quantity, note: planEquipmentRequirements.note })
    .from(planEquipmentRequirements)
    .innerJoin(planComponents, eq(planComponents.id, planEquipmentRequirements.planComponentId))
    .where(eq(planEquipmentRequirements.planId, plan.id));
  const allocations = await db
    .select({ a: equipmentAllocations, station: stations.name, type: equipmentTypes.name })
    .from(equipmentAllocations)
    .innerJoin(stations, eq(stations.id, equipmentAllocations.stationId))
    .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentAllocations.equipmentTypeId))
    .where(eq(equipmentAllocations.planId, plan.id))
    .orderBy(asc(equipmentTypes.name), asc(stations.displayOrder));
  const free = await db.execute<{ station_id: string; station: string; type_id: string; working: number; free: number }>(sql`
    select s.station_id, st.name station, s.equipment_type_id type_id, s.working,
      greatest(0, s.working - coalesce((select sum(a.quantity - a.returned_qty) from equipment_allocations a join plans p on p.id = a.plan_id
        where a.station_id = s.station_id and a.equipment_type_id = s.equipment_type_id and p.status not in ('completed','cancelled')), 0))::int free
    from ${equipmentStock} s join ${stations} st on st.id = s.station_id where s.unit_id = ${plan.unitId} order by st.display_order`);
  return { plan, types, need, allocations, free: free.rows };
}

/** Equipment drawn from the Office Incharge's station(s). */
export async function listStationEquipment(user: CurrentUser) {
  const ids = user.assignments.map((a) => a.stationId).filter((x): x is string => !!x);
  if (!ids.length) return [];
  return getDb()
    .select({ a: equipmentAllocations, type: equipmentTypes.name, station: stations.name, plan: plans.title, planStatus: plans.status })
    .from(equipmentAllocations)
    .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentAllocations.equipmentTypeId))
    .innerJoin(stations, eq(stations.id, equipmentAllocations.stationId))
    .innerJoin(plans, eq(plans.id, equipmentAllocations.planId))
    .where(inArray(equipmentAllocations.stationId, ids))
    .orderBy(desc(equipmentAllocations.createdAt));
}

/** Plans with a published roster that includes the OI's station officers, or the officer themself. */
export async function listDutyPassPlans(user: CurrentUser) {
  const db = getDb();
  const pubs = await db
    .select({ planId: planPublications.planId, snapshot: planPublications.snapshot, version: planPublications.version })
    .from(planPublications)
    .innerJoin(plans, eq(plans.id, planPublications.planId))
    .where(inArray(plans.status, ["published", "live", "completed"]))
    .orderBy(desc(planPublications.version));
  const latest = new Map<string, (typeof pubs)[number]>();
  for (const p of pubs) if (!latest.has(p.planId)) latest.set(p.planId, p);
  const out: { planId: string; count: number }[] = [];
  const stationIds = user.assignments.map((a) => a.stationId).filter((x): x is string => !!x);
  const people = stationIds.length ? (await db.execute<{ id: string }>(sql`select id from persons where station_id in (${sql.join(stationIds.map((s) => sql`${s}::uuid`), sql`, `)})`)).rows.map((r) => r.id) : [];
  for (const p of latest.values()) {
    const n = user.activeRole === "OFFICE_INCHARGE" ? p.snapshot.filter((e) => people.includes(e.personId)).length : p.snapshot.filter((e) => e.personId === user.personId).length;
    if (n) out.push({ planId: p.planId, count: n });
  }
  if (!out.length) return [];
  const ps = await db
    .select({ id: plans.id, title: plans.title, code: plans.code, status: plans.status, venue: plans.venue, startsAt: sql<string>`(select min(starts_at) from plan_windows w where w.plan_id = "plans"."id")`, endsAt: sql<string>`(select max(ends_at) from plan_windows w where w.plan_id = "plans"."id")` })
    .from(plans)
    .where(inArray(plans.id, out.map((o) => o.planId)));
  return ps.map((p) => ({ ...p, startsAt: p.startsAt ? new Date(p.startsAt) : null, endsAt: p.endsAt ? new Date(p.endsAt) : null, count: out.find((o) => o.planId === p.id)!.count, stationId: stationIds[0] ?? null }));
}

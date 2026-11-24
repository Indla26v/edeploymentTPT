import "server-only";

import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/lib/db";
import { deploymentPoints, divisions, persons, ranks, stations, transferRequests, units } from "@/lib/db/schema";

const NONE = ["00000000-0000-0000-0000-000000000000"];

/**
 * Dashboard figures for one unit (the signed-in user's unit; callers enforce scope).
 * `stationIds` narrows everything to those stations (an Office Incharge sees only their own).
 */
export async function getUnitDashboard(unitId: string, stationIds: string[] | null = null) {
  const onlyStations = (col: typeof persons.stationId | typeof stations.id) => (stationIds ? inArray(col, stationIds.length ? stationIds : NONE) : undefined);
  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  if (!unit) return null;

  const [totals] = await db
    .select({
      persons: count(),
      available: sql<number>`count(*) filter (where ${persons.availability} = 'available')`.mapWith(Number),
      lightDuty: sql<number>`count(*) filter (where ${persons.fitness} = 'light_duty_only')`.mapWith(Number),
      women: sql<number>`count(*) filter (where ${persons.gender} = 'female')`.mapWith(Number),
    })
    .from(persons)
    .where(and(eq(persons.unitId, unit.id), eq(persons.isActive, true), onlyStations(persons.stationId)));

  const [stationCount] = await db.select({ n: count() }).from(stations).where(and(eq(stations.unitId, unit.id), onlyStations(stations.id)));

  const byRank = await db
    .select({
      code: ranks.code,
      category: ranks.category,
      total: count(),
      available: sql<number>`count(*) filter (where ${persons.availability} = 'available')`.mapWith(Number),
    })
    .from(persons)
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .where(and(eq(persons.unitId, unit.id), eq(persons.isActive, true), onlyStations(persons.stationId)))
    .groupBy(ranks.code, ranks.category, ranks.seniority)
    .orderBy(asc(ranks.seniority));

  const incharge = alias(persons, "incharge");
  const inchargeRank = alias(ranks, "incharge_rank");
  const stationRows = await db
    .select({
      id: stations.id,
      name: stations.name,
      kind: stations.kind,
      division: divisions.name,
      inchargeName: incharge.name,
      inchargeRank: inchargeRank.code,
      strength: sql<number>`(select count(*) from ${persons} p where p.station_id = ${stations.id} and p.is_active)`.mapWith(Number),
      available: sql<number>`(select count(*) from ${persons} p where p.station_id = ${stations.id} and p.is_active and p.availability = 'available')`.mapWith(Number),
    })
    .from(stations)
    .innerJoin(divisions, eq(divisions.id, stations.divisionId))
    .leftJoin(incharge, eq(incharge.id, stations.inchargePersonId))
    .leftJoin(inchargeRank, eq(inchargeRank.id, incharge.rankId))
    .where(and(eq(stations.unitId, unit.id), onlyStations(stations.id)))
    .orderBy(asc(stations.displayOrder));

  return {
    unit,
    totals: { ...totals!, stations: stationCount!.n },
    byRank,
    stations: stationRows,
  };
}

/** State-level overview: one row per unit. */
export async function getStateOverview() {
  return getDb()
    .select({
      id: units.id,
      name: units.name,
      type: units.type,
      persons: sql<number>`(select count(*) from ${persons} p where p.unit_id = ${units.id})`.mapWith(Number),
      available: sql<number>`(select count(*) from ${persons} p where p.unit_id = ${units.id} and p.availability = 'available')`.mapWith(Number),
      stations: sql<number>`(select count(*) from ${stations} s where s.unit_id = ${units.id})`.mapWith(Number),
    })
    .from(units)
    .orderBy(asc(units.displayOrder));
}

/** Counts behind the dashboard's "Needs attention" strip. */
export async function getAttention(unitId: string, stationIds: string[] | null) {
  const db = getDb();
  const st = stationIds ? inArray(transferRequests.fromStationId, stationIds.length ? stationIds : NONE) : undefined;
  const [[transfers], [noIncharge], [points]] = await Promise.all([
    db.select({ n: count() }).from(transferRequests).where(and(eq(transferRequests.unitId, unitId), eq(transferRequests.status, "pending"), st)),
    db.select({ n: count() }).from(stations).where(and(eq(stations.unitId, unitId), isNull(stations.inchargePersonId))),
    db.select({ n: count() }).from(deploymentPoints).where(and(eq(deploymentPoints.unitId, unitId), eq(deploymentPoints.isActive, true))),
  ]);
  return { pendingTransfers: transfers!.n, stationsWithoutIncharge: noIncharge!.n, points: points!.n };
}

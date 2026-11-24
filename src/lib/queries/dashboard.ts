import "server-only";

import { asc, count, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/lib/db";
import { divisions, persons, ranks, stations, units } from "@/lib/db/schema";

/**
 * Dashboard figures for a unit. Phase 2 derives `unitCode` from the signed-in user's role scope;
 * until then the demo unit is used.
 */
export async function getUnitDashboard(unitCode: string) {
  const db = getDb();
  const [unit] = await db.select().from(units).where(eq(units.code, unitCode)).limit(1);
  if (!unit) return null;

  const [totals] = await db
    .select({
      persons: count(),
      available: sql<number>`count(*) filter (where ${persons.availability} = 'available')`.mapWith(Number),
      lightDuty: sql<number>`count(*) filter (where ${persons.fitness} = 'light_duty_only')`.mapWith(Number),
      women: sql<number>`count(*) filter (where ${persons.gender} = 'female')`.mapWith(Number),
    })
    .from(persons)
    .where(eq(persons.unitId, unit.id));

  const [stationCount] = await db.select({ n: count() }).from(stations).where(eq(stations.unitId, unit.id));

  const byRank = await db
    .select({
      code: ranks.code,
      category: ranks.category,
      total: count(),
      available: sql<number>`count(*) filter (where ${persons.availability} = 'available')`.mapWith(Number),
    })
    .from(persons)
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .where(eq(persons.unitId, unit.id))
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
      strength: sql<number>`(select count(*) from ${persons} p where p.station_id = ${stations.id})`.mapWith(Number),
      available: sql<number>`(select count(*) from ${persons} p where p.station_id = ${stations.id} and p.availability = 'available')`.mapWith(Number),
    })
    .from(stations)
    .innerJoin(divisions, eq(divisions.id, stations.divisionId))
    .leftJoin(incharge, eq(incharge.id, stations.inchargePersonId))
    .leftJoin(inchargeRank, eq(inchargeRank.id, incharge.rankId))
    .where(eq(stations.unitId, unit.id))
    .orderBy(asc(stations.displayOrder));

  return {
    unit,
    totals: { ...totals!, stations: stationCount!.n },
    byRank,
    stations: stationRows,
  };
}

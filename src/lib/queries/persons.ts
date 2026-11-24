import "server-only";

import { and, asc, eq, ilike, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { persons, ranks, stations } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { stationScope, unitScope } from "@/lib/authz/scoped";
import type { PersonOption } from "@/components/pickers/person-picker";

/** Officer search for pickers, always limited to the caller's unit / station scope. */
export async function searchPersons(user: CurrentUser, q: string, opts: { limit?: number; rankCodes?: string[] } = {}): Promise<PersonOption[]> {
  const term = q.trim();
  const rows = await getDb()
    .select({ id: persons.id, name: persons.name, rank: ranks.code, genNo: persons.genNo, station: stations.name, phone: persons.phone })
    .from(persons)
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .innerJoin(stations, eq(stations.id, persons.stationId))
    .where(
      and(
        eq(persons.isActive, true),
        unitScope(user, persons.unitId),
        stationScope(user, persons.stationId),
        term ? or(ilike(persons.name, `%${term}%`), ilike(persons.genNo, `${term}%`), ilike(persons.phone, `%${term}%`)) : sql`true`,
        opts.rankCodes?.length ? sql`${ranks.code} = any(${opts.rankCodes})` : sql`true`,
      ),
    )
    .orderBy(asc(ranks.seniority), asc(persons.name))
    .limit(opts.limit ?? 20);
  return rows;
}

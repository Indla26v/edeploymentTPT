import "server-only";

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { persons, ranks, roleAssignments, stations, units, users } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { scopeUnitIds } from "@/lib/authz/authorize";
import type { Role } from "@/lib/authz/roles";

export type UserRow = {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  person: { id: string; rank: string; genNo: string; station: string } | null;
  assignments: { id: string; role: Role; unitId: string | null; stationId: string | null; planId: string | null; scopeLabel: string }[];
};

/** Users visible to the caller: all for state admins, otherwise users tied to the caller's units. */
export async function listUsers(user: CurrentUser): Promise<UserRow[]> {
  const db = getDb();
  const unitIds = scopeUnitIds(user);
  const visibleIds =
    unitIds === null
      ? null
      : unitIds.length === 0
        ? []
        : (
            await db
              .selectDistinct({ id: users.id })
              .from(users)
              .leftJoin(persons, eq(persons.id, users.personId))
              .leftJoin(roleAssignments, eq(roleAssignments.userId, users.id))
              .where(or(inArray(persons.unitId, unitIds), inArray(roleAssignments.unitId, unitIds)))
          ).map((r) => r.id);
  if (visibleIds && visibleIds.length === 0) return [];

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      lockedUntil: users.lockedUntil,
      lastLoginAt: users.lastLoginAt,
      personId: persons.id,
      rank: ranks.code,
      genNo: persons.genNo,
      station: stations.name,
    })
    .from(users)
    .leftJoin(persons, eq(persons.id, users.personId))
    .leftJoin(ranks, eq(ranks.id, persons.rankId))
    .leftJoin(stations, eq(stations.id, persons.stationId))
    .where(visibleIds ? inArray(users.id, visibleIds) : sql`true`)
    .orderBy(asc(users.username));

  const ids = rows.map((r) => r.id);
  const asg = ids.length
    ? await db
        .select({
          id: roleAssignments.id,
          userId: roleAssignments.userId,
          role: roleAssignments.role,
          unitId: roleAssignments.unitId,
          stationId: roleAssignments.stationId,
          planId: roleAssignments.planId,
          unitName: units.name,
          stationName: stations.name,
        })
        .from(roleAssignments)
        .leftJoin(units, eq(units.id, roleAssignments.unitId))
        .leftJoin(stations, eq(stations.id, roleAssignments.stationId))
        .where(and(inArray(roleAssignments.userId, ids), eq(roleAssignments.isActive, true)))
    : [];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username ?? "",
    isActive: r.isActive,
    mustChangePassword: r.mustChangePassword,
    lockedUntil: r.lockedUntil && r.lockedUntil > new Date() ? r.lockedUntil.toISOString() : null,
    lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
    person: r.personId ? { id: r.personId, rank: r.rank ?? "", genNo: r.genNo ?? "", station: r.station ?? "" } : null,
    assignments: asg
      .filter((a) => a.userId === r.id)
      .map((a) => ({
        id: a.id,
        role: a.role as Role,
        unitId: a.unitId,
        stationId: a.stationId,
        planId: a.planId,
        scopeLabel: a.planId ? "Plan" : (a.stationName ?? a.unitName ?? "State"),
      })),
  }));
}

/** Units and stations the caller may grant roles in. */
export async function grantableScopes(user: CurrentUser) {
  const db = getDb();
  const unitIds = scopeUnitIds(user);
  const unitRows = await db
    .select({ id: units.id, name: units.name })
    .from(units)
    .where(unitIds === null ? sql`true` : unitIds.length ? inArray(units.id, unitIds) : sql`false`)
    .orderBy(asc(units.displayOrder));
  const stationRows = await db
    .select({ id: stations.id, name: stations.name, unitId: stations.unitId })
    .from(stations)
    .where(unitIds === null ? sql`true` : unitIds.length ? inArray(stations.unitId, unitIds) : sql`false`)
    .orderBy(asc(stations.displayOrder));
  return { units: unitRows, stations: stationRows };
}


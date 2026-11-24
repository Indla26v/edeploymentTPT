import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "../db";
import { persons, ranks, roleAssignments, rolePermissions, stations, units, users } from "../db/schema";
import type { PermissionKey } from "../authz/permissions";
import { ROLE_PRIORITY, type Role } from "../authz/roles";
import { getAuth } from "./server";
import type { DbOrTx } from "./accounts";

export type Assignment = {
  id: string;
  role: Role;
  unitId: string | null;
  stationId: string | null;
  planId: string | null;
  planComponentId: string | null;
  departmentId: string | null;
};

export type CurrentUser = {
  id: string;
  name: string;
  username: string;
  personId: string | null;
  designation: string;
  unitId: string | null;
  unitName: string;
  stationId: string | null;
  mustChangePassword: boolean;
  sessionToken: string;
  roles: Role[];
  activeRole: Role;
  /** Assignments of the active role — these define what the user can see right now. */
  assignments: Assignment[];
  allAssignments: Assignment[];
  permissions: Set<PermissionKey>;
};

/** Reads the session cookie and loads the user, roles, scope and permissions. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const requested = (session.session as { activeRole?: string | null }).activeRole as Role | null | undefined;
  return loadUser(getDb(), session.user.id, requested ?? null, session.session.token);
});

/** Builds the CurrentUser (roles, scope, permissions) for a user id. Exported for tests and background jobs. */
export async function loadUser(db: DbOrTx, userId: string, requested: Role | null, sessionToken = ""): Promise<CurrentUser | null> {

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      isActive: users.isActive,
      personId: users.personId,
      mustChangePassword: users.mustChangePassword,
      rankName: ranks.name,
      stationId: persons.stationId,
      personUnitId: persons.unitId,
    })
    .from(users)
    .leftJoin(persons, eq(persons.id, users.personId))
    .leftJoin(ranks, eq(ranks.id, persons.rankId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || !row.isActive) return null;

  const all = (await db
    .select({
      id: roleAssignments.id,
      role: roleAssignments.role,
      unitId: roleAssignments.unitId,
      stationId: roleAssignments.stationId,
      planId: roleAssignments.planId,
      planComponentId: roleAssignments.planComponentId,
      departmentId: roleAssignments.departmentId,
    })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.userId, row.id), eq(roleAssignments.isActive, true)))) as Assignment[];

  const roles = ROLE_PRIORITY.filter((r) => all.some((a) => a.role === r));
  const activeRole: Role = requested && roles.includes(requested) ? requested : (roles[0] ?? "PERSONNEL");
  const assignments = all.filter((a) => a.role === activeRole);

  const perms = roles.length
    ? await db.select({ key: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.role, activeRole))
    : [];

  // Primary unit for headings: from the active assignments, else the person's own unit.
  const unitId = assignments.find((a) => a.unitId)?.unitId ?? row.personUnitId ?? null;
  let unitName = "eDeployment";
  if (unitId) {
    const [u] = await db.select({ name: units.name }).from(units).where(eq(units.id, unitId)).limit(1);
    if (u) unitName = u.name;
  } else if (activeRole === "SUPER_ADMIN" || activeRole === "DGP") {
    unitName = "State Police — all units";
  }
  const stationId = assignments.find((a) => a.stationId)?.stationId ?? row.stationId ?? null;
  if (activeRole === "OFFICE_INCHARGE" && stationId) {
    const [s] = await db.select({ name: stations.name }).from(stations).where(inArray(stations.id, [stationId])).limit(1);
    if (s) unitName = `${s.name} · ${unitName}`;
  }

  return {
    id: row.id,
    name: row.name,
    username: row.username ?? "",
    personId: row.personId,
    designation: row.rankName ?? (activeRole === "SUPER_ADMIN" ? "State administrator" : "Officer"),
    unitId,
    unitName,
    stationId,
    mustChangePassword: row.mustChangePassword,
    sessionToken,
    roles,
    activeRole,
    assignments,
    allAssignments: all,
    permissions: new Set(perms.map((p) => p.key as PermissionKey)),
  };
}

/** Use in pages/layouts: redirects to login when signed out, and to the password page when a change is required. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password?required=1");
  return user;
}

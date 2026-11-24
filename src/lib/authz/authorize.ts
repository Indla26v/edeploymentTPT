import "server-only";

import type { CurrentUser } from "../auth/session";
import { requireUser } from "../auth/session";
import type { PermissionKey } from "./permissions";

/** Thrown when the signed-in user lacks a permission or scope. Caught by `mutate` and turned into a message. */
export class AuthzError extends Error {
  constructor(message = "You don't have permission to do this.") {
    super(message);
    this.name = "AuthzError";
  }
}

/** Errors whose message is safe and useful to show to the user (validation of business rules). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function can(user: Pick<CurrentUser, "permissions">, permission: PermissionKey): boolean {
  return user.permissions.has(permission);
}

export async function authorize(permission: PermissionKey): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) throw new AuthzError();
  return user;
}

/** State-level roles see every unit. */
export function isStateLevel(user: Pick<CurrentUser, "activeRole">): boolean {
  return user.activeRole === "SUPER_ADMIN" || user.activeRole === "DGP";
}

/** Units the active role may act on; `null` means all units. */
export function scopeUnitIds(user: Pick<CurrentUser, "activeRole" | "assignments" | "unitId">): string[] | null {
  if (isStateLevel(user)) return null;
  const ids = new Set(user.assignments.map((a) => a.unitId).filter((x): x is string => !!x));
  if (ids.size === 0 && user.unitId) ids.add(user.unitId);
  return [...ids];
}

/** Stations the active role is limited to; `null` means not station-limited (unit-wide or state-wide). */
export function scopeStationIds(user: Pick<CurrentUser, "activeRole" | "assignments">): string[] | null {
  if (user.activeRole !== "OFFICE_INCHARGE") return null;
  return user.assignments.map((a) => a.stationId).filter((x): x is string => !!x);
}

export function assertUnit(user: CurrentUser, unitId: string) {
  const ids = scopeUnitIds(user);
  if (ids && !ids.includes(unitId)) throw new AuthzError("That record belongs to another unit.");
}

export function assertStation(user: CurrentUser, stationId: string, unitIdOfStation: string) {
  assertUnit(user, unitIdOfStation);
  const ids = scopeStationIds(user);
  if (ids && !ids.includes(stationId)) throw new AuthzError("That record belongs to another station.");
}

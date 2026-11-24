import type { Role } from "./roles";

/** Which scope a role assignment needs. Plan-scoped CO/IO assignments are created by the plan workflow. */
export function scopeKindFor(role: Role): "state" | "unit" | "station" {
  if (role === "SUPER_ADMIN" || role === "DGP") return "state";
  if (role === "OFFICE_INCHARGE") return "station";
  return "unit";
}

/** Roles a user acting as `granter` may hand out. Unit Officers cannot create state-level or other Unit Officers. */
export function assignableRoles(granter: Role): Role[] {
  if (granter === "SUPER_ADMIN") {
    return ["SUPER_ADMIN", "DGP", "UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER", "OFFICE_INCHARGE", "OFFICE_MANAGER", "EMPLOYEE", "PERSONNEL"];
  }
  if (granter === "UNIT_OFFICER") return ["INITIATING_OFFICER", "COMPONENT_OFFICER", "OFFICE_INCHARGE", "OFFICE_MANAGER", "EMPLOYEE", "PERSONNEL"];
  return [];
}

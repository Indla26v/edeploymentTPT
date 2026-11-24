/**
 * Roles from the two eDeployment manuals. A user can hold several roles at once
 * (each scoped to a unit / station / plan / component) and switches between them in the header.
 */
export const ROLES = [
  "SUPER_ADMIN",
  "UNIT_OFFICER",
  "INITIATING_OFFICER",
  "COMPONENT_OFFICER",
  "OFFICE_INCHARGE",
  "OFFICE_MANAGER",
  "EMPLOYEE",
  "PERSONNEL",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "State Admin",
  UNIT_OFFICER: "Unit Officer",
  INITIATING_OFFICER: "Initiating Officer",
  COMPONENT_OFFICER: "Component Officer",
  OFFICE_INCHARGE: "Office Incharge",
  OFFICE_MANAGER: "Office Manager",
  EMPLOYEE: "Employee",
  PERSONNEL: "Personnel",
};

export const ROLE_SHORT: Record<Role, string> = {
  SUPER_ADMIN: "Admin",
  UNIT_OFFICER: "UO",
  INITIATING_OFFICER: "IO",
  COMPONENT_OFFICER: "CO",
  OFFICE_INCHARGE: "OI",
  OFFICE_MANAGER: "OM",
  EMPLOYEE: "Staff",
  PERSONNEL: "Personnel",
};

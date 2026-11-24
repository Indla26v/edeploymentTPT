import type { Role } from "./roles";

/**
 * Permission catalogue. Seeded into the `permissions` table; `roles` are the default grants written to
 * `role_permissions` on first seed. The State Admin can change grants later (Admin → Roles & permissions).
 * Scope (which unit/station/plan) is enforced separately by the role assignment, never by the permission alone.
 */
export const PERMISSIONS = [
  // Overview & admin
  { key: "dashboard.view", module: "Dashboard", label: "View dashboard", roles: ["SUPER_ADMIN", "DGP", "UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER", "OFFICE_INCHARGE", "OFFICE_MANAGER", "EMPLOYEE", "PERSONNEL"] },
  { key: "admin.users.manage", module: "Administration", label: "Manage users", roles: ["SUPER_ADMIN", "UNIT_OFFICER"] },
  { key: "admin.roles.manage", module: "Administration", label: "Manage roles & permissions", roles: ["SUPER_ADMIN"] },
  { key: "audit.view", module: "Administration", label: "View audit log", roles: ["SUPER_ADMIN", "UNIT_OFFICER"] },

  // Masters
  { key: "masters.view", module: "Masters", label: "View masters", roles: ["SUPER_ADMIN", "DGP", "UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER", "OFFICE_INCHARGE"] },
  { key: "masters.ranks.manage", module: "Masters", label: "Manage police ranks", roles: ["SUPER_ADMIN"] },
  { key: "masters.units.manage", module: "Masters", label: "Manage state police units", roles: ["SUPER_ADMIN"] },
  { key: "masters.stations.manage", module: "Masters", label: "Manage stations / offices", roles: ["SUPER_ADMIN", "UNIT_OFFICER"] },
  { key: "masters.persons.manage", module: "Masters", label: "Manage police persons", roles: ["SUPER_ADMIN", "UNIT_OFFICER", "OFFICE_INCHARGE"] },
  { key: "masters.components.manage", module: "Masters", label: "Manage components", roles: ["UNIT_OFFICER"] },
  { key: "masters.points.manage", module: "Masters", label: "Manage deployment points", roles: ["UNIT_OFFICER", "COMPONENT_OFFICER"] },
  { key: "masters.equipment.manage", module: "Masters", label: "Manage equipment", roles: ["UNIT_OFFICER", "COMPONENT_OFFICER"] },
  { key: "masters.accommodation.manage", module: "Masters", label: "Manage accommodation", roles: ["UNIT_OFFICER"] },
  { key: "masters.vehicles.manage", module: "Masters", label: "Manage vehicles", roles: ["UNIT_OFFICER"] },
  { key: "masters.teams.manage", module: "Masters", label: "Manage teams", roles: ["UNIT_OFFICER"] },
  { key: "masters.shifts.manage", module: "Masters", label: "Manage shifts", roles: ["UNIT_OFFICER", "COMPONENT_OFFICER"] },
  { key: "masters.instructions.manage", module: "Masters", label: "Manage instructions library", roles: ["UNIT_OFFICER"] },
  { key: "masters.idcards.manage", module: "Masters", label: "Manage ID card headers", roles: ["UNIT_OFFICER"] },
  { key: "masters.unitprofile.manage", module: "Masters", label: "Manage unit profile", roles: ["UNIT_OFFICER"] },
  { key: "transfers.request", module: "Masters", label: "Request officer transfer", roles: ["OFFICE_INCHARGE", "UNIT_OFFICER"] },
  { key: "transfers.approve", module: "Masters", label: "Approve transfers", roles: ["UNIT_OFFICER"] },

  // Security plans
  { key: "plans.view", module: "Security plans", label: "View security plans", roles: ["SUPER_ADMIN", "DGP", "UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER", "OFFICE_INCHARGE"] },
  { key: "plans.initiate", module: "Security plans", label: "Initiate / reuse plans", roles: ["UNIT_OFFICER", "INITIATING_OFFICER"] },
  { key: "plans.propose", module: "Security plans", label: "Propose component plan", roles: ["COMPONENT_OFFICER"] },
  { key: "plans.consolidate", module: "Security plans", label: "Consolidate and send to Unit Officer", roles: ["INITIATING_OFFICER"] },
  { key: "force.distribute", module: "Force sourcing", label: "Distribute force to stations", roles: ["UNIT_OFFICER"] },
  { key: "force.accept_shortfall", module: "Force sourcing", label: "Accept shortfall / top-up", roles: ["UNIT_OFFICER"] },
  { key: "force.respond", module: "Force sourcing", label: "Respond to force requests (commit + nominal roll)", roles: ["OFFICE_INCHARGE", "UNIT_OFFICER"] },
  { key: "placement.edit_own_component", module: "Placement", label: "Place officers in own component", roles: ["COMPONENT_OFFICER", "INITIATING_OFFICER"] },
  { key: "placement.override", module: "Placement", label: "Move officers across components / lock", roles: ["INITIATING_OFFICER"] },
  { key: "plans.publish", module: "Placement", label: "Publish duty allocation", roles: ["INITIATING_OFFICER"] },

  // Execution
  { key: "execution.idcards", module: "Execution", label: "Generate ID cards", roles: ["UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER"] },
  { key: "execution.live", module: "Execution", label: "Live monitoring", roles: ["UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER", "DGP"] },
  { key: "execution.accommodation", module: "Execution", label: "Allot accommodation", roles: ["UNIT_OFFICER"] },
  { key: "execution.equipment", module: "Execution", label: "Distribute equipment", roles: ["UNIT_OFFICER", "OFFICE_INCHARGE"] },
  { key: "dutypass.view", module: "Execution", label: "View duty passes", roles: ["OFFICE_INCHARGE", "PERSONNEL", "UNIT_OFFICER"] },

  // Office Manager
  { key: "office.tasks.manage", module: "Office", label: "Create / verify tasks", roles: ["OFFICE_MANAGER"] },
  { key: "office.tasks.work", module: "Office", label: "Work on assigned tasks", roles: ["OFFICE_MANAGER", "EMPLOYEE"] },
  { key: "office.meetings.manage", module: "Office", label: "Schedule meetings & MOM", roles: ["OFFICE_MANAGER"] },
  { key: "office.meetings.attend", module: "Office", label: "View meetings to attend", roles: ["OFFICE_MANAGER", "EMPLOYEE"] },
  { key: "office.appointments.manage", module: "Office", label: "Manage appointments & visitors", roles: ["OFFICE_MANAGER"] },
  { key: "office.reports.view", module: "Office", label: "MIS reports & person-wise analysis", roles: ["OFFICE_MANAGER", "UNIT_OFFICER"] },
  { key: "office.notes", module: "Office", label: "Personal notes", roles: ["OFFICE_MANAGER", "EMPLOYEE"] },

  // DGP / inter-district
  { key: "dgp.distribute", module: "Inter-district", label: "Distribute force across units", roles: ["DGP"] },
  { key: "force.escalate", module: "Inter-district", label: "Send requirement to Chief Office", roles: ["UNIT_OFFICER"] },
  { key: "force.respond_unit", module: "Inter-district", label: "Respond to other-unit requirements", roles: ["UNIT_OFFICER"] },

  { key: "export.excel", module: "Data", label: "Export to Excel", roles: ["SUPER_ADMIN", "DGP", "UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER", "OFFICE_INCHARGE", "OFFICE_MANAGER"] },
] as const satisfies readonly { key: string; module: string; label: string; roles: readonly Role[] }[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];

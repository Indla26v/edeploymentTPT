import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  BedDouble,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  FilePlus2,
  History,
  IdCard,
  Inbox,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Medal,
  Package,
  PackageCheck,

  ShieldCheck,
  StickyNote,
  Truck,
  UserCog,
  Users,
  UsersRound,
  Clock,
  ArrowRightLeft,
  Palette,
} from "lucide-react";

import type { Role } from "@/lib/authz/roles";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles that see this item. Omitted = everyone signed in. */
  roles?: Role[];
  /** Delivery phase from docs/PLAN.md; pages not built yet show a "coming in phase N" card. */
  phase: number;
  description?: string;
};

export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean };

const PLAN_ROLES: Role[] = ["UNIT_OFFICER", "INITIATING_OFFICER", "COMPONENT_OFFICER"];
const MASTER_ROLES: Role[] = ["SUPER_ADMIN", "UNIT_OFFICER"];

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, phase: 1 }],
  },
  {
    label: "Security plans",
    items: [
      { label: "Ongoing plans", href: "/plans", icon: ShieldCheck, roles: PLAN_ROLES, phase: 4, description: "Bandobasts in progress, with their stage tracker." },
      { label: "Initiate plan", href: "/plans/new", icon: FilePlus2, roles: ["UNIT_OFFICER", "INITIATING_OFFICER"], phase: 4, description: "Create a bandobast or reuse a completed one." },
      { label: "Completed plans", href: "/plans/completed", icon: History, roles: PLAN_ROLES, phase: 7, description: "Final duty allocation, proposed plan and scheme book of finished bandobasts." },
    ],
  },
  {
    label: "Station",
    items: [
      { label: "Force requests", href: "/station/requests", icon: Inbox, roles: ["OFFICE_INCHARGE"], phase: 5, description: "Commit men against the Unit Officer's request and send the nominal roll." },
      { label: "Distributed equipment", href: "/station/equipment", icon: PackageCheck, roles: ["OFFICE_INCHARGE"], phase: 7, description: "Equipment the Unit Officer has drawn from your station." },
      { label: "Duty passes", href: "/station/duty-pass", icon: IdCard, roles: ["OFFICE_INCHARGE", "PERSONNEL"], phase: 7, description: "Duty passes for your officers on completed plans." },
    ],
  },
  {
    label: "Masters",
    collapsible: true,
    items: [
      { label: "Police persons", href: "/masters/persons", icon: Users, roles: [...MASTER_ROLES, "OFFICE_INCHARGE"], phase: 3 },
      { label: "Stations & offices", href: "/masters/stations", icon: Building2, roles: MASTER_ROLES, phase: 3 },
      { label: "Police ranks", href: "/masters/ranks", icon: Medal, roles: MASTER_ROLES, phase: 3 },
      { label: "State police units", href: "/masters/units", icon: Landmark, roles: MASTER_ROLES, phase: 3 },
      { label: "Components", href: "/masters/components", icon: ListChecks, roles: MASTER_ROLES, phase: 3 },
      { label: "Deployment points", href: "/masters/points", icon: MapPin, roles: [...MASTER_ROLES, "COMPONENT_OFFICER"], phase: 3 },
      { label: "Equipment", href: "/masters/equipment", icon: Package, roles: [...MASTER_ROLES, "COMPONENT_OFFICER"], phase: 3 },
      { label: "Accommodation", href: "/masters/accommodation", icon: BedDouble, roles: MASTER_ROLES, phase: 3 },
      { label: "Vehicles", href: "/masters/vehicles", icon: Truck, roles: MASTER_ROLES, phase: 3 },
      { label: "Teams", href: "/masters/teams", icon: UsersRound, roles: MASTER_ROLES, phase: 3 },
      { label: "Shifts", href: "/masters/shifts", icon: Clock, roles: [...MASTER_ROLES, "COMPONENT_OFFICER"], phase: 3 },
      { label: "Instructions library", href: "/masters/instructions", icon: BookOpen, roles: MASTER_ROLES, phase: 3 },
      { label: "ID card headers", href: "/masters/id-card-headers", icon: IdCard, roles: MASTER_ROLES, phase: 3 },
      { label: "Transfer requests", href: "/masters/transfers", icon: ArrowRightLeft, roles: [...MASTER_ROLES, "OFFICE_INCHARGE"], phase: 3 },
      { label: "Unit profile", href: "/masters/unit-profile", icon: Armchair, roles: ["UNIT_OFFICER"], phase: 3 },
    ],
  },
  {
    label: "Office",
    collapsible: true,
    items: [
      { label: "Tasks", href: "/office/tasks", icon: ClipboardList, roles: ["OFFICE_MANAGER", "EMPLOYEE"], phase: 8 },
      { label: "Meetings", href: "/office/meetings", icon: CalendarDays, roles: ["OFFICE_MANAGER", "EMPLOYEE"], phase: 8 },
      { label: "Appointments", href: "/office/appointments", icon: CalendarClock, roles: ["OFFICE_MANAGER"], phase: 8 },
      { label: "Reports", href: "/office/reports", icon: ChartColumn, roles: ["OFFICE_MANAGER"], phase: 8 },
      { label: "Notes", href: "/office/notes", icon: StickyNote, roles: ["OFFICE_MANAGER", "EMPLOYEE"], phase: 8 },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: UserCog, roles: ["SUPER_ADMIN", "UNIT_OFFICER"], phase: 2 },
      { label: "Roles & permissions", href: "/admin/roles", icon: KeyRound, roles: ["SUPER_ADMIN"], phase: 2 },
      { label: "Design system", href: "/design", icon: Palette, phase: 1 },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

export function navForRole(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) })).filter(
    (g) => g.items.length > 0,
  );
}


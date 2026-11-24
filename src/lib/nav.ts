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

import type { PermissionKey } from "@/lib/authz/permissions";
import type { Role } from "@/lib/authz/roles";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission needed to see this item. */
  permission?: PermissionKey;
  /** Optional extra restriction to specific active roles (e.g. station inbox only for Office Incharge). */
  roles?: Role[];
  /** Delivery phase from docs/PLAN.md; pages not built yet show a "coming in phase N" card. */
  phase: number;
  description?: string;
};

export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean };

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view", phase: 1 }],
  },
  {
    label: "Security plans",
    items: [
      { label: "Ongoing plans", href: "/plans", icon: ShieldCheck, permission: "plans.view", phase: 4, description: "Bandobasts in progress, with their stage tracker." },
      { label: "Initiate plan", href: "/plans/new", icon: FilePlus2, permission: "plans.initiate", phase: 4, description: "Create a bandobast or reuse a completed one." },
      { label: "Completed plans", href: "/plans/completed", icon: History, permission: "plans.view", phase: 4, description: "Final duty allocation, proposed plan and scheme book of finished bandobasts." },
    ],
  },
  {
    label: "Station",
    items: [
      { label: "Force requests", href: "/station/requests", icon: Inbox, permission: "force.respond", roles: ["OFFICE_INCHARGE"], phase: 5, description: "Commit men against the Unit Officer's request and send the nominal roll." },
      { label: "Distributed equipment", href: "/station/equipment", icon: PackageCheck, permission: "execution.equipment", roles: ["OFFICE_INCHARGE"], phase: 7, description: "Equipment the Unit Officer has drawn from your station." },
      { label: "Duty passes", href: "/station/duty-pass", icon: IdCard, permission: "dutypass.view", roles: ["OFFICE_INCHARGE", "PERSONNEL"], phase: 7, description: "Duty passes for your officers on completed plans." },
    ],
  },
  {
    label: "Masters",
    collapsible: true,
    items: [
      { label: "Police persons", href: "/masters/persons", icon: Users, permission: "masters.view", phase: 3 },
      { label: "Stations & offices", href: "/masters/stations", icon: Building2, permission: "masters.view", phase: 3 },
      { label: "Police ranks", href: "/masters/ranks", icon: Medal, permission: "masters.view", phase: 3 },
      { label: "State police units", href: "/masters/units", icon: Landmark, permission: "masters.view", phase: 3 },
      { label: "Components", href: "/masters/components", icon: ListChecks, permission: "masters.components.manage", phase: 3 },
      { label: "Deployment points", href: "/masters/points", icon: MapPin, permission: "masters.points.manage", phase: 3 },
      { label: "Equipment", href: "/masters/equipment", icon: Package, permission: "masters.equipment.manage", phase: 3 },
      { label: "Accommodation", href: "/masters/accommodation", icon: BedDouble, permission: "masters.accommodation.manage", phase: 3 },
      { label: "Vehicles", href: "/masters/vehicles", icon: Truck, permission: "masters.vehicles.manage", phase: 3 },
      { label: "Teams", href: "/masters/teams", icon: UsersRound, permission: "masters.teams.manage", phase: 3 },
      { label: "Shifts", href: "/masters/shifts", icon: Clock, permission: "masters.shifts.manage", phase: 3 },
      { label: "Instructions library", href: "/masters/instructions", icon: BookOpen, permission: "masters.instructions.manage", phase: 3 },
      { label: "ID card headers", href: "/masters/id-card-headers", icon: IdCard, permission: "masters.idcards.manage", phase: 3 },
      { label: "Transfer requests", href: "/masters/transfers", icon: ArrowRightLeft, permission: "transfers.request", phase: 3 },
      { label: "Unit profile", href: "/masters/unit-profile", icon: Armchair, permission: "masters.unitprofile.manage", phase: 3 },
    ],
  },
  {
    label: "Office",
    collapsible: true,
    items: [
      { label: "Tasks", href: "/office/tasks", icon: ClipboardList, permission: "office.tasks.work", phase: 8 },
      { label: "Meetings", href: "/office/meetings", icon: CalendarDays, permission: "office.meetings.attend", phase: 8 },
      { label: "Appointments", href: "/office/appointments", icon: CalendarClock, permission: "office.appointments.manage", phase: 8 },
      { label: "Reports", href: "/office/reports", icon: ChartColumn, permission: "office.reports.view", phase: 8 },
      { label: "Notes", href: "/office/notes", icon: StickyNote, permission: "office.notes", phase: 8 },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: UserCog, permission: "admin.users.manage", phase: 2 },
      { label: "Roles & permissions", href: "/admin/roles", icon: KeyRound, permission: "admin.roles.manage", phase: 2 },
      { label: "Design system", href: "/design", icon: Palette, permission: "admin.roles.manage", phase: 1 },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

/** Highest delivery phase whose screens exist; later nav items render the "coming in phase N" card. */
export const BUILT_PHASE = 4;

export function navFor(role: Role, permissions: ReadonlySet<string>): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.permission || permissions.has(i.permission)) && (!i.roles || i.roles.includes(role))),
  })).filter((g) => g.items.length > 0);
}


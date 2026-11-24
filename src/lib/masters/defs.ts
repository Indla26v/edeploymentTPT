import type { PermissionKey } from "@/lib/authz/permissions";

/** Client-safe definitions for config-driven master screens (table + form + validation + export). */

export type Option = { value: string; label: string };
export type DynamicOptions = "stations" | "ranks";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "time" | "date" | "phone" | "select" | "boolean" | "image" | "latlng" | "composition";
  required?: boolean;
  options?: Option[] | DynamicOptions;
  placeholder?: string;
  help?: string;
  wide?: boolean;
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean;
};

export type ColumnSpec = {
  key: string;
  label: string;
  kind?: "text" | "strong" | "badge" | "number" | "bool" | "time" | "image" | "option" | "composition" | "mono";
  hideOnMobile?: boolean;
};

export type MasterDef = {
  key: MasterKey;
  title: string;
  singular: string;
  description: string;
  viewPermission: PermissionKey;
  managePermission: PermissionKey;
  scope: "unit" | "global";
  fields: FieldDef[];
  columns: ColumnSpec[];
  search: string[];
  abstract?: { by: string; sum?: string; sumLabel?: string };
  reorderable?: boolean;
  emptyHint: string;
};

export const MASTER_KEYS = ["ranks", "units", "components", "accommodation", "vehicles", "teams", "shifts", "instructions", "id-card-headers"] as const;
export type MasterKey = (typeof MASTER_KEYS)[number];

const RANK_CATEGORY: Option[] = [
  { value: "general", label: "General" },
  { value: "ar", label: "Armed Reserve" },
  { value: "apsp", label: "APSP" },
];
const UNIT_TYPE: Option[] = [
  { value: "district", label: "District" },
  { value: "commissionerate", label: "Commissionerate" },
  { value: "battalion", label: "Battalion" },
  { value: "special", label: "Special unit" },
];
const ACCOMMODATION_CATEGORY: Option[] = [
  { value: "hotel", label: "Hotel" },
  { value: "school", label: "School" },
  { value: "college", label: "College" },
  { value: "dormitory", label: "Dormitory" },
  { value: "function_hall", label: "Function hall" },
];
const GENDER_ALLOWED: Option[] = [
  { value: "any", label: "Men & women" },
  { value: "male", label: "Men only" },
  { value: "female", label: "Women only" },
];
const VEHICLE_KINDS: Option[] = ["Jeep", "Bolero", "Interceptor", "Van", "Bus", "Two-wheeler", "Ambulance"].map((v) => ({ value: v, label: v }));

export const MASTER_DEFS: Record<MasterKey, MasterDef> = {
  ranks: {
    key: "ranks",
    title: "Police ranks",
    singular: "rank",
    description: "Rank hierarchy used everywhere. Lower seniority number = more senior.",
    viewPermission: "masters.view",
    managePermission: "masters.ranks.manage",
    scope: "global",
    fields: [
      { name: "code", label: "Short code", type: "text", required: true, placeholder: "e.g. HC" },
      { name: "name", label: "Full name", type: "text", required: true, placeholder: "e.g. Head Constable" },
      { name: "category", label: "Category", type: "select", options: RANK_CATEGORY, required: true, defaultValue: "general" },
      { name: "seniority", label: "Seniority", type: "number", required: true, min: 1, max: 99, help: "1 is the most senior" },
      { name: "isActive", label: "In use", type: "boolean", defaultValue: true },
    ],
    columns: [
      { key: "code", label: "Code", kind: "badge" },
      { key: "name", label: "Rank", kind: "strong" },
      { key: "category", label: "Category", kind: "option" },
      { key: "seniority", label: "Seniority", kind: "number" },
      { key: "isActive", label: "In use", kind: "bool", hideOnMobile: true },
    ],
    search: ["code", "name"],
    abstract: { by: "category" },
    emptyHint: "Add the ranks used in your state.",
  },
  units: {
    key: "units",
    title: "State police units",
    singular: "unit",
    description: "Districts, commissionerates and battalions, with their unit officer. Drag to set the display order.",
    viewPermission: "masters.view",
    managePermission: "masters.units.manage",
    scope: "global",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. DEMO-DIST" },
      { name: "name", label: "Unit name", type: "text", required: true },
      { name: "type", label: "Type", type: "select", options: UNIT_TYPE, required: true, defaultValue: "district" },
      { name: "officerName", label: "Unit officer", type: "text" },
      { name: "officerDesignation", label: "Designation", type: "text", placeholder: "e.g. Superintendent of Police" },
      { name: "officerPhone", label: "Mobile", type: "phone" },
    ],
    columns: [
      { key: "name", label: "Unit", kind: "strong" },
      { key: "code", label: "Code", kind: "mono", hideOnMobile: true },
      { key: "type", label: "Type", kind: "option" },
      { key: "officerName", label: "Unit officer" },
      { key: "officerPhone", label: "Mobile", kind: "mono", hideOnMobile: true },
    ],
    search: ["name", "code", "officerName", "officerPhone"],
    reorderable: true,
    emptyHint: "Add the state's police units.",
  },
  components: {
    key: "components",
    title: "Components",
    singular: "component",
    description: "Operational segments of a bandobast, e.g. Law & Order – ACP West, Traffic, Security.",
    viewPermission: "masters.components.manage",
    managePermission: "masters.components.manage",
    scope: "unit",
    fields: [
      { name: "name", label: "Component name", type: "text", required: true, wide: true, placeholder: "e.g. Law & Order – ACP West" },
      { name: "isActive", label: "In use", type: "boolean", defaultValue: true },
    ],
    columns: [
      { key: "name", label: "Component", kind: "strong" },
      { key: "isActive", label: "In use", kind: "bool" },
    ],
    search: ["name"],
    emptyHint: "Add the components your bandobasts are organised into.",
  },
  accommodation: {
    key: "accommodation",
    title: "Accommodation",
    singular: "accommodation",
    description: "Hotels, schools, colleges, dormitories and function halls available to house deployed personnel.",
    viewPermission: "masters.accommodation.manage",
    managePermission: "masters.accommodation.manage",
    scope: "unit",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, wide: true },
      { name: "category", label: "Category", type: "select", options: ACCOMMODATION_CATEGORY, required: true, defaultValue: "school" },
      { name: "capacity", label: "Capacity (persons)", type: "number", required: true, min: 1, max: 5000 },
      { name: "genderAllowed", label: "Who can stay", type: "select", options: GENDER_ALLOWED, required: true, defaultValue: "any" },
      { name: "stationId", label: "Nearest station", type: "select", options: "stations" },
      { name: "contactName", label: "Contact person", type: "text" },
      { name: "contactPhone", label: "Contact mobile", type: "phone" },
      { name: "address", label: "Address", type: "textarea", wide: true },
      { name: "location", label: "Location", type: "latlng", wide: true },
    ],
    columns: [
      { key: "name", label: "Accommodation", kind: "strong" },
      { key: "category", label: "Category", kind: "option" },
      { key: "capacity", label: "Capacity", kind: "number" },
      { key: "genderAllowed", label: "For", kind: "option", hideOnMobile: true },
      { key: "contactPhone", label: "Contact", kind: "mono", hideOnMobile: true },
    ],
    search: ["name", "address", "contactName"],
    abstract: { by: "category", sum: "capacity", sumLabel: "beds" },
    emptyHint: "Add places where deployed personnel can stay.",
  },
  vehicles: {
    key: "vehicles",
    title: "Vehicles",
    singular: "vehicle",
    description: "Unit vehicles with their station, driver/officer and availability.",
    viewPermission: "masters.vehicles.manage",
    managePermission: "masters.vehicles.manage",
    scope: "unit",
    fields: [
      { name: "number", label: "Vehicle number", type: "text", required: true, placeholder: "AP 16 PP 1234" },
      { name: "kind", label: "Type", type: "select", options: VEHICLE_KINDS, required: true, defaultValue: "Jeep" },
      { name: "stationId", label: "Station", type: "select", options: "stations" },
      { name: "officerName", label: "Officer / driver", type: "text" },
      { name: "officerRank", label: "Rank", type: "select", options: "ranks" },
      { name: "isAvailable", label: "Available", type: "boolean", defaultValue: true },
    ],
    columns: [
      { key: "number", label: "Vehicle", kind: "mono" },
      { key: "kind", label: "Type", kind: "badge" },
      { key: "officerName", label: "Officer", hideOnMobile: true },
      { key: "isAvailable", label: "Available", kind: "bool" },
    ],
    search: ["number", "officerName", "kind"],
    abstract: { by: "kind" },
    emptyHint: "Add the unit's vehicles.",
  },
  teams: {
    key: "teams",
    title: "Teams",
    singular: "team",
    description: "Standard teams (Rope Party, Pickup Party, Ceremonial Guard…) that Component Officers can add to a sector in one click.",
    viewPermission: "masters.teams.manage",
    managePermission: "masters.teams.manage",
    scope: "unit",
    fields: [
      { name: "name", label: "Team name", type: "text", required: true, wide: true },
      { name: "composition", label: "Composition", type: "composition", wide: true, help: "Ranks and how many of each" },
    ],
    columns: [
      { key: "name", label: "Team", kind: "strong" },
      { key: "composition", label: "Composition", kind: "composition" },
    ],
    search: ["name"],
    emptyHint: "Add teams like Rope Party or Pickup Party.",
  },
  shifts: {
    key: "shifts",
    title: "Shifts",
    singular: "shift",
    description: "Standard duty shifts used when a sector runs in batches.",
    viewPermission: "masters.shifts.manage",
    managePermission: "masters.shifts.manage",
    scope: "unit",
    fields: [
      { name: "name", label: "Shift name", type: "text", required: true, wide: true, placeholder: "e.g. Morning" },
      { name: "startTime", label: "From", type: "time", required: true },
      { name: "endTime", label: "To", type: "time", required: true },
    ],
    columns: [
      { key: "name", label: "Shift", kind: "strong" },
      { key: "startTime", label: "From", kind: "time" },
      { key: "endTime", label: "To", kind: "time" },
    ],
    search: ["name"],
    emptyHint: "Add your standard shifts.",
  },
  instructions: {
    key: "instructions",
    title: "Instructions library",
    singular: "instruction",
    description: "Standard instructions you can attach to plans and sectors instead of retyping them.",
    viewPermission: "masters.instructions.manage",
    managePermission: "masters.instructions.manage",
    scope: "unit",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, wide: true },
      { name: "body", label: "Instruction", type: "textarea", required: true, wide: true },
    ],
    columns: [
      { key: "title", label: "Title", kind: "strong" },
      { key: "body", label: "Instruction", hideOnMobile: true },
    ],
    search: ["title", "body"],
    emptyHint: "Add instructions you use often.",
  },
  "id-card-headers": {
    key: "id-card-headers",
    title: "ID card headers",
    singular: "ID card header",
    description: "Event-specific headers printed at the top of bandobast ID cards.",
    viewPermission: "masters.idcards.manage",
    managePermission: "masters.idcards.manage",
    scope: "unit",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, wide: true, placeholder: "e.g. Dasara 2026 Bandobast" },
      { name: "imageUrl", label: "Header image", type: "image", wide: true },
    ],
    columns: [
      { key: "imageUrl", label: "Image", kind: "image" },
      { key: "title", label: "Title", kind: "strong" },
    ],
    search: ["title"],
    emptyHint: "Add a header for your next event.",
  },
};

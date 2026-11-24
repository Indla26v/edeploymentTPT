import { pgEnum } from "drizzle-orm/pg-core";

export const unitType = pgEnum("unit_type", ["district", "commissionerate", "battalion", "special"]);
export const stationKind = pgEnum("station_kind", ["police_station", "office", "special_unit", "control_room"]);
export const rankCategory = pgEnum("rank_category", ["general", "ar", "apsp"]);
export const gender = pgEnum("gender", ["male", "female"]);
export const availability = pgEnum("availability", [
  "available",
  "on_leave",
  "medical_leave",
  "suspended",
  "deputation",
  "other",
]);
/** Drives the placement hard rule: light-duty officers are never placed on high-intensity points. */
export const fitness = pgEnum("fitness", ["fit", "light_duty_only"]);

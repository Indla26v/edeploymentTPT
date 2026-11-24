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

/** Duty profile of a deployment point (drives the placement suggestion rules). */
export const intensity = pgEnum("intensity", ["high", "medium", "low"]);
export const mobility = pgEnum("mobility", ["static", "mobile"]);
export const genderReq = pgEnum("gender_req", ["any", "male", "female"]);
export const accommodationCategory = pgEnum("accommodation_category", ["hotel", "school", "college", "dormitory", "function_hall"]);
export const transferStatus = pgEnum("transfer_status", ["pending", "approved", "rejected"]);

/** Plan lifecycle. Shortfalls never send a plan back: sourcing → placement continues with the committed count. */
export const planStatus = pgEnum("plan_status", ["draft", "proposing", "consolidating", "sourcing", "placement", "published", "live", "completed", "cancelled"]);
/** Component (CO) lifecycle inside a plan. */
export const componentStatus = pgEnum("component_status", ["assigned", "in_progress", "submitted", "returned", "accepted"]);
export const reportingKind = pgEnum("reporting_kind", ["reporting", "briefing", "deployment", "relief", "de_induction"]);
export const slotRole = pgEnum("slot_role", ["member", "sector_incharge", "liaison"]);
export const preferenceKind = pgEnum("preference_kind", ["unit", "station", "person"]);
export const preferenceStatus = pgEnum("preference_status", ["active", "dropped"]);

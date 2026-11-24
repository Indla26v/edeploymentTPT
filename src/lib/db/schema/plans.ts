import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { componentStatus, genderReq, intensity, mobility, planStatus, preferenceKind, preferenceStatus, reportingKind, slotRole } from "./enums";
import { components, deploymentPoints, equipmentTypes, shifts, teams } from "./masters";
import { persons, ranks, stations, units } from "./org";

const ts = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};
const planRef = () =>
  uuid()
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" });

/** A bandobast / security plan. */
export const plans = pgTable(
  "plans",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: uuid()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    code: text().notNull(),
    title: text().notNull(),
    eventType: text().notNull().default("Festival"),
    venue: text(),
    description: text(),
    lat: numeric({ precision: 9, scale: 6, mode: "number" }),
    lng: numeric({ precision: 9, scale: 6, mode: "number" }),
    imageUrl: text(),
    status: planStatus().notNull().default("draft"),
    /** Component Officers should submit proposals by this time. */
    proposalDueAt: timestamp({ withTimezone: true }),
    overallInchargePersonId: uuid().references(() => persons.id, { onDelete: "set null" }),
    initiatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reusedFromPlanId: uuid(),
    sentToUoAt: timestamp({ withTimezone: true }),
    ...ts,
  },
  (t) => [uniqueIndex("plans_unit_code_uq").on(t.unitId, t.code), index("plans_unit_status_idx").on(t.unitId, t.status)],
);

/** Duty windows (a plan can run over several dates). */
export const planWindows = pgTable(
  "plan_windows",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    label: text(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index("plan_windows_plan_idx").on(t.planId), check("plan_windows_order_ck", sql`${t.endsAt} > ${t.startsAt}`)],
);

/** Reporting schedule: when and where each rank reports / is briefed / deploys / is relieved. */
export const planReportingSchedule = pgTable(
  "plan_reporting_schedule",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    kind: reportingKind().notNull(),
    /** null = all ranks */
    rankId: uuid().references(() => ranks.id, { onDelete: "cascade" }),
    at: timestamp({ withTimezone: true }).notNull(),
    place: text().notNull(),
  },
  (t) => [index("plan_reporting_plan_idx").on(t.planId)],
);

/** A component of the plan, proposed by its Component Officer (CO). */
export const planComponents = pgTable(
  "plan_components",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    componentId: uuid().references(() => components.id, { onDelete: "set null" }),
    name: text().notNull(),
    coUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    coPersonId: uuid().references(() => persons.id, { onDelete: "set null" }),
    inchargePersonId: uuid().references(() => persons.id, { onDelete: "set null" }),
    status: componentStatus().notNull().default("assigned"),
    logisticsNote: text(),
    returnComment: text(),
    submittedAt: timestamp({ withTimezone: true }),
    displayOrder: integer().notNull().default(0),
    ...ts,
  },
  (t) => [uniqueIndex("plan_components_plan_name_uq").on(t.planId, t.name), index("plan_components_co_idx").on(t.coUserId)],
);

/** Sector inside a component: shift, number of batches, instructions, optional sector incharge / liaison ranks. */
export const sectors = pgTable(
  "sectors",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    planComponentId: uuid()
      .notNull()
      .references(() => planComponents.id, { onDelete: "cascade" }),
    name: text().notNull(),
    shiftId: uuid().references(() => shifts.id, { onDelete: "set null" }),
    batches: smallint().notNull().default(1),
    instructions: text(),
    imageUrl: text(),
    inchargeRankId: uuid().references(() => ranks.id, { onDelete: "set null" }),
    liaisonRankId: uuid().references(() => ranks.id, { onDelete: "set null" }),
    displayOrder: integer().notNull().default(0),
    ...ts,
  },
  (t) => [index("sectors_component_idx").on(t.planComponentId), check("sectors_batches_ck", sql`${t.batches} between 1 and 4`)],
);

/** A duty point in a sector (copied from the library or placed on the map). */
export const planPoints = pgTable(
  "plan_points",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    planComponentId: uuid()
      .notNull()
      .references(() => planComponents.id, { onDelete: "cascade" }),
    sectorId: uuid()
      .notNull()
      .references(() => sectors.id, { onDelete: "cascade" }),
    libraryPointId: uuid().references(() => deploymentPoints.id, { onDelete: "set null" }),
    name: text().notNull(),
    lat: numeric({ precision: 9, scale: 6, mode: "number" }),
    lng: numeric({ precision: 9, scale: 6, mode: "number" }),
    priority: smallint().notNull().default(3),
    intensity: intensity().notNull().default("medium"),
    mobility: mobility().notNull().default("static"),
    genderReq: genderReq().notNull().default("any"),
    displayOrder: integer().notNull().default(0),
    ...ts,
  },
  (t) => [index("plan_points_sector_idx").on(t.sectorId), check("plan_points_priority_ck", sql`${t.priority} between 1 and 4`)],
);

/**
 * Men required at a point, per batch and rank. Rows of the same sector, batch and rank sharing a
 * `mergeGroup` are covered by the same officers (count = the group's largest count).
 */
export const pointRequirements = pgTable(
  "point_requirements",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    pointId: uuid()
      .notNull()
      .references(() => planPoints.id, { onDelete: "cascade" }),
    batch: smallint().notNull().default(1),
    rankId: uuid()
      .notNull()
      .references(() => ranks.id),
    count: integer().notNull(),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    mergeGroup: text(),
  },
  (t) => [
    uniqueIndex("point_requirements_uq").on(t.pointId, t.batch, t.rankId),
    index("point_requirements_plan_idx").on(t.planId),
    check("point_requirements_count_ck", sql`${t.count} >= 0`),
  ],
);

/** One position to fill with one officer. Generated from requirements (and sector incharge / liaison). */
export const slots = pgTable(
  "slots",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    planComponentId: uuid()
      .notNull()
      .references(() => planComponents.id, { onDelete: "cascade" }),
    sectorId: uuid()
      .notNull()
      .references(() => sectors.id, { onDelete: "cascade" }),
    /** Primary point (null for sector incharge / liaison). */
    pointId: uuid().references(() => planPoints.id, { onDelete: "cascade" }),
    batch: smallint().notNull().default(1),
    rankId: uuid()
      .notNull()
      .references(() => ranks.id),
    role: slotRole().notNull().default("member"),
    seq: integer().notNull().default(1),
    /** Copied from the point so placement rules don't need joins. */
    priority: smallint().notNull().default(3),
    intensity: intensity().notNull().default("medium"),
    genderReq: genderReq().notNull().default("any"),
  },
  (t) => [index("slots_plan_idx").on(t.planId), index("slots_component_idx").on(t.planComponentId), index("slots_sector_idx").on(t.sectorId)],
);

/** Points covered by a slot (more than one when points were merged). */
export const slotPoints = pgTable(
  "slot_points",
  {
    slotId: uuid()
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    pointId: uuid()
      .notNull()
      .references(() => planPoints.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("slot_points_pk").on(t.slotId, t.pointId)],
);

/** "Prefer this unit / station / officer" — used to pre-fill sourcing and to lock officers in placement. */
export const preferences = pgTable(
  "preferences",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    planComponentId: uuid()
      .notNull()
      .references(() => planComponents.id, { onDelete: "cascade" }),
    kind: preferenceKind().notNull(),
    unitId: uuid().references(() => units.id, { onDelete: "cascade" }),
    stationId: uuid().references(() => stations.id, { onDelete: "cascade" }),
    personId: uuid().references(() => persons.id, { onDelete: "cascade" }),
    pointId: uuid().references(() => planPoints.id, { onDelete: "set null" }),
    rankId: uuid().references(() => ranks.id, { onDelete: "set null" }),
    count: integer(),
    note: text(),
    status: preferenceStatus().notNull().default("active"),
    ...ts,
  },
  (t) => [
    index("preferences_plan_idx").on(t.planId),
    check(
      "preferences_target_ck",
      sql`(${t.kind} = 'unit' and ${t.unitId} is not null) or (${t.kind} = 'station' and ${t.stationId} is not null) or (${t.kind} = 'person' and ${t.personId} is not null)`,
    ),
  ],
);

export const planEquipmentRequirements = pgTable(
  "plan_equipment_requirements",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    planComponentId: uuid()
      .notNull()
      .references(() => planComponents.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid()
      .notNull()
      .references(() => equipmentTypes.id),
    quantity: integer().notNull(),
    note: text(),
  },
  (t) => [uniqueIndex("plan_equipment_uq").on(t.planComponentId, t.equipmentTypeId), check("plan_equipment_qty_ck", sql`${t.quantity} > 0`)],
);

/** Timeline of everything that happened to a plan (shown on the plan page). */
export const planEvents = pgTable(
  "plan_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: planRef(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    kind: text().notNull(),
    message: text().notNull(),
    data: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plan_events_plan_idx").on(t.planId, t.createdAt)],
);

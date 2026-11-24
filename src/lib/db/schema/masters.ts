import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, numeric, pgTable, smallint, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { accommodationCategory, genderReq, intensity, mobility, transferStatus } from "./enums";
import { persons, stations, units } from "./org";

const ts = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};
const unitRef = () =>
  uuid()
    .notNull()
    .references(() => units.id, { onDelete: "cascade" });

/** Operational segments of a bandobast (Law & Order – ACP West, Traffic, Security…). */
export const components = pgTable(
  "components",
  { id: uuid().primaryKey().defaultRandom(), unitId: unitRef(), name: text().notNull(), isActive: boolean().notNull().default(true), ...ts },
  (t) => [uniqueIndex("components_unit_name_uq").on(t.unitId, t.name)],
);

/** Deployment points library: reusable duty points with a default duty profile. */
export const deploymentPoints = pgTable(
  "deployment_points",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    stationId: uuid().references(() => stations.id, { onDelete: "set null" }),
    name: text().notNull(),
    description: text(),
    lat: numeric({ precision: 9, scale: 6, mode: "number" }).notNull(),
    lng: numeric({ precision: 9, scale: 6, mode: "number" }).notNull(),
    /** 1 = critical … 4 = low */
    defaultPriority: smallint().notNull().default(3),
    defaultIntensity: intensity().notNull().default("medium"),
    defaultMobility: mobility().notNull().default("static"),
    genderReq: genderReq().notNull().default("any"),
    isActive: boolean().notNull().default(true),
    ...ts,
  },
  (t) => [index("deployment_points_unit_idx").on(t.unitId), check("deployment_points_priority_ck", sql`${t.defaultPriority} between 1 and 4`)],
);

export const equipmentTypes = pgTable(
  "equipment_types",
  { id: uuid().primaryKey().defaultRandom(), unitId: unitRef(), name: text().notNull(), ...ts },
  (t) => [uniqueIndex("equipment_types_unit_name_uq").on(t.unitId, t.name)],
);

/** Equipment held at a station, with working / not-working counts and a custodian. */
export const equipmentStock = pgTable(
  "equipment_stock",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    stationId: uuid()
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid()
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: "restrict" }),
    total: integer().notNull(),
    working: integer().notNull(),
    custodianName: text(),
    custodianDesignation: text(),
    custodianPhone: text(),
    ...ts,
  },
  (t) => [
    uniqueIndex("equipment_stock_station_type_uq").on(t.stationId, t.equipmentTypeId),
    check("equipment_stock_counts_ck", sql`${t.total} >= 0 and ${t.working} >= 0 and ${t.working} <= ${t.total}`),
  ],
);

export const accommodations = pgTable(
  "accommodations",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    stationId: uuid().references(() => stations.id, { onDelete: "set null" }),
    category: accommodationCategory().notNull(),
    name: text().notNull(),
    address: text(),
    capacity: integer().notNull(),
    genderAllowed: genderReq().notNull().default("any"),
    contactName: text(),
    contactPhone: text(),
    lat: numeric({ precision: 9, scale: 6, mode: "number" }),
    lng: numeric({ precision: 9, scale: 6, mode: "number" }),
    ...ts,
  },
  (t) => [index("accommodations_unit_idx").on(t.unitId), check("accommodations_capacity_ck", sql`${t.capacity} > 0`)],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    stationId: uuid().references(() => stations.id, { onDelete: "set null" }),
    number: text().notNull(),
    kind: text().notNull().default("Jeep"),
    officerName: text(),
    officerRank: text(),
    isAvailable: boolean().notNull().default(true),
    ...ts,
  },
  (t) => [uniqueIndex("vehicles_number_uq").on(t.number)],
);

/** Pre-defined teams (Rope Party, Pickup Party…) with a rank composition. */
export const teams = pgTable(
  "teams",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    name: text().notNull(),
    composition: jsonb().$type<{ rankCode: string; count: number }[]>().notNull().default([]),
    ...ts,
  },
  (t) => [uniqueIndex("teams_unit_name_uq").on(t.unitId, t.name)],
);

export const shifts = pgTable(
  "shifts",
  { id: uuid().primaryKey().defaultRandom(), unitId: unitRef(), name: text().notNull(), startTime: time().notNull(), endTime: time().notNull(), ...ts },
  (t) => [uniqueIndex("shifts_unit_name_uq").on(t.unitId, t.name)],
);

export const instructions = pgTable("instructions", { id: uuid().primaryKey().defaultRandom(), unitId: unitRef(), title: text().notNull(), body: text().notNull(), ...ts });

export const idCardHeaders = pgTable("id_card_headers", { id: uuid().primaryKey().defaultRandom(), unitId: unitRef(), title: text().notNull(), imageUrl: text(), ...ts });

/** Office Incharge raises a transfer; the Unit Officer approves and the person's station changes. */
export const transferRequests = pgTable(
  "transfer_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    fromStationId: uuid()
      .notNull()
      .references(() => stations.id),
    toStationId: uuid()
      .notNull()
      .references(() => stations.id),
    reason: text(),
    status: transferStatus().notNull().default("pending"),
    requestedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    ...ts,
  },
  (t) => [index("transfer_requests_unit_status_idx").on(t.unitId, t.status)],
);

export const unitProfiles = pgTable("unit_profiles", {
  unitId: uuid()
    .primaryKey()
    .references(() => units.id, { onDelete: "cascade" }),
  about: text(),
  logoUrl: text(),
  signatureUrl: text(),
  profileImageUrl: text(),
  ...ts,
});


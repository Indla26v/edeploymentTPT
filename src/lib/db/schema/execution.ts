import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, numeric, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { attendanceEvent, attendanceVia } from "./enums";
import { accommodations, equipmentTypes } from "./masters";
import { persons, stations } from "./org";
import { planComponents, plans, slots } from "./plans";

/** Check-in / check-out events (QR scan from the ID card, or marked by a supervisor). */
export const attendance = pgTable(
  "attendance",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    slotId: uuid().references(() => slots.id, { onDelete: "set null" }),
    event: attendanceEvent().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lat: numeric({ precision: 9, scale: 6, mode: "number" }),
    lng: numeric({ precision: 9, scale: 6, mode: "number" }),
    accuracyM: integer(),
    distanceM: integer(),
    /** checked in far from the posting */
    flagged: boolean().notNull().default(false),
    via: attendanceVia().notNull().default("qr"),
    recordedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("attendance_plan_person_idx").on(t.planId, t.personId, t.at)],
);

/** Officer → lodging for the bandobast nights. */
export const accommodationAllotments = pgTable(
  "accommodation_allotments",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    accommodationId: uuid()
      .notNull()
      .references(() => accommodations.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    fromDate: date().notNull(),
    toDate: date().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("accommodation_allotments_uq").on(t.planId, t.personId), check("accommodation_allotments_dates_ck", sql`${t.toDate} >= ${t.fromDate}`)],
);

/** Equipment drawn from a station's stock for a plan; the station issues and takes it back. */
export const equipmentAllocations = pgTable(
  "equipment_allocations",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    planComponentId: uuid().references(() => planComponents.id, { onDelete: "set null" }),
    equipmentTypeId: uuid()
      .notNull()
      .references(() => equipmentTypes.id),
    stationId: uuid()
      .notNull()
      .references(() => stations.id),
    quantity: integer().notNull(),
    issuedAt: timestamp({ withTimezone: true }),
    issuedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    returnedQty: integer().notNull().default(0),
    returnedAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("equipment_allocations_station_idx").on(t.stationId, t.equipmentTypeId), check("equipment_allocations_qty_ck", sql`${t.quantity} > 0 and ${t.returnedQty} >= 0 and ${t.returnedQty} <= ${t.quantity}`)],
);

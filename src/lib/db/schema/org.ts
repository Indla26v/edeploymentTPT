import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { availability, fitness, gender, rankCategory, stationKind, unitType } from "./enums";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** State police units: districts, commissionerates, battalions (Masters → State Police Units). */
export const units = pgTable(
  "units",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(),
    name: text().notNull(),
    type: unitType().notNull(),
    displayOrder: integer().notNull().default(0),
    officerName: text(),
    officerDesignation: text(),
    officerPhone: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex("units_code_uq").on(t.code)],
);

export const divisions = pgTable(
  "divisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: uuid()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    name: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("divisions_unit_name_uq").on(t.unitId, t.name)],
);

/** Police stations and offices (Masters → Police Stations/Offices). Drag-reorderable via displayOrder. */
export const stations = pgTable(
  "stations",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: uuid()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    divisionId: uuid()
      .notNull()
      .references(() => divisions.id, { onDelete: "restrict" }),
    code: text().notNull(),
    name: text().notNull(),
    kind: stationKind().notNull().default("police_station"),
    lat: numeric({ precision: 9, scale: 6, mode: "number" }),
    lng: numeric({ precision: 9, scale: 6, mode: "number" }),
    displayOrder: integer().notNull().default(0),
    /** Office Incharge (SHO). Setting this creates the OI login in phase 2. */
    inchargePersonId: uuid().references((): AnyPgColumn => persons.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("stations_unit_code_uq").on(t.unitId, t.code),
    index("stations_division_idx").on(t.divisionId),
  ],
);

/** Rank hierarchy. Lower seniority = more senior. */
export const ranks = pgTable(
  "ranks",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(),
    name: text().notNull(),
    category: rankCategory().notNull(),
    seniority: integer().notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("ranks_code_uq").on(t.code)],
);

/** Police persons. Age is always derived from dob, never stored. */
export const persons = pgTable(
  "persons",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: uuid()
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    stationId: uuid()
      .notNull()
      .references(() => stations.id, { onDelete: "restrict" }),
    rankId: uuid()
      .notNull()
      .references(() => ranks.id, { onDelete: "restrict" }),
    genNo: text().notNull(),
    name: text().notNull(),
    gender: gender().notNull(),
    dob: date({ mode: "string" }).notNull(),
    phone: text(),
    photoUrl: text(),
    signatureUrl: text(),
    availability: availability().notNull().default("available"),
    fitness: fitness().notNull().default("fit"),
    skills: text().array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("persons_unit_gen_no_uq").on(t.unitId, t.genNo),
    uniqueIndex("persons_phone_uq").on(t.phone).where(sql`${t.phone} is not null`),
    index("persons_station_rank_idx").on(t.stationId, t.rankId),
    index("persons_unit_rank_idx").on(t.unitId, t.rankId),
  ],
);

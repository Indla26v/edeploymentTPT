import { customType, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./auth";
import { forceRequestKind, forceRequestStatus, personnelSource } from "./enums";
import { persons, ranks, stations, units } from "./org";
import { plans } from "./plans";

/** Postgres tstzrange, written as "[start,end)". */
const tstzrange = customType<{ data: string; driverData: string }>({ dataType: () => "tstzrange" });

/**
 * A request for men sent by the Unit Officer to one station (or, in Phase 10, to another unit).
 * Top-ups are just more requests (kind = top_up) — the plan is never re-applied.
 */
export const forceRequests = pgTable(
  "force_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    round: smallint().notNull().default(1),
    kind: forceRequestKind().notNull().default("initial"),
    targetStationId: uuid().references(() => stations.id, { onDelete: "restrict" }),
    targetUnitId: uuid().references(() => units.id, { onDelete: "restrict" }),
    parentRequestId: uuid(),
    status: forceRequestStatus().notNull().default("sent"),
    deadlineAt: timestamp({ withTimezone: true }).notNull(),
    note: text(),
    /** Overall reason when the station gives fewer than requested. */
    shortReason: text(),
    sentBy: uuid().references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    respondedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    respondedAt: timestamp({ withTimezone: true }),
    remindedAt: timestamp({ withTimezone: true }),
    rollSentAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("force_requests_plan_idx").on(t.planId),
    index("force_requests_station_status_idx").on(t.targetStationId, t.status),
    index("force_requests_deadline_idx").on(t.status, t.deadlineAt),
    check("force_requests_target_ck", sql`(${t.targetStationId} is not null) <> (${t.targetUnitId} is not null)`),
  ],
);

export const forceRequestLines = pgTable(
  "force_request_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    requestId: uuid()
      .notNull()
      .references(() => forceRequests.id, { onDelete: "cascade" }),
    rankId: uuid()
      .notNull()
      .references(() => ranks.id),
    requested: integer().notNull(),
    /** null until the station answers */
    committed: integer(),
    reason: text(),
  },
  (t) => [
    uniqueIndex("force_request_lines_uq").on(t.requestId, t.rankId),
    check("force_request_lines_counts_ck", sql`${t.requested} > 0 and (${t.committed} is null or (${t.committed} >= 0 and ${t.committed} <= ${t.requested}))`),
  ],
);

/** "Proceed with the strength we got" — recorded per rank, never sent back to IO / COs. */
export const shortfallAcceptances = pgTable(
  "shortfall_acceptances",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    rankId: uuid()
      .notNull()
      .references(() => ranks.id),
    count: integer().notNull(),
    reason: text().notNull(),
    acceptedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shortfall_acceptances_plan_idx").on(t.planId), check("shortfall_acceptances_count_ck", sql`${t.count} > 0`)],
);

/**
 * Officers named for a plan (the pool placement draws from). The exclusion constraint added in the
 * migration stops one officer being booked on two plans whose duty windows overlap.
 */
export const planPersonnel = pgTable(
  "plan_personnel",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    requestId: uuid().references(() => forceRequests.id, { onDelete: "set null" }),
    stationId: uuid()
      .notNull()
      .references(() => stations.id),
    rankId: uuid()
      .notNull()
      .references(() => ranks.id),
    dutyWindow: tstzrange().notNull(),
    source: personnelSource().notNull().default("nominal_roll"),
    addedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plan_personnel_plan_person_uq").on(t.planId, t.personId), index("plan_personnel_request_idx").on(t.requestId), index("plan_personnel_person_idx").on(t.personId)],
);

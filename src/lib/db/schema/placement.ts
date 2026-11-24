import { boolean, index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { assignmentSource } from "./enums";
import { persons } from "./org";
import { planComponents, plans, slots } from "./plans";

/**
 * The working placement: one officer per slot, one slot per officer per plan. Suggestions are drafts like
 * any other row — nothing reaches officers until the IO publishes (see planPublications).
 */
export const assignments = pgTable(
  "assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    planComponentId: uuid()
      .notNull()
      .references(() => planComponents.id, { onDelete: "cascade" }),
    slotId: uuid()
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    source: assignmentSource().notNull().default("manual"),
    locked: boolean().notNull().default(false),
    reasons: jsonb().$type<string[]>().notNull().default([]),
    warnings: jsonb().$type<string[]>().notNull().default([]),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("assignments_slot_uq").on(t.slotId), uniqueIndex("assignments_plan_person_uq").on(t.planId, t.personId), index("assignments_component_idx").on(t.planComponentId)],
);

export type PublicationEntry = { slotId: string; personId: string };

/** Each publish stores a snapshot; the diff with the previous one decides who is notified. */
export const planPublications = pgTable(
  "plan_publications",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    snapshot: jsonb().$type<PublicationEntry[]>().notNull(),
    diff: jsonb().$type<{ added: number; moved: number; removed: number; unchanged: number }>().notNull(),
    notified: integer().notNull().default(0),
    publishedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plan_publications_version_uq").on(t.planId, t.version)],
);

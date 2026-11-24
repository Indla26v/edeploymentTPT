import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { appointmentStatus, meetingStatus, noteColor, taskPriority, taskStatus, taskUpdateKind } from "./enums";
import { units } from "./org";

const ts = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};
const unitRef = () =>
  uuid()
    .notNull()
    .references(() => units.id, { onDelete: "cascade" });
const userRef = () => uuid().references(() => users.id, { onDelete: "set null" });

export const departments = pgTable("departments", { id: uuid().primaryKey().defaultRandom(), unitId: unitRef(), name: text().notNull(), ...ts }, (t) => [uniqueIndex("departments_unit_name_uq").on(t.unitId, t.name)]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    departmentId: uuid().references(() => departments.id, { onDelete: "set null" }),
    title: text().notNull(),
    description: text(),
    priority: taskPriority().notNull().default("normal"),
    dueDate: date(),
    status: taskStatus().notNull().default("open"),
    appointmentId: uuid(),
    createdBy: userRef(),
    closedBy: userRef(),
    closedAt: timestamp({ withTimezone: true }),
    ...ts,
  },
  (t) => [index("tasks_unit_status_idx").on(t.unitId, t.status)],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** first "action taken" by this assignee — for response-time analysis */
    respondedAt: timestamp({ withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)],
);

export const taskUpdates = pgTable(
  "task_updates",
  {
    id: uuid().primaryKey().defaultRandom(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: userRef(),
    kind: taskUpdateKind().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_updates_task_idx").on(t.taskId, t.createdAt)],
);

export const taskAttachments = pgTable("task_attachments", {
  id: uuid().primaryKey().defaultRandom(),
  taskId: uuid()
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  url: text().notNull(),
  name: text().notNull(),
  uploadedBy: userRef(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const meetings = pgTable(
  "meetings",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    title: text().notNull(),
    agenda: text(),
    location: text(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    status: meetingStatus().notNull().default("scheduled"),
    /** minutes before start; null = no reminder */
    remindMinutes: integer(),
    remindedAt: timestamp({ withTimezone: true }),
    mom: text(),
    momSentAt: timestamp({ withTimezone: true }),
    organizerId: userRef(),
    ...ts,
  },
  (t) => [index("meetings_unit_start_idx").on(t.unitId, t.startsAt), check("meetings_time_ck", sql`${t.endsAt} > ${t.startsAt}`)],
);

export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    meetingId: uuid()
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    attended: boolean(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] }), index("meeting_participants_user_idx").on(t.userId)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid().primaryKey().defaultRandom(),
    unitId: unitRef(),
    visitorName: text().notNull(),
    visitorPhone: text(),
    purpose: text().notNull(),
    scheduledAt: timestamp({ withTimezone: true }).notNull(),
    status: appointmentStatus().notNull().default("scheduled"),
    notes: text(),
    allottedTo: userRef(),
    taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
    createdBy: userRef(),
    ...ts,
  },
  (t) => [index("appointments_unit_time_idx").on(t.unitId, t.scheduledAt)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text(),
    body: text().notNull(),
    color: noteColor().notNull().default("yellow"),
    pinned: boolean().notNull().default(false),
    ...ts,
  },
  (t) => [index("notes_user_idx").on(t.userId)],
);

import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { ROLES } from "../../authz/roles";
import { users } from "./auth";
import { stations, units } from "./org";
import { planComponents, plans } from "./plans";

export const roleEnum = pgEnum("role", ROLES);

/**
 * A role held by a user, with its scope. Scope columns narrow what the role can see:
 * unit (UO, IO, OM…), station (OI), plan / plan component (CO, IO of a plan), department (Office staff).
 * plan/component/department FKs are added in later phases.
 */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum().notNull(),
    unitId: uuid().references(() => units.id, { onDelete: "cascade" }),
    stationId: uuid().references(() => stations.id, { onDelete: "cascade" }),
    planId: uuid().references(() => plans.id, { onDelete: "cascade" }),
    planComponentId: uuid().references(() => planComponents.id, { onDelete: "cascade" }),
    departmentId: uuid(),
    isActive: boolean().notNull().default(true),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("role_assignments_user_idx").on(t.userId), index("role_assignments_scope_idx").on(t.role, t.unitId, t.stationId)],
);

/** Permission catalogue (seeded from code, see lib/authz/permissions.ts). */
export const permissions = pgTable("permissions", {
  key: text().primaryKey(),
  module: text().notNull(),
  label: text().notNull(),
  description: text(),
});

/** Role → permission grants. Editable by the State Admin (Allocate Permissions screen). */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: roleEnum().notNull(),
    permissionKey: text()
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.role, t.permissionKey] })],
);

/** Every mutation writes one row here, in the same transaction. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    actingRole: text(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_actor_idx").on(t.actorUserId, t.at)],
);

/** In-app notifications (header bell). */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull().default("info"),
    title: text().notNull(),
    body: text(),
    href: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/**
 * Outbound messages (SMS / WhatsApp). Written in the same transaction as the change that caused them;
 * drained by the cron tick through the configured provider adapter (console by default).
 */
export const notificationsOutbox = pgTable(
  "notifications_outbox",
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: text().notNull().default("sms"),
    toPhone: text(),
    toUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    template: text().notNull(),
    payload: jsonb().notNull().default({}),
    status: text().notNull().default("pending"),
    attemptCount: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("outbox_status_idx").on(t.status, t.nextAttemptAt)],
);

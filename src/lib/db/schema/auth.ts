import { bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { persons } from "./org";

/**
 * Better Auth tables (usePlural). Field names follow Better Auth's model; snake_case columns via Drizzle casing.
 * Extra user fields: link to the police person, forced password change, activation and lockout.
 */
export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    username: text(),
    displayUsername: text(),
    personId: uuid().references(() => persons.id, { onDelete: "set null" }),
    mustChangePassword: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), uniqueIndex("users_username_uq").on(t.username), index("users_person_idx").on(t.personId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The role the user is currently acting as (role switcher). Authz re-reads assignments every request. */
    activeRole: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.token), index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** Better Auth rate-limit counters (database storage works across serverless instances). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull(),
    count: integer().notNull(),
    lastRequest: bigint({ mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("rate_limits_key_uq").on(t.key)],
);

import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins/username";

import type { Db } from "../db/client";
import * as schema from "../db/schema";

export const SESSION_TTL_SECONDS = 12 * 60 * 60; // idle sessions expire after 12 hours
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,39}$/;

/**
 * Better Auth factory with no Next.js imports, so tests and scripts can build an instance too.
 * Public sign-up and email sign-in are disabled: accounts are created by admins / the workflow,
 * and officers sign in with username + password.
 */
export function createAuth(db: Db, opts: { plugins?: BetterAuthPlugin[] } = {}) {
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const devOrigins = process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://localhost:3100", "http://127.0.0.1:3000"];
  return betterAuth({
    appName: "eDeployment",
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [baseURL, ...devOrigins],
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    disabledPaths: ["/sign-up/email", "/sign-in/email", "/forget-password", "/reset-password", "/request-password-reset"],
    user: {
      additionalFields: {
        personId: { type: "string", required: false, input: false },
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
        isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: 15 * 60,
      additionalFields: {
        activeRole: { type: "string", required: false, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 120,
      customRules: { "/sign-in/username": { window: 60, max: 20 } },
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "edeploy",
    },
    plugins: [
      username({
        minUsernameLength: 2,
        maxUsernameLength: 40,
        usernameValidator: (u) => USERNAME_PATTERN.test(u),
        displayUsername: false,
      }),
      ...(opts.plugins ?? []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

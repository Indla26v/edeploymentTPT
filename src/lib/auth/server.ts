import "server-only";

import { nextCookies } from "better-auth/next-js";

import { getDb } from "../db";
import { createAuth, type Auth } from "./config";

const globalForAuth = globalThis as unknown as { __edeployAuth?: Auth };

/** The app's Better Auth instance (nextCookies lets Server Actions set the session cookie). */
export function getAuth(): Auth {
  if (!globalForAuth.__edeployAuth) {
    globalForAuth.__edeployAuth = createAuth(getDb(), { plugins: [nextCookies()] });
  }
  return globalForAuth.__edeployAuth;
}

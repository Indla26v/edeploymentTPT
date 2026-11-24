import { eq } from "drizzle-orm";

import type { Db } from "../db/client";
import { users } from "../db/schema";

export const LOCKOUT = { maxFailures: 5, minutes: 15 } as const;

export type LoginOutcome =
  | { ok: true; userId: string; mustChangePassword: boolean }
  | { ok: false; reason: "invalid" | "inactive" }
  | { ok: false; reason: "locked"; lockedUntil: Date };

/**
 * Username + password sign-in with per-account lockout (5 failures → 15 minutes).
 * `verify` performs the real credential check (Better Auth sign-in, which also sets the session cookie).
 * Kept free of Next.js imports so it can be unit-tested against a real database.
 */
export async function signInWithLockout(
  db: Db,
  input: { username: string; password: string },
  verify: (username: string, password: string) => Promise<boolean>,
  now: Date = new Date(),
): Promise<LoginOutcome> {
  const username = input.username.trim().toLowerCase();
  const [user] = await db
    .select({ id: users.id, isActive: users.isActive, lockedUntil: users.lockedUntil, failedLoginCount: users.failedLoginCount, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    // Same work as a real attempt so response time does not reveal which usernames exist.
    await verify(username, input.password);
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > now) return { ok: false, reason: "locked", lockedUntil: user.lockedUntil };
  if (!user.isActive) return { ok: false, reason: "inactive" };

  const ok = await verify(username, input.password);
  if (!ok) {
    const failures = user.failedLoginCount + 1;
    if (failures >= LOCKOUT.maxFailures) {
      const lockedUntil = new Date(now.getTime() + LOCKOUT.minutes * 60_000);
      await db.update(users).set({ failedLoginCount: 0, lockedUntil }).where(eq(users.id, user.id));
      return { ok: false, reason: "locked", lockedUntil };
    }
    await db.update(users).set({ failedLoginCount: failures }).where(eq(users.id, user.id));
    return { ok: false, reason: "invalid" };
  }

  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, user.id));
  return { ok: true, userId: user.id, mustChangePassword: user.mustChangePassword };
}

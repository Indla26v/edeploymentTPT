import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import type { Db } from "../db/client";
import { accounts, users } from "../db/schema";
import { placeholderEmail } from "./passwords";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

/**
 * Create a login with a username + password credential in the caller's transaction
 * (Better Auth "credential" account, same scrypt hash Better Auth verifies at sign-in).
 */
export async function insertUserWithPassword(
  db: DbOrTx,
  input: { username: string; name: string; password: string; personId?: string | null; mustChangePassword?: boolean },
): Promise<{ userId: string }> {
  const username = input.username.trim().toLowerCase();
  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: placeholderEmail(username),
      username,
      personId: input.personId ?? null,
      mustChangePassword: input.mustChangePassword ?? true,
    })
    .returning({ id: users.id });
  await db.insert(accounts).values({
    accountId: user!.id,
    providerId: "credential",
    userId: user!.id,
    password: await hashPassword(input.password),
  });
  return { userId: user!.id };
}

/** Replace a user's password (admin reset or self-service change already verified by Better Auth). */
export async function setUserPassword(db: DbOrTx, userId: string, password: string, opts: { mustChangePassword: boolean }) {
  await db
    .update(accounts)
    .set({ password: await hashPassword(password) })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
  await db
    .update(users)
    .set({ mustChangePassword: opts.mustChangePassword, failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, userId));
}

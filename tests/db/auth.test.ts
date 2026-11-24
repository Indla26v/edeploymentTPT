import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { createAuth } from "@/lib/auth/config";
import { insertUserWithPassword, setUserPassword } from "@/lib/auth/accounts";
import { LOCKOUT, signInWithLockout } from "@/lib/auth/login";
import { createDb, type Db } from "@/lib/db/client";
import { rolePermissions, users } from "@/lib/db/schema";
import { DEMO_PASSWORD } from "@/lib/demo-accounts";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("authentication (username + password)", () => {
  let db: Db;
  let end: () => Promise<void>;
  let auth: ReturnType<typeof createAuth>;
  const headers = new Headers({ origin: "http://localhost:3000" });
  const verify = async (u: string, p: string) => {
    try {
      await auth.api.signInUsername({ body: { username: u, password: p }, headers });
      return true;
    } catch {
      return false;
    }
  };

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    auth = createAuth(db);
  }, 60_000);

  afterAll(async () => end?.());

  it("a seeded demo user signs in with the right password and is rejected with a wrong one", async () => {
    expect(await verify("sp", DEMO_PASSWORD)).toBe(true);
    expect(await verify("sp", "Wrong@12345")).toBe(false);
  });

  it("locks the account after 5 failures and unlocks after 15 minutes", async () => {
    const now = new Date("2026-11-24T10:00:00Z");
    for (let i = 1; i < LOCKOUT.maxFailures; i++) {
      const r = await signInWithLockout(db, { username: "dsp1", password: "nope" }, verify, now);
      expect(r).toEqual({ ok: false, reason: "invalid" });
    }
    const locked = await signInWithLockout(db, { username: "dsp1", password: "nope" }, verify, now);
    expect(locked.ok).toBe(false);
    expect(!locked.ok && locked.reason).toBe("locked");

    // Even the right password is refused while locked
    const stillLocked = await signInWithLockout(db, { username: "dsp1", password: DEMO_PASSWORD }, verify, new Date(now.getTime() + 5 * 60_000));
    expect(!stillLocked.ok && stillLocked.reason).toBe("locked");

    const later = await signInWithLockout(db, { username: "dsp1", password: DEMO_PASSWORD }, verify, new Date(now.getTime() + 16 * 60_000));
    expect(later.ok).toBe(true);
  });

  it("refuses deactivated accounts", async () => {
    await db.update(users).set({ isActive: false }).where(eq(users.username, "staff1"));
    const r = await signInWithLockout(db, { username: "staff1", password: DEMO_PASSWORD }, verify);
    expect(r).toEqual({ ok: false, reason: "inactive" });
    await db.update(users).set({ isActive: true }).where(eq(users.username, "staff1"));
  });

  it("new accounts must change their temporary password; admin reset sets the flag again", async () => {
    const { userId } = await insertUserWithPassword(db, { username: "test-officer", name: "Test Officer", password: "Temp@Pass123" });
    const r = await signInWithLockout(db, { username: "test-officer", password: "Temp@Pass123" }, verify);
    expect(r.ok && r.mustChangePassword).toBe(true);

    await setUserPassword(db, userId, "Fresh@Pass456", { mustChangePassword: false });
    expect(await verify("test-officer", "Temp@Pass123")).toBe(false);
    const r2 = await signInWithLockout(db, { username: "test-officer", password: "Fresh@Pass456" }, verify);
    expect(r2.ok && r2.mustChangePassword).toBe(false);
  });

  it("unknown usernames get the same generic answer", async () => {
    expect(await signInWithLockout(db, { username: "nobody-here", password: "x" }, verify)).toEqual({ ok: false, reason: "invalid" });
  });

  it("seeds the default permission grants", async () => {
    const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.permissionKey, "force.distribute"));
    expect(rows.map((r) => r.role)).toEqual(["UNIT_OFFICER"]);
  });
});

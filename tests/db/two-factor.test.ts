import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { createAuth } from "@/lib/auth/config";
import { createDb, type Db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { DEMO_PASSWORD } from "@/lib/demo-accounts";

const url = process.env.TEST_DATABASE_URL;

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — independent of the library under test. */
function totp(base32: string, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Collects Set-Cookie values into a Cookie header, like a browser would. */
function jar() {
  const store = new Map<string, string>();
  return {
    take(h: Headers) {
      for (const c of h.getSetCookie()) {
        const [pair] = c.split(";");
        const [k, ...v] = pair!.split("=");
        const val = v.join("=");
        if (/max-age=0/i.test(c) || val === "") store.delete(k!);
        else store.set(k!, val);
      }
    },
    headers: () => new Headers({ origin: "http://localhost:3000", cookie: [...store].map(([k, v]) => `${k}=${v}`).join("; ") }),
  };
}

describe.skipIf(!url)("two-step sign-in (TOTP)", () => {
  let db: Db;
  let end: () => Promise<void>;
  let auth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    auth = createAuth(db);
  }, 60_000);
  afterAll(async () => end?.());

  it("enrol with password + first code, then sign-in needs the code; backup codes work once", async () => {
    const j = jar();
    const login = await auth.api.signInUsername({ body: { username: "admin", password: DEMO_PASSWORD }, headers: j.headers(), returnHeaders: true });
    j.take(login.headers);
    await expect(auth.api.enableTwoFactor({ body: { password: "wrong-password-1", method: "totp" }, headers: j.headers() })).rejects.toBeTruthy();
    const en = await auth.api.enableTwoFactor({ body: { password: DEMO_PASSWORD, method: "totp" }, headers: j.headers() });
    if (en.method !== "totp") throw new Error("expected totp");
    const secret = new URL(en.totpURI).searchParams.get("secret")!;
    // Not enabled until the first code is verified.
    expect((await db.select({ on: users.twoFactorEnabled }).from(users).where(eq(users.username, "admin")))[0]!.on).toBe(false);
    await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers: j.headers() });
    expect((await db.select({ on: users.twoFactorEnabled }).from(users).where(eq(users.username, "admin")))[0]!.on).toBe(true);

    // New sign-in: password alone gives no session, only a second-step challenge.
    const j2 = jar();
    const step1 = await auth.api.signInUsername({ body: { username: "admin", password: DEMO_PASSWORD }, headers: j2.headers(), returnHeaders: true });
    expect(step1.response).toMatchObject({ twoFactorRedirect: true });
    j2.take(step1.headers);
    expect(await auth.api.getSession({ headers: j2.headers() })).toBeNull();
    await expect(auth.api.verifyTOTP({ body: { code: "000000" }, headers: j2.headers() })).rejects.toBeTruthy();
    const step2 = await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers: j2.headers(), returnHeaders: true });
    j2.take(step2.headers);
    expect((await auth.api.getSession({ headers: j2.headers() }))?.user.username).toBe("admin");

    // Backup code path, single use.
    const code = en.backupCodes[0]!;
    for (const expectOk of [true, false]) {
      const j3 = jar();
      const s1 = await auth.api.signInUsername({ body: { username: "admin", password: DEMO_PASSWORD }, headers: j3.headers(), returnHeaders: true });
      j3.take(s1.headers);
      const attempt = auth.api.verifyBackupCode({ body: { code }, headers: j3.headers() });
      if (expectOk) await expect(attempt).resolves.toBeTruthy();
      else await expect(attempt).rejects.toBeTruthy();
    }
  });
});

import type { Page } from "@playwright/test";

export const DEMO_PASSWORD = "Demo@12345";
export const authFile = (user: string) => `playwright/.auth/${user}.json`;

export async function signIn(page: Page, username: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Read-only DB lookups for e2e set-up (loads .env.local locally; CI provides DATABASE_URL). */
export async function dbQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      /* CI sets env directly */
    }
  }
  const { Client } = await import("pg");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** RFC 6238 TOTP for tests (SHA-1, 6 digits, 30 s). */
export async function totp(base32: string, at = Date.now()) {
  const { createHmac } = await import("node:crypto");
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

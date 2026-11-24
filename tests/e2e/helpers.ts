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

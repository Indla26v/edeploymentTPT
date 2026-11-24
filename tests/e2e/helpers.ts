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

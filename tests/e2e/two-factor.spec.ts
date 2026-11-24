import { expect, test } from "@playwright/test";

import { DEMO_PASSWORD, signIn, totp } from "./helpers";

test("two-step sign-in: set up with an authenticator, then sign in with a code", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "changes an account; runs once");
  await signIn(page, "pc1015");
  await page.goto("/account/two-factor");
  await page.getByLabel("Confirm your password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Set up two-step sign-in" }).click();
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  const secret = (await page.locator("span.font-mono").first().textContent())!.trim();
  await page.getByLabel("Code from the app").fill(await totp(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Two-step sign-in is on.")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Username").fill("pc1015");
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/login\/two-factor/);
  await page.getByLabel("Authentication code").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/Wrong code/);
  await page.getByLabel("Authentication code").fill(await totp(secret));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await page.waitForURL(/\/dashboard/);
});

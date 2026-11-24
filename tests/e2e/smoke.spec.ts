import { expect, test } from "@playwright/test";

test.describe("phase 1 smoke", () => {
  test("dashboard shows the seeded demo district", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Police persons")).toBeVisible();
    await expect(page.getByText("400", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Town I PS" })).toBeVisible();
  });

  test("placement suggestion respects the women-only point", async ({ page }) => {
    await page.goto("/design");
    const board = page.locator("#placement");
    await board.getByRole("button", { name: "Suggest placement" }).click();
    await expect(board.getByText("9 of 9 slots filled")).toBeVisible();
  });

  test("accepting a shortfall settles the rank without re-application", async ({ page }) => {
    await page.goto("/design");
    const ledger = page.locator("#sourcing");
    await ledger.getByRole("button", { name: "Accept shortfall" }).first().click();
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await expect(ledger.getByText("Shortfall accepted")).toBeVisible();
  });

  test("login flow preview reaches the officer confirmation", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Mobile number").fill("9876543210");
    await page.getByRole("button", { name: /Send OTP/ }).click();
    const first = page.getByRole("textbox", { name: "Character 1 of 6" });
    await first.click();
    await page.keyboard.type("123456", { delay: 40 });
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  });

  test("no horizontal scrolling on any main screen", async ({ page }) => {
    for (const path of ["/dashboard", "/design", "/login", "/plans"]) {
      await page.goto(path);
      // Compare with the *visual* viewport: on phones the layout viewport silently widens to fit wide content.
      const overflow = await page.evaluate(() => Math.round(document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth)));
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

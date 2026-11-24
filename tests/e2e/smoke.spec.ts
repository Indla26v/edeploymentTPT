import { expect, test } from "@playwright/test";

import { authFile } from "./helpers";

test.describe("design system (administrators only)", () => {
  test.use({ storageState: authFile("admin") });

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

  test("no horizontal scrolling on the admin screens", async ({ page }) => {
    for (const path of ["/dashboard", "/design", "/account", "/admin/users"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => Math.round(document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth)));
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("design system for other roles", () => {
  test.use({ storageState: authFile("sp") });
  test("is not available", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByText("No access")).toBeVisible();
  });
  test("unknown pages show a friendly not-found page", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});

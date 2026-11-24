import { expect, test } from "@playwright/test";

import { authFile } from "./helpers";

test.describe("design system and overflow", () => {
  test.use({ storageState: authFile("sp") });

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

  test("no horizontal scrolling on any main screen", async ({ page }) => {
    for (const path of ["/dashboard", "/design", "/plans", "/account", "/admin/users"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => Math.round(document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth)));
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

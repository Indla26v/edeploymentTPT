import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { authFile } from "./helpers";

/** WCAG 2.1 A/AA checks on the main screens; serious and critical issues fail the build. */
async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".leaflet-container") // third-party map tiles
    .analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
  expect(bad, `${path}\n${report}`).toEqual([]);
}

test.describe("accessibility", () => {
  test.skip(({ isMobile }) => isMobile, "desktop audit is enough; layouts share components");

  test("sign-in page", async ({ page }) => {
    await audit(page, "/login");
  });

  test.describe("Unit Officer screens", () => {
    test.use({ storageState: authFile("sp") });
    for (const path of ["/dashboard", "/plans", "/plans/new", "/masters/persons", "/masters/stations", "/masters/points", "/masters/equipment", "/masters/transfers", "/account"]) {
      test(path, async ({ page }) => audit(page, path));
    }
  });

  test.describe("Office screens", () => {
    test.use({ storageState: authFile("om") });
    for (const path of ["/office/tasks", "/office/meetings", "/office/appointments", "/office/reports", "/office/notes"]) {
      test(path, async ({ page }) => audit(page, path));
    }
  });

  test.describe("Office Incharge screens", () => {
    test.use({ storageState: authFile("sho.town1") });
    for (const path of ["/station/requests", "/station/duty-pass", "/station/equipment"]) {
      test(path, async ({ page }) => audit(page, path));
    }
  });
});

import { expect, test } from "@playwright/test";

import { authFile } from "./helpers";

const MASTER_PAGES: [string, string][] = [
  ["/masters/persons", "Police persons"],
  ["/masters/stations", "Stations & offices"],
  ["/masters/ranks", "Police ranks"],
  ["/masters/units", "State police units"],
  ["/masters/components", "Components"],
  ["/masters/points", "Deployment points"],
  ["/masters/equipment", "Equipment"],
  ["/masters/accommodation", "Accommodation"],
  ["/masters/vehicles", "Vehicles"],
  ["/masters/teams", "Teams"],
  ["/masters/shifts", "Shifts"],
  ["/masters/instructions", "Instructions library"],
  ["/masters/id-card-headers", "ID card headers"],
  ["/masters/transfers", "Transfer requests"],
  ["/masters/unit-profile", "Unit profile"],
];

test.describe("masters as the Unit Officer", () => {
  test.use({ storageState: authFile("sp") });

  test("every masters screen loads without horizontal scroll", async ({ page }) => {
    for (const [path, title] of MASTER_PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title }), path).toBeVisible();
      const overflow = await page.evaluate(() => Math.round(document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth)));
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });

  test("stations list toggles to the map", async ({ page }) => {
    await page.goto("/masters/stations");
    await expect(page.getByText("Town I PS").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("radio", { name: "Map" }).click();
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });

  test("add a deployment point and find it in the library", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data; runs once");
    const name = `E2E point ${Date.now()}`;
    await page.goto("/masters/points");
    await page.getByRole("button", { name: "Add point" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Point name").fill(name);
    await sheet.getByLabel("Latitude").fill("16.51");
    await sheet.getByLabel("Longitude").fill("80.64");
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Point added")).toBeVisible();
    await page.getByPlaceholder("Point, station, description…").fill(name);
    await expect(page.getByText(name).filter({ visible: true })).toBeVisible();
  });
});

test.describe("transfers: Office Incharge requests, Unit Officer approves", () => {
  test("round trip", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "writes data; runs once");
    const oi = await browser.newContext({ storageState: authFile("sho.town1") });
    const p1 = await oi.newPage();
    await p1.goto("/masters/transfers");
    await p1.getByRole("button", { name: "Request transfer" }).click();
    const sheet = p1.getByRole("dialog");
    await sheet.getByRole("button", { name: /Name, Gen No or mobile/ }).click();
    const option = p1.getByRole("option").nth(3);
    await option.waitFor();
    const officer = (await option.locator("span.truncate, span").nth(1).textContent())?.trim() ?? "";
    await option.click();
    await sheet.getByLabel("Transfer to").click();
    await p1.getByRole("option", { name: "Harbour PS" }).click();
    await sheet.getByLabel("Reason").fill("E2E transfer test");
    await sheet.getByRole("button", { name: "Send request" }).click();
    await expect(p1.getByText("Transfer requested")).toBeVisible();
    await oi.close();

    const uo = await browser.newContext({ storageState: authFile("sp") });
    const p2 = await uo.newPage();
    await p2.goto("/masters/transfers");
    const row = p2.getByRole("row").filter({ hasText: "E2E transfer test" }).first();
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(p2.getByText("Transfer approved")).toBeVisible();
    await expect(row.getByText("Approved")).toBeVisible();
    expect(officer.length).toBeGreaterThan(0);
    await uo.close();
  });
});

test.describe("Office Incharge scope", () => {
  test.use({ storageState: authFile("sho.town1") });

  test("sees only their own station in the stations list", async ({ page }) => {
    await page.goto("/masters/stations");
    await expect(page.getByText("Town I PS").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Town II PS").filter({ visible: true })).toHaveCount(0);
  });
});

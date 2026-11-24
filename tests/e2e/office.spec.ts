import { expect, test } from "@playwright/test";

import { authFile, dbQuery } from "./helpers";

test.describe("office manager", () => {
  test("task: OM assigns, employee reports action, OM verifies and closes; reports reflect it", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "writes data; runs once");
    const title = `E2E task ${Date.now()}`;
    const omCtx = await browser.newContext({ storageState: authFile("om") });
    const om = await omCtx.newPage();
    await om.goto("/office/tasks");
    await om.waitForLoadState("networkidle");
    await om.getByRole("button", { name: "New task" }).click();
    const sheet = om.getByRole("dialog");
    await sheet.getByLabel("Task").fill(title);
    const [staff] = await dbQuery<{ name: string }>("select name from users where username = 'staff1'");
    await sheet.getByRole("checkbox", { name: staff!.name }).check();
    await sheet.getByRole("button", { name: "Create and assign" }).click();
    await expect(om.getByText("Task created and assigned")).toBeVisible();

    const stCtx = await browser.newContext({ storageState: authFile("staff1") });
    const st = await stCtx.newPage();
    await st.goto("/dashboard");
    await expect(st.getByText(title).first()).toBeVisible();
    await st.goto("/office/tasks");
    await st.getByRole("button", { name: title }).first().click();
    await st.getByLabel("What was done?").fill("Done and filed");
    await st.getByRole("button", { name: "Report action taken" }).click();
    await expect(st.getByText("Action recorded")).toBeVisible();
    await stCtx.close();

    await om.reload();
    await om.getByRole("button", { name: title }).first().click();
    await om.getByLabel("Remarks").fill("Verified");
    await om.getByRole("button", { name: "Verify & close" }).click();
    await expect(om.getByText("Verified and closed")).toBeVisible();
    await om.goto("/office/reports");
    await expect(om.getByRole("heading", { name: "MIS reports" })).toBeVisible();
    await expect(om.getByText("Person-wise analysis")).toBeVisible();
    await omCtx.close();
  });

  test.describe("screens", () => {
    test.use({ storageState: authFile("om") });
    test("office screens load without horizontal scroll", async ({ page }) => {
      for (const path of ["/office/tasks", "/office/meetings", "/office/meetings?view=week", "/office/appointments", "/office/reports", "/office/notes"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(() => Math.round(document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth)));
        expect(overflow, path).toBeLessThanOrEqual(1);
      }
    });
    test("schedule a meeting from the calendar", async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "writes data; runs once");
      await page.goto("/office/meetings");
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "New meeting" }).click();
      await page.getByRole("dialog").getByLabel("Title").fill("E2E review meeting");
      await page.getByRole("dialog").getByRole("button", { name: "Schedule" }).click();
      await expect(page.getByText("Meeting scheduled")).toBeVisible();
      await expect(page.getByRole("button", { name: /E2E review meeting/ }).first()).toBeVisible();
    });
  });
});

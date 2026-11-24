import { expect, test } from "@playwright/test";

import { authFile, dbQuery } from "./helpers";

test.describe("plan → propose → consolidate (UI)", () => {
  test("IO initiates, CO proposes, IO consolidates, UO sources, OI commits less, UO accepts the shortfall", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "writes data; runs once");
    test.setTimeout(180_000);
    const title = `E2E Bandobast ${Date.now()}`;
    const [co] = await dbQuery<{ gen_no: string; name: string }>("select p.gen_no, p.name from users u join persons p on p.id = u.person_id where u.username = 'dsp1'");
    const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);

    // 1. Initiating Officer
    const ioCtx = await browser.newContext({ storageState: authFile("addlsp") });
    const io = await ioCtx.newPage();
    await io.goto("/plans/new");
    await io.waitForLoadState("networkidle");
    await io.getByLabel("Bandobast name").fill(title);
    await io.getByLabel("Venue", { exact: true }).fill("Town ground");
    await io.getByLabel("Date 1", { exact: true }).fill(tomorrow);
    await io.getByRole("button", { name: "Create draft" }).click();
    await io.waitForURL(/\/setup\?step=1/);
    await io.getByLabel("Component 1 name").fill("Law & Order E2E");
    await io.getByRole("button", { name: "Component Officer…" }).click();
    await io.getByPlaceholder("Component Officer…").fill(co!.gen_no);
    await io.getByRole("option", { name: new RegExp(co!.name) }).click();
    await io.getByRole("button", { name: "Next" }).click();
    await io.getByRole("button", { name: "Fill standard schedule" }).click();
    await io.getByRole("button", { name: "Next" }).click();
    await io.getByRole("button", { name: "Next" }).click();
    await io.getByRole("button", { name: "Send to Component Officers" }).click();
    await io.waitForURL(/\/plans\/[0-9a-f-]{36}$/);
    const planUrl = io.url();
    await expect(io.getByText("Proposals open").first()).toBeVisible();

    // 2. Component Officer
    const coCtx = await browser.newContext({ storageState: authFile("dsp1") });
    const cop = await coCtx.newPage();
    await cop.goto("/plans");
    await cop.getByRole("row").filter({ hasText: title }).getByRole("link", { name: /Propose/ }).click();
    await expect(cop.getByRole("button", { name: "Add sector" }).first()).toBeEnabled();
    await expect(async () => {
      await cop.getByRole("button", { name: "Add sector" }).first().click();
      await expect(cop.getByLabel("Sector 1 name")).toBeVisible({ timeout: 1000 });
    }).toPass();
    await cop.getByRole("button", { name: "Next" }).click();
    await cop.getByRole("button", { name: "From library" }).click();
    const libItem = cop.getByRole("menuitem").first();
    const pointName = ((await libItem.textContent()) ?? "").replace(/^P\d/, "").trim();
    await libItem.click();
    await cop.getByRole("button", { name: "Next" }).click();
    await cop.getByLabel(`PC at ${pointName}`).fill("4");
    for (let i = 0; i < 3; i++) await cop.getByRole("button", { name: "Next" }).click();
    await expect(cop.getByText("Looks complete")).toBeVisible();
    await cop.getByRole("button", { name: "Submit to Initiating Officer" }).click();
    await expect(cop.getByText(/Submitted — \d+ men proposed/)).toBeVisible();
    await coCtx.close();

    // 3. Initiating Officer consolidates: inline edit (no return loop), then send
    await io.goto(`${planUrl}/consolidate`);
    const cell = io.getByLabel(`PC at ${pointName}`);
    await expect(cell).toHaveValue("4");
    await cell.fill("6");
    await cell.press("Enter");
    await expect(io.getByText("Submitted").first()).toBeVisible();
    await expect(io.locator("text=Men required").locator("..").getByText("7")).toBeVisible(); // 6 PC + 1 sector incharge
    await io.getByRole("button", { name: "Send to Unit Officer" }).click();
    await io.getByRole("dialog").getByRole("button", { name: "Send" }).click();
    await io.waitForURL(planUrl);
    await expect(io.getByText("Force sourcing").first()).toBeVisible();
    await io.getByRole("tab", { name: "Timeline" }).click();
    await expect(io.getByText(/IO changed Law & Order E2E/)).toBeVisible();
    await ioCtx.close();

    // 4. Unit Officer distributes: everything to Town I PS
    const uoCtx = await browser.newContext({ storageState: authFile("sp") });
    const uo = await uoCtx.newPage();
    await uo.goto(`${planUrl}/sourcing`);
    await uo.waitForLoadState("networkidle");
    const cells = uo.locator("tbody input:not([disabled])");
    for (let i = 0; i < (await cells.count()); i++) await cells.nth(i).fill("0");
    await uo.getByLabel("PC from Town I PS").fill("6");
    await uo.getByLabel("SI from Town I PS").fill("1");
    await uo.getByRole("button", { name: "Request 7 men" }).click();
    await expect(uo.getByText("Reconciliation ledger")).toBeVisible();

    // 5. Office Incharge commits 4 of 6 PC with a reason and names officers
    const oiCtx = await browser.newContext({ storageState: authFile("sho.town1") });
    const oi = await oiCtx.newPage();
    await oi.goto("/station/requests");
    await oi.locator("li").filter({ hasText: title }).getByRole("link", { name: /Reply/ }).click();
    await oi.waitForLoadState("networkidle");
    await oi.getByLabel("PC you can give").fill("4");
    await oi.getByLabel("Why fewer PC").click();
    await oi.getByRole("option", { name: "Station law & order duty" }).click();
    await oi.getByRole("button", { name: "Send reply" }).click();
    await expect(oi.getByText("2. Name your officers")).toBeVisible();
    const fill = oi.getByRole("button", { name: /^Fill \d+/ });
    while ((await fill.count()) > 0) await fill.first().click();
    await expect(oi.getByText("5 of 5 named")).toBeVisible();
    await oi.getByRole("button", { name: "Send nominal roll" }).click();
    await expect(oi.getByText(/Nominal roll sent/)).toBeVisible();
    await oiCtx.close();

    // 6. Unit Officer accepts the shortfall — nothing goes back to the IO / CO — and moves on
    await uo.reload();
    await expect(uo.getByText("Short by 2").first()).toBeVisible();
    await uo.getByRole("button", { name: "Accept shortfall" }).click();
    await uo.getByRole("button", { name: "Accept and continue" }).click();
    await expect(uo.getByText("Shortfall accepted").first()).toBeVisible();
    await uo.getByRole("button", { name: "Proceed to placement" }).click();
    await expect(uo.getByText("Placement").first()).toBeVisible();
    await uo.goto(planUrl);
    await expect(uo.getByText("Law & Order E2E").first()).toBeVisible();
    await expect(uo.getByRole("row").filter({ hasText: "Law & Order E2E" }).getByText("Accepted")).toBeVisible();
    await uoCtx.close();
  });
});

test.describe("plans as Unit Officer", () => {
  test.use({ storageState: authFile("sp") });
  test("plans list, new plan and completed plans load without overflow", async ({ page }) => {
    for (const path of ["/plans", "/plans/new", "/plans/completed"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => Math.round(document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth)));
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

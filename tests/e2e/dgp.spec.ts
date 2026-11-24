import { expect, test } from "@playwright/test";

import { planToSourcing } from "./flows";
import { authFile } from "./helpers";

test.describe("inter-district (DGP)", () => {
  test("UO sends a gap to the Chief Office, DGP asks North district, North commits and names officers, the plan's ledger rises", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "writes data; runs once");
    test.setTimeout(240_000);
    const title = `E2E Inter-district ${Date.now()}`;
    const { planUrl } = await planToSourcing(browser, title);

    // 1. Demo district UO asks its own station only for the SI, then sends the PC gap to the Chief Office.
    const uoCtx = await browser.newContext({ storageState: authFile("sp") });
    const uo = await uoCtx.newPage();
    await uo.goto(`${planUrl}/sourcing`);
    await uo.waitForLoadState("networkidle");
    const cells = uo.locator("tbody input:not([disabled])");
    for (let i = 0; i < (await cells.count()); i++) await cells.nth(i).fill("0");
    await uo.locator('input[aria-label^="SI from "]:not([disabled])').first().fill("1");
    await uo.getByRole("button", { name: "Request 1 men" }).click();
    await expect(uo.getByText("Reconciliation ledger")).toBeVisible();
    await uo.getByRole("button", { name: "Send to Chief Office" }).click();
    await uo.getByLabel("Note for the Chief Office").fill("Town festival, local strength exhausted");
    await uo.getByRole("dialog").getByRole("button", { name: "Send", exact: true }).click();
    await expect(uo.getByText("With the Chief Office").first()).toBeVisible();

    // 2. DGP distributes the 6 PC to North district.
    const dgpCtx = await browser.newContext({ storageState: authFile("dgp") });
    const dgp = await dgpCtx.newPage();
    await dgp.goto("/dashboard");
    await expect(dgp.getByText(/unit requests? to distribute/)).toBeVisible();
    await dgp.goto("/dgp/requirements");
    await dgp.locator("li").filter({ hasText: title }).getByRole("link", { name: /Distribute/ }).click();
    await dgp.waitForLoadState("networkidle");
    const grid = dgp.locator("tbody input:not([disabled])");
    for (let i = 0; i < (await grid.count()); i++) await grid.nth(i).fill("0");
    await dgp.getByLabel("PC from North Demo District").fill("6");
    await dgp.getByRole("button", { name: "Send to units" }).click();
    await expect(dgp.getByText("Awaiting reply")).toBeVisible();
    await dgpCtx.close();

    // 3. North UO commits 4 of 6 with a reason and asks North Town PS for them.
    const northCtx = await browser.newContext({ storageState: authFile("sp.north") });
    const north = await northCtx.newPage();
    await north.goto("/requirements/incoming");
    await north.locator("li").filter({ hasText: title }).getByRole("link", { name: /Reply/ }).click();
    await north.waitForLoadState("networkidle");
    await north.getByLabel("PC your unit can give").fill("4");
    await north.getByLabel("Reason for fewer PC").click();
    await north.getByRole("option", { name: "Men on own bandobast" }).click();
    await north.getByRole("button", { name: "Send reply" }).click();
    await expect(north.getByText("Ask your stations")).toBeVisible();
    await north.reload();
    await north.waitForLoadState("networkidle");
    const sts = north.locator("tbody input:not([disabled])");
    for (let i = 0; i < (await sts.count()); i++) await sts.nth(i).fill("0");
    await north.getByLabel("PC from North Town PS").fill("4");
    await expect(north.getByText("4/4")).toBeVisible();
    await north.getByRole("button", { name: "Send to stations" }).click();
    await expect(north.getByText("Station replies")).toBeVisible();

    // 4. North Town PS commits all 4 and names them.
    const oiCtx = await browser.newContext({ storageState: authFile("sho.north1") });
    const oi = await oiCtx.newPage();
    await oi.goto("/station/requests");
    await oi.locator("li").filter({ hasText: title }).getByRole("link", { name: /Reply/ }).click();
    await oi.waitForLoadState("networkidle");
    await oi.getByRole("button", { name: "Send reply" }).click();
    await expect(oi.getByText("2. Name your officers")).toBeVisible();
    const fill = oi.getByRole("button", { name: /^Fill \d+/ });
    while ((await fill.count()) > 0) await fill.first().click();
    await expect(oi.getByText("4 of 4 named")).toBeVisible();
    await oi.getByRole("button", { name: "Send nominal roll" }).click();
    await expect(oi.getByText(/Nominal roll sent/)).toBeVisible();
    await oiCtx.close();

    await north.reload();
    await expect(north.getByText("4 named").first()).toBeVisible();
    // North can't open the requesting plan itself.
    await north.goto(planUrl);
    await expect(north.getByText(/No access|doesn.t exist/).first()).toBeVisible();
    await northCtx.close();

    // 5. Back in the requesting plan: North's 4 PC count as committed; 2 PC still short.
    await uo.reload();
    await expect(uo.getByText("North Demo District").first()).toBeVisible();
    await expect(uo.getByText("Short by 2").first()).toBeVisible();
    await uoCtx.close();
  });
});

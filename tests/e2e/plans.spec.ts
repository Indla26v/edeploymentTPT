import { expect, test } from "@playwright/test";

import { signCheckinToken } from "../../src/lib/execution/qr";
import { planToSourcing } from "./flows";
import { authFile, dbQuery } from "./helpers";

test.describe("plan → propose → consolidate (UI)", () => {
  test("IO initiates, CO proposes, IO consolidates, UO sources, OI commits less, UO accepts the shortfall", async ({
    browser,
  }, info) => {
    test.skip(info.project.name !== "desktop", "writes data; runs once");
    test.setTimeout(180_000);
    const title = `E2E Bandobast ${Date.now()}`;
    const { planUrl } = await planToSourcing(browser, title);

    // 4. Unit Officer distributes: everything to Town I PS
    const uoCtx = await browser.newContext({ storageState: authFile("sp") });
    const uo = await uoCtx.newPage();
    await uo.goto(`${planUrl}/sourcing`);
    await uo.waitForLoadState("networkidle");
    const cells = uo.locator("tbody input:not([disabled])");
    for (let i = 0; i < (await cells.count()); i++)
      await cells.nth(i).fill("0");
    await uo.getByLabel("PC from Town I PS").fill("6");
    await uo.getByLabel("SI from Town I PS").fill("1");
    await uo.getByRole("button", { name: "Request 7 men" }).click();
    await expect(uo.getByText("Reconciliation ledger")).toBeVisible();

    // 5. Office Incharge commits 4 of 6 PC with a reason and names officers
    const oiCtx = await browser.newContext({
      storageState: authFile("sho.town1"),
    });
    const oi = await oiCtx.newPage();
    await oi.goto("/station/requests");
    await oi
      .locator("li")
      .filter({ hasText: title })
      .getByRole("link", { name: /Reply/ })
      .click();
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
    await expect(
      uo
        .getByRole("row")
        .filter({ hasText: "Law & Order E2E" })
        .getByText("Accepted"),
    ).toBeVisible();
    await uoCtx.close();

    // 7. Component Officer: suggest, leave the two short PC slots unfilled, mark ready
    const co2Ctx = await browser.newContext({ storageState: authFile("dsp1") });
    const co2 = await co2Ctx.newPage();
    await co2.goto(`${planUrl}/placement`);
    await co2.waitForLoadState("networkidle");
    await expect(co2.getByText("0 / 7 placed")).toBeVisible();
    // Drag the SI from the pool onto the sector-incharge slot, undo it, then place via the keyboard path.
    const handle = co2
      .locator("aside")
      .getByRole("button", { name: /^Drag / })
      .first();
    const target = co2
      .getByText("SI", { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'border-dashed')][1]")
      .first();
    const hb = (await handle.boundingBox())!;
    const tb = (await target.boundingBox())!;
    await co2.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await co2.mouse.down();
    await co2.mouse.move(hb.x + 20, hb.y + 20, { steps: 5 });
    await co2.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, {
      steps: 15,
    });
    await co2.mouse.up();
    await expect(co2.getByText("1 / 7 placed")).toBeVisible();
    await co2.getByRole("button", { name: "Undo" }).click();
    await expect(co2.getByText("0 / 7 placed")).toBeVisible();
    await co2
      .locator("aside")
      .getByRole("button", { name: /^Place .* in…$/ })
      .first()
      .click();
    await co2
      .getByRole("dialog")
      .getByRole("button")
      .filter({ hasText: "Sector" })
      .first()
      .click();
    await expect(co2.getByText("1 / 7 placed")).toBeVisible();
    await co2.getByRole("button", { name: "Suggest" }).click();
    await expect(co2.getByText("5 / 7 placed")).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await co2.getByRole("button", { name: "Leave unfilled" }).first().click();
      await expect(co2.getByText(`5 / ${6 - i} placed`)).toBeVisible();
    }
    // Nothing has been sent to officers yet.
    const before = await dbQuery<{ n: number }>(
      "select count(*)::int n from notifications_outbox where template like 'duty.%' and payload->>'plan' = $1",
      [title],
    );
    expect(before[0]!.n).toBe(0);
    await co2.getByRole("button", { name: "Mark ready" }).click();
    await expect(co2.getByText(/Marked ready/)).toBeVisible();
    await co2Ctx.close();

    // 8. Initiating Officer publishes — every placed officer is notified once
    const io2Ctx = await browser.newContext({
      storageState: authFile("addlsp"),
    });
    const io2 = await io2Ctx.newPage();
    await io2.goto(`${planUrl}/placement`);
    await io2.waitForLoadState("networkidle");
    await io2.getByRole("button", { name: "Publish" }).first().click();
    await io2
      .getByRole("dialog")
      .getByRole("button", { name: "Publish" })
      .click();
    await expect(io2.getByText("5 officers notified")).toBeVisible();
    const after = await dbQuery<{ n: number }>(
      "select count(*)::int n from notifications_outbox where template like 'duty.%' and payload->>'plan' = $1",
      [title],
    );
    expect(after[0]!.n).toBe(5);

    // 9. ID cards PDF, go live, an officer checks in by scanning the QR, the live count updates
    const planId = planUrl.split("/").pop()!;
    const pdf = await io2.request.get(`/api/plans/${planId}/id-cards?layout=6`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    await io2.goto(planUrl);
    await io2.getByRole("button", { name: "Go live" }).click();
    await expect(io2.getByText("Live").first()).toBeVisible();
    const [officer] = await dbQuery<{ person_id: string }>(
      "select (snapshot->0->>'personId') person_id from plan_publications where plan_id = $1 order by version desc limit 1",
      [planId],
    );
    const phone = await browser.newContext({
      ...(await import("@playwright/test")).devices["Pixel 7"],
    });
    const scan = await phone.newPage();
    await scan.goto(`/c/${signCheckinToken(planId, officer!.person_id)}`);
    await scan.getByRole("button", { name: "Check in" }).click();
    await expect(
      scan.getByText("Checked in. Report to your posting."),
    ).toBeVisible();
    await scan.goto(
      `/c/${signCheckinToken(planId, officer!.person_id).slice(0, -3)}xyz`,
    );
    await expect(scan.getByText("This QR code is not valid")).toBeVisible();
    await phone.close();
    await io2.goto(`${planUrl}/live`);
    await expect(io2.getByRole("button", { name: /^Present 1/ })).toBeVisible();
    await io2Ctx.close();
  });
});

test.describe("plans as Unit Officer", () => {
  test.use({ storageState: authFile("sp") });
  test("plans list, new plan and completed plans load without overflow", async ({
    page,
  }) => {
    for (const path of ["/plans", "/plans/new", "/plans/completed"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() =>
        Math.round(
          document.documentElement.scrollWidth -
            (window.visualViewport?.width ?? window.innerWidth),
        ),
      );
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

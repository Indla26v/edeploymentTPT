import { type Browser, expect } from "@playwright/test";

import { authFile, dbQuery } from "./helpers";

/** IO initiates a one-component plan, the CO proposes 4 PC at a library point, the IO edits it to 6 inline and sends it to the UO. */
export async function planToSourcing(browser: Browser, title: string) {
  const [co] = await dbQuery<{ gen_no: string; name: string }>(
    "select p.gen_no, p.name from users u join persons p on p.id = u.person_id where u.username = 'dsp1'",
  );
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
  await cop
    .getByRole("row")
    .filter({ hasText: title })
    .getByRole("link", { name: /Propose/ })
    .click();
  await expect(
    cop.getByRole("button", { name: "Add sector" }).first(),
  ).toBeEnabled();
  await expect(async () => {
    await cop.getByRole("button", { name: "Add sector" }).first().click();
    await expect(cop.getByLabel("Sector 1 name")).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await cop.getByRole("button", { name: "Next" }).click();
  await cop.getByRole("button", { name: "From library" }).click();
  const libItem = cop.getByRole("menuitem").first();
  const pointName = ((await libItem.textContent()) ?? "")
    .replace(/^P\d/, "")
    .trim();
  await libItem.click();
  await cop.getByRole("button", { name: "Next" }).click();
  await cop.getByLabel(`PC at ${pointName}`).fill("4");
  for (let i = 0; i < 3; i++)
    await cop.getByRole("button", { name: "Next" }).click();
  await expect(cop.getByText("Looks complete")).toBeVisible();
  await cop
    .getByRole("button", { name: "Submit to Initiating Officer" })
    .click();
  await expect(cop.getByText(/Submitted — \d+ men proposed/)).toBeVisible();
  await coCtx.close();

  // 3. Initiating Officer consolidates: inline edit (no return loop), then send
  await io.goto(`${planUrl}/consolidate`);
  const cell = io.getByLabel(`PC at ${pointName}`);
  await expect(cell).toHaveValue("4");
  await cell.fill("6");
  await cell.press("Enter");
  await expect(io.getByText("Submitted").first()).toBeVisible();
  await expect(
    io.locator("text=Men required").locator("..").getByText("7"),
  ).toBeVisible(); // 6 PC + 1 sector incharge
  await io.getByRole("button", { name: "Send to Unit Officer" }).click();
  await io.getByRole("dialog").getByRole("button", { name: "Send" }).click();
  await io.waitForURL(planUrl);
  await expect(io.getByText("Force sourcing").first()).toBeVisible();
  await io.getByRole("tab", { name: "Timeline" }).click();
  await expect(io.getByText(/IO changed Law & Order E2E/)).toBeVisible();
  await ioCtx.close();
  return { planUrl, pointName };
}

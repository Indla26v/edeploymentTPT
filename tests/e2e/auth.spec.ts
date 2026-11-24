import { expect, test } from "@playwright/test";

import { authFile } from "./helpers";

test.describe("signed out", () => {
  test("protected pages redirect to the login page, which offers demo accounts", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Demo accounts")).toBeVisible();
  });

  test("a wrong password shows a clear message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("no-such-user");
    await page.getByLabel("Password", { exact: true }).fill("Wrong@12345");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Wrong username or password.")).toBeVisible();
  });
});

test.describe("Unit Officer", () => {
  test.use({ storageState: authFile("sp") });

  test("sees their unit and can switch role", async ({ page, isMobile }) => {
    await page.goto("/dashboard");
    await expect(page.locator("header").getByText("Demo District Police")).toBeVisible();
    await expect(page.getByText("400", { exact: true })).toBeVisible();
    test.skip(isMobile, "role switch lives in the mobile nav sheet");
    await page.getByRole("radio", { name: "Initiating Officer" }).click();
    await expect(page.getByRole("radio", { name: "Initiating Officer" })).toHaveAttribute("aria-checked", "true");
    // switch back so other tests start as Unit Officer
    await page.getByRole("radio", { name: "Unit Officer" }).click();
    await expect(page.getByRole("radio", { name: "Unit Officer" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Office Incharge", () => {
  test.use({ storageState: authFile("sho.town1") });

  test("is scoped to the station and cannot open user admin", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("header").getByText("Town I PS")).toBeVisible();
    await page.goto("/admin/users");
    await expect(page.getByText("No access")).toBeVisible();
  });
});

test.describe("State Admin", () => {
  test.use({ storageState: authFile("admin") });

  test("manages users and permissions", async ({ page, isMobile }) => {
    await page.goto("/admin/users");
    await expect(page.getByText("sho.town1").filter({ visible: true }).first()).toBeVisible();
    test.skip(isMobile, "matrix is a desktop screen");
    await page.goto("/admin/roles");
    await expect(page.getByRole("checkbox", { name: "Unit Officer: Distribute force to stations" })).toBeChecked();
  });
});

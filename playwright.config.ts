import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE,
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, dependencies: ["setup"] },
    { name: "phone", use: { ...devices["Pixel 7"] }, dependencies: ["setup"] },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `${BASE}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { BETTER_AUTH_URL: BASE },
  },
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 2,
  reporter: "list",
  timeout: 60000,
  expect: {
    timeout: 25000,
  },
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    actionTimeout: 25000,
    navigationTimeout: 35000,
    trace: "on-first-retry",
    extraHTTPHeaders: {
      Origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      USE_MOCK_STORE: "true",
    },
  },
});

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const WEB_ROOT = dirname(fileURLToPath(import.meta.url));
const WEB_ORIGIN = "http://127.0.0.1:5197";

export default defineConfig({
  testDir: "./e2e-marketplace",
  testMatch: /super-admin-navigation-a11y\.spec\.ts/,
  outputDir: join(WEB_ROOT, ".playwright", "seller-subscription-results"),
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [
    ["line"],
    [
      "html",
      {
        outputFolder: join(WEB_ROOT, ".playwright", "seller-subscription-report"),
        open: "never",
      },
    ],
  ],
  use: {
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    blockServiceWorkers: "block",
  },
  webServer: {
    command:
      "VITE_DEPLOY_ENV=development VITE_API_BASE=/api VITE_SOCKET_PATH=/socket.io VITE_STRIPE_PUBLISHABLE_KEY=pk_test_seller_subscription_ci_only npm run dev -- --host 127.0.0.1 --port 5197 --strictPort",
    url: WEB_ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});

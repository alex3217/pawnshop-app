import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  defineConfig,
  devices,
} from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-marketplace",

  outputDir: join(
    tmpdir(),
    "pawnshop-marketplace-checkout-results",
  ),
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,

  expect: {
    timeout: 8_000,
  },

  reporter: [
    ["line"],
  ],

  use: {
    baseURL:
      "http://127.0.0.1:5186",
    trace:
      "retain-on-failure",
  },

  webServer: {
    command:
      "VITE_STRIPE_PUBLISHABLE_KEY=pk_test_marketplace_browser_only npm run dev -- --host 127.0.0.1 --port 5186 --strictPort",

    url:
      "http://127.0.0.1:5186",

    reuseExistingServer:
      false,

    timeout:
      120_000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices[
          "Desktop Chrome"
        ],
      },
    },
  ],
});

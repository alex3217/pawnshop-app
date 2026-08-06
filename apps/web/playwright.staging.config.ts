import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

import {
  stagingApiOrigin,
  stagingFrontendOrigin,
} from "./e2e-staging/fixtures/staging-origins";

const WEB_ROOT = dirname(fileURLToPath(import.meta.url));

// Both origins are evaluated during config loading so `--list` validates their
// shape without opening a browser or making a network request.
void stagingApiOrigin;

export default defineConfig({
  testDir: "./e2e-staging",
  outputDir: join(WEB_ROOT, ".playwright", "staging-results"),
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["line"],
    [
      "html",
      {
        outputFolder: join(WEB_ROOT, ".playwright", "staging-report"),
        open: "never",
      },
    ],
  ],
  use: {
    baseURL: stagingFrontendOrigin,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    blockServiceWorkers: "block",
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "buyer-readonly",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: join(WEB_ROOT, "e2e-staging", ".auth", "buyer.json"),
      },
    },
  ],
});

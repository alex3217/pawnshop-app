import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const criticalSpecs = /(?:release-candidate-accessibility|auth-401-regression|route-protection)\.spec\.ts/;
const criticalTitles = /(?:serious automated accessibility violations|authentication landmarks, labels, names, and keyboard focus|authenticated 401|incorrect login|registration failure|ordinary 403|authenticated CONSUMER|refresh preserves|logout clears|direct Buyer dashboard|fresh unauthenticated|Buyer cannot access|wrong-role users|public routes remain accessible)/;
const mobileSpecs = /(?:release-candidate-accessibility|global-readability-regression|marketplace-map-readability)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e-marketplace",
  outputDir: join(".playwright", "release-candidate-results"),
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["line"],
    ["html", { outputFolder: ".playwright/release-candidate-report", open: "never" }],
    ["json", { outputFile: ".playwright/release-candidate-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5186",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/start-release-candidate-server.mjs",
    url: "http://127.0.0.1:5186",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-critical", testMatch: criticalSpecs, grep: criticalTitles, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-critical", testMatch: criticalSpecs, grep: criticalTitles, use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", testMatch: mobileSpecs, use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", testMatch: mobileSpecs, use: { ...devices["iPhone 14"] } },
  ],
});

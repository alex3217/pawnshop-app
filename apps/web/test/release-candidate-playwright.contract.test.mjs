import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../../.github/workflows/release-candidate-qa.yml", import.meta.url), "utf8");
const config = await readFile(new URL("../playwright.release-candidate.config.ts", import.meta.url), "utf8");
const viteConfig = await readFile(new URL("../vite.release-candidate.config.ts", import.meta.url), "utf8");
const packageLock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const chromiumJob = workflow.slice(
  workflow.indexOf("  chromium-release-candidate:"),
  workflow.indexOf("  cross-browser-critical:"),
);
const crossBrowserJob = workflow.slice(
  workflow.indexOf("  cross-browser-critical:"),
  workflow.indexOf("  qa-contracts:"),
);
const playwrightVersions = ["@playwright/test", "playwright", "playwright-core"].map(
  (packageName) => packageLock.packages[`node_modules/${packageName}`]?.version,
);
const [playwrightVersion] = playwrightVersions;
const pinnedPlaywrightImage = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;

test("release-candidate browser jobs use the lockfile-matched Playwright container", () => {
  assert.ok(playwrightVersion, "package-lock.json must resolve Playwright");
  assert.deepEqual(playwrightVersions, [playwrightVersion, playwrightVersion, playwrightVersion]);
  assert.equal(playwrightVersion, "1.62.0");

  for (const job of [chromiumJob, crossBrowserJob]) {
    assert.match(
      job,
      new RegExp(`^\\s+image: ${pinnedPlaywrightImage.replaceAll(".", "\\.")}$`, "m"),
    );
    assert.match(job, /options: --user 1001 --ipc=host --init/);
    assert.match(job, /node-version: 20\.20\.2/);
    assert.match(job, /npm --prefix apps\/web ci/);
  }
  assert.equal(workflow.split(`image: ${pinnedPlaywrightImage}`).length - 1, 2);

  assert.doesNotMatch(workflow, /playwright install --with-deps/);
  assert.doesNotMatch(workflow, /Acquire::/);
  assert.doesNotMatch(workflow, /PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT/);
});

test("release-candidate CI shards the full Chromium suite with strict artifacts", () => {
  assert.match(workflow, /push:\n    branches:\n      - fix\/release-candidate-qa-accessibility-v1/);
  assert.match(workflow, /shard: \[1, 2, 3, 4\]/);
  assert.match(workflow, /--project=chromium --shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(chromiumJob, /timeout-minutes: 30/);
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.match(config, /trace: "retain-on-failure"/);
  assert.match(config, /screenshot: "only-on-failure"/);
  assert.match(config, /video: "retain-on-failure"/);
});

test("release-candidate CI covers critical engines and representative mobile viewports", () => {
  assert.match(workflow, /firefox-critical/);
  assert.match(workflow, /webkit-critical/);
  assert.match(workflow, /mobile-chromium/);
  assert.match(workflow, /mobile-webkit/);
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(workflow, /project: firefox-critical\n\s+browser: firefox/);
  assert.match(workflow, /project: webkit-critical\n\s+browser: webkit/);
  assert.match(workflow, /project: mobile-chromium\n\s+browser: chromium/);
  assert.match(workflow, /project: mobile-webkit\n\s+browser: webkit/);
  assert.match(config, /Pixel 7/);
  assert.match(config, /iPhone 14/);
});

test("release-candidate remediation PRs run the strict gate before integration", () => {
  assert.match(
    workflow,
    /pull_request:\n    branches:\n      - main\n      - fix\/release-candidate-qa-accessibility-v1/,
  );
});

test("WebKit gates every B01-B06 remediation spec without title filtering", () => {
  for (const spec of [
    "customer-scan-marketplace-listing",
    "scanner-marketplace-listing-entry",
    "marketplace-buy-now",
    "marketplace-checkout",
    "marketplace-fulfillment",
    "marketplace-receipts-fulfillment",
    "route-protection",
    "owner-onboarding-regression",
    "homepage-layout",
    "item-locator-empty-results",
    "public-listing-image-visibility",
    "buyer-navigation-parity",
    "seller-shop-readability",
    "super-admin-navigation-a11y",
    "owner-application-review",
  ]) {
    assert.match(config, new RegExp(`\\b${spec}\\b`), `${spec} must be in the WebKit gate`);
  }
  assert.match(
    config,
    /\{ name: "webkit-critical", testMatch: webkitGateSpecs, use:/,
  );
});

test("release-candidate web server disables env files and uses the hermetic launcher", () => {
  assert.match(config, /node scripts\/start-release-candidate-server\.mjs/);
  assert.match(viteConfig, /envFile: false/);
  assert.doesNotMatch(config, /npm run dev/);
});

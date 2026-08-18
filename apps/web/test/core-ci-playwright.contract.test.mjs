import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../../.github/workflows/core-ci.yml", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const packageLock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const config = await readFile(
  new URL("../playwright.seller-subscription-ci.config.ts", import.meta.url),
  "utf8",
);

function browserJobSource() {
  const source = workflow.match(
    /^  seller-subscription-browser-tests:\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/m,
  )?.[0];
  assert.ok(source, "Core CI must define the seller subscription browser job");
  return source;
}

test("Core CI uses the lockfile-matched Playwright container for the seller browser gate", () => {
  const job = browserJobSource();
  const playwrightVersions = ["@playwright/test", "playwright", "playwright-core"].map(
    (packageName) => packageLock.packages[`node_modules/${packageName}`]?.version,
  );
  const [playwrightVersion] = playwrightVersions;
  const pinnedPlaywrightImage = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;

  assert.match(workflow, /^on:\n  pull_request:/m);
  assert.ok(playwrightVersion, "package-lock.json must resolve Playwright");
  assert.deepEqual(playwrightVersions, [playwrightVersion, playwrightVersion, playwrightVersion]);
  assert.equal(playwrightVersion, "1.62.0");
  assert.match(
    job,
    new RegExp(`^\\s+image: ${pinnedPlaywrightImage.replaceAll(".", "\\.")}$`, "m"),
  );
  assert.match(job, /options: --user 1001 --ipc=host --init/);
  assert.match(job, /node-version: 20\.20\.2/);
  assert.match(job, /timeout-minutes: 20/);
  assert.match(job, /npm --prefix apps\/web ci/);
  assert.match(job, /npm --prefix apps\/web run test:ci:seller-subscription/);
  assert.doesNotMatch(job, /playwright install --with-deps/);
  assert.doesNotMatch(job, /Acquire::/);
  assert.doesNotMatch(job, /PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT/);
  assert.doesNotMatch(job, /continue-on-error/);
});

test("Core CI runs payment methods and buyer dashboard contrast regressions", () => {
  const job = browserJobSource();

  assert.match(
    job,
    /playwright test payment-methods\.spec\.ts buyer-dashboard-light-readability\.spec\.ts --config playwright\.marketplace\.config\.ts/,
  );
  assert.match(job, /name: Upload Playwright failure artifacts/);
  assert.match(job, /if: failure\(\)/);
  assert.match(job, /uses: actions\/upload-artifact@v4/);
  assert.match(job, /apps\/web\/\.playwright\/seller-subscription-report/);
  assert.match(job, /apps\/web\/\.playwright\/seller-subscription-results/);
});

test("browser gate selects every changed subscription test by exact title", () => {
  const command = packageJson.scripts["test:ci:seller-subscription"];

  assert.match(command, /Shop Management renders one primary action set/);
  assert.match(command, /audit navigation reloads records for each shop target/);
  assert.match(config, /testMatch: \/super-admin-navigation-a11y\\\.spec\\\.ts\//);
  assert.match(config, /trace: "retain-on-failure"/);
  assert.match(config, /screenshot: "only-on-failure"/);
  assert.match(config, /127\.0\.0\.1:5197/);
});

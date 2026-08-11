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

test("Core CI installs Chromium and runs the focused seller subscription browser gate", () => {
  const job = browserJobSource();

  assert.match(workflow, /^on:\n  pull_request:/m);
  assert.match(job, /node-version: 20\.20\.2/);
  assert.match(job, /npm --prefix apps\/web ci/);
  assert.match(job, /npm --prefix apps\/web exec -- playwright install --with-deps chromium/);
  assert.match(job, /npm --prefix apps\/web run test:ci:seller-subscription/);
  assert.doesNotMatch(job, /continue-on-error/);
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

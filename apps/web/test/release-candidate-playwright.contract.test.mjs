import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../../.github/workflows/release-candidate-qa.yml", import.meta.url), "utf8");
const config = await readFile(new URL("../playwright.release-candidate.config.ts", import.meta.url), "utf8");
const viteConfig = await readFile(new URL("../vite.release-candidate.config.ts", import.meta.url), "utf8");

test("release-candidate CI shards the full Chromium suite with strict artifacts", () => {
  assert.match(workflow, /push:\n    branches:\n      - fix\/release-candidate-qa-accessibility-v1/);
  assert.match(workflow, /shard: \[1, 2, 3, 4\]/);
  assert.match(workflow, /--project=chromium --shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(workflow, /if: failure\(\)/);
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
  assert.match(config, /Pixel 7/);
  assert.match(config, /iPhone 14/);
});

test("release-candidate web server disables env files and uses the hermetic launcher", () => {
  assert.match(config, /node scripts\/start-release-candidate-server\.mjs/);
  assert.match(viteConfig, /envFile: false/);
  assert.doesNotMatch(config, /npm run dev/);
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { delimiter } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PRODUCTION_API_ORIGIN, STAGING_API_ORIGIN } from "../scripts/deploymentTargets.mjs";

const WEB_ROOT = new URL("..", import.meta.url);
const RELEASE_SHA = "3d2e2f77d5ca0e028209a0d9c39e377a6836ed03";

function buildAndReadJavaScript(deployEnv, origin) {
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: WEB_ROOT,
    env: {
      ...process.env,
      PATH: `${fileURLToPath(new URL("node_modules/.bin", WEB_ROOT))}${delimiter}${process.env.PATH || ""}`,
      VITE_DEPLOY_ENV: deployEnv,
      VITE_API_ORIGIN: origin,
      VITE_API_BASE: "/api",
      VITE_API_BASE_URL: "/api",
      VITE_SOCKET_URL: origin,
      VITE_SOCKET_PATH: "/socket.io",
      GITHUB_SHA: RELEASE_SHA,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${deployEnv} build failed:\n${result.stdout}\n${result.stderr}`);
  const assets = new URL("dist/assets/", WEB_ROOT);
  const javascript = readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(new URL(name, assets), "utf8"))
    .join("\n");
  const release = JSON.parse(readFileSync(new URL("dist/release.json", WEB_ROOT), "utf8"));
  assert.equal(release.revision, RELEASE_SHA);
  return javascript;
}

test("staging and production bundles contain only their approved API origin", { timeout: 60_000 }, () => {
  const staging = buildAndReadJavaScript("staging", STAGING_API_ORIGIN);
  assert.match(staging, new RegExp(STAGING_API_ORIGIN.replaceAll(".", "\\.")));
  assert.doesNotMatch(staging, new RegExp(PRODUCTION_API_ORIGIN.replaceAll(".", "\\.")));

  const production = buildAndReadJavaScript("production", PRODUCTION_API_ORIGIN);
  assert.match(production, new RegExp(PRODUCTION_API_ORIGIN.replaceAll(".", "\\.")));
  assert.doesNotMatch(production, new RegExp(STAGING_API_ORIGIN.replaceAll(".", "\\.")));
});

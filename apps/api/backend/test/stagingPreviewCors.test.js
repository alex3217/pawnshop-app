import assert from "node:assert/strict";
import test from "node:test";

import {
  createCorsOriginHandler,
  isTrustedStagingPreviewOrigin,
} from "../src/cors.js";

const explicitOrigin = "https://staging.pawnloop.com";
const immutablePreview =
  "https://26d7e572.pawnloop-frontend.pages.dev";
const branchPreview =
  "https://fix-mobile-tutorial-viewport-v1.pawnloop-frontend.pages.dev";
const explicitStagingAlias =
  "https://staging.pawnloop-frontend.pages.dev";

function evaluate(origin, env = { APP_ENV: "staging" }) {
  return new Promise((resolve) => {
    createCorsOriginHandler(new Set([explicitOrigin]), env)(
      origin,
      (error, allowed) => resolve({ error, allowed }),
    );
  });
}

async function assertAllowed(origin, env) {
  assert.deepEqual(await evaluate(origin, env), {
    error: null,
    allowed: true,
  });
}

async function assertRejected(origin, env) {
  const result = await evaluate(origin, env);
  assert.equal(result.allowed, undefined);
  assert.equal(result.error?.statusCode, 403);
  assert.match(result.error?.message || "", /^CORS blocked:/);
}

test("staging accepts immutable, branch, and staging preview aliases", async () => {
  for (const origin of [
    immutablePreview,
    branchPreview,
    explicitStagingAlias,
  ]) {
    assert.equal(isTrustedStagingPreviewOrigin(origin, { APP_ENV: "staging" }), true);
    await assertAllowed(origin);
  }
});

test("production keeps its explicit allowlist behavior", async () => {
  await assertRejected(immutablePreview, { APP_ENV: "production" });
  await assertAllowed(explicitOrigin, { APP_ENV: "production" });
});

test("staging rejects unsafe and unrelated origins", async () => {
  for (const origin of [
    "http://26d7e572.pawnloop-frontend.pages.dev",
    "https://pawnloop-frontend.pages.dev.evil.test",
    "https://26d7e572.pawnloop-frontend.pages.dev.evil.test",
    "https://26d7e572.pawnloop-frontend-pages.dev",
    "https://preview.unrelated-project.pages.dev",
    "https://user@26d7e572.pawnloop-frontend.pages.dev",
    "https://26d7e572.pawnloop-frontend.pages.dev:8443",
    "https://two.labels.pawnloop-frontend.pages.dev",
    "https://-invalid.pawnloop-frontend.pages.dev",
    "not an origin",
  ]) {
    assert.equal(isTrustedStagingPreviewOrigin(origin, { APP_ENV: "staging" }), false, origin);
    await assertRejected(origin);
  }
});

test("existing allowed, blocked, and originless contracts remain intact", async () => {
  await assertAllowed(explicitOrigin);
  await assertAllowed(undefined);
  await assertRejected("https://blocked.example");
});

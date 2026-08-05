import assert from "node:assert/strict";
import test from "node:test";
import { createCorsOptions, createCorsOriginValidator, isPawnLoopPreviewOrigin, parseAllowedOrigins } from "../src/config/cors.js";

const exactProductionOrigins = parseAllowedOrigins("https://pawnloop.com,https://www.pawnloop.com");

function decision(origin, options = {}) {
  const validator = createCorsOriginValidator({
    allowedOrigins: options.allowedOrigins || exactProductionOrigins,
    appEnv: options.appEnv || "staging",
    previewOriginsEnabled: options.previewOriginsEnabled ?? true,
  });
  return new Promise((resolve) => validator(origin, (error, allowed) => resolve({ error, allowed })));
}

test("configured exact origins and origin-less requests pass", async () => {
  assert.deepEqual(await decision("https://pawnloop.com"), { error: null, allowed: true });
  assert.deepEqual(await decision("https://www.pawnloop.com", { appEnv: "production" }), { error: null, allowed: true });
  assert.deepEqual(await decision(undefined), { error: null, allowed: true });
});

test("credentialed CORS echoes only an origin approved by the validator", async () => {
  const options = createCorsOptions({
    allowedOrigins: exactProductionOrigins,
    appEnv: "production",
    previewOriginsEnabled: false,
  });
  assert.equal(options.credentials, true);
  assert.deepEqual(await new Promise((resolve) => options.origin("https://pawnloop.com", (error, allowed) => resolve({ error, allowed }))), {
    error: null,
    allowed: true,
  });
});

test("valid PawnLoop branch preview passes only in explicitly enabled staging", async () => {
  const origin = "https://fix-preview-229.pawnloop-frontend.pages.dev";
  assert.equal(isPawnLoopPreviewOrigin(origin), true);
  assert.equal((await decision(origin)).allowed, true);
  assert.match((await decision(origin, { previewOriginsEnabled: false })).error.message, /CORS blocked/);
  assert.match((await decision(origin, { appEnv: "production" })).error.message, /CORS blocked/);
});

test("preview parser rejects HTTP, malformed, deceptive, and unrelated origins", () => {
  for (const origin of [
    "http://fix-preview.pawnloop-frontend.pages.dev",
    "not an origin",
    "https://fix-preview.pawnloop-frontend.pages.dev.evil.example",
    "https://fix-preview.unrelated-project.pages.dev",
    "https://bad_alias.pawnloop-frontend.pages.dev",
  ]) assert.equal(isPawnLoopPreviewOrigin(origin), false, origin);
});

test("malformed request origins fail even if accidentally configured exactly", async () => {
  const malformed = "https://pawnloop.com/path";
  const result = await decision(malformed, { allowedOrigins: new Set([malformed]) });
  assert.match(result.error.message, /CORS blocked/);
});

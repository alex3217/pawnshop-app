import assert from "node:assert/strict";
import test from "node:test";

import { createSocketCorsOptions } from "../src/realtime/socket.js";

function evaluateOrigin(corsOptions, origin) {
  return new Promise((resolve) => {
    corsOptions.origin(origin, (error, allowed) => {
      resolve({ error, allowed });
    });
  });
}

async function assertAllowed(corsOptions, origin) {
  const result = await evaluateOrigin(corsOptions, origin);
  assert.equal(result.error, null);
  assert.equal(result.allowed, true);
}

async function assertRejected(corsOptions, origin) {
  const result = await evaluateOrigin(corsOptions, origin);
  assert.match(result.error?.message || "", /^CORS blocked:/);
  assert.equal(result.error?.statusCode, 403);
  assert.equal(result.allowed, undefined);
}

test("allows one configured origin with credentials and no wildcard", async () => {
  const corsOptions = createSocketCorsOptions({
    CORS_ORIGIN: "https://allowed.example",
  });

  assert.equal(corsOptions.credentials, true);
  assert.notEqual(corsOptions.origin, "*");
  assert.equal(typeof corsOptions.origin, "function");
  await assertAllowed(corsOptions, "https://allowed.example");
});

test("allows multiple trimmed CORS_ORIGINS entries", async () => {
  const corsOptions = createSocketCorsOptions({
    CORS_ORIGINS:
      " https://one.example, ,https://two.example  , https://three.example ",
  });

  await assertAllowed(corsOptions, "https://one.example");
  await assertAllowed(corsOptions, "https://two.example");
  await assertAllowed(corsOptions, "https://three.example");
});

test("recognizes FRONTEND_URL and WEB_URL fallbacks", async () => {
  const corsOptions = createSocketCorsOptions({
    FRONTEND_URL: "https://frontend.example",
    WEB_URL: "https://web.example",
  });

  await assertAllowed(corsOptions, "https://frontend.example");
  await assertAllowed(corsOptions, "https://web.example");
});

test("rejects unconfigured and lookalike browser origins", async () => {
  const corsOptions = createSocketCorsOptions({
    CORS_ORIGINS: "https://allowed.example",
  });

  await assertRejected(corsOptions, "https://other.example");
  await assertRejected(corsOptions, "https://allowed.example.evil.test");
});

test("allows an originless request", async () => {
  const corsOptions = createSocketCorsOptions({
    CORS_ORIGINS: "https://allowed.example",
  });

  await assertAllowed(corsOptions, undefined);
});

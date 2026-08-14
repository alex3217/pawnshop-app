import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";

function app(options = {}) {
  return createApp({
    readinessCheck: async () => true,
    uploadStorage: { check: async () => ({ enabled: true }) },
    imageRuntimeCheck: async () => true,
    authRateLimitConfig: { enabled: false },
    env: { NODE_ENV: "test" },
    ...options,
  });
}

test("health stays shallow when readiness dependencies fail", async () => {
  const instance = app({ readinessCheck: async () => { throw new Error("private database detail"); } });
  await request(instance).get("/api/health").expect(200).expect(({ body }) => {
    assert.equal(body.ready, undefined);
    assert.equal(body.ok, true);
  });
});

test("production readiness requires explicitly enabled durable storage", async () => {
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = "production";
  try {
    const response = await request(app({ uploadStorage: { check: async () => ({ enabled: false, bucket: "must-not-leak" }) } }))
      .get("/api/ready").expect(503);
    assert.deepEqual(response.body.dependencies, {
      database: "ok", storage: "unavailable", imageProcessing: "unavailable",
    });
    assert.doesNotMatch(JSON.stringify(response.body), /bucket|must-not-leak/i);
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});

test("storage failure and timeout fail closed without leaking provider details", async () => {
  const previous = process.env.READINESS_TIMEOUT_MS;
  process.env.READINESS_TIMEOUT_MS = "10";
  try {
    for (const check of [
      async () => { throw new Error("secret bucket and signed URL"); },
      async () => new Promise(() => {}),
    ]) {
      const response = await request(app({ uploadStorage: { check } })).get("/api/ready").expect(503);
      assert.equal(response.body.dependencies.storage, "unavailable");
      assert.doesNotMatch(JSON.stringify(response.body), /secret|signed|bucket/i);
    }
  } finally {
    if (previous === undefined) delete process.env.READINESS_TIMEOUT_MS;
    else process.env.READINESS_TIMEOUT_MS = previous;
  }
});

test("image processing failure and timeout fail readiness", async () => {
  const previous = process.env.READINESS_TIMEOUT_MS;
  process.env.READINESS_TIMEOUT_MS = "10";
  try {
    for (const imageRuntimeCheck of [
      async () => { throw new Error("decoder detail"); },
      async () => new Promise(() => {}),
    ]) {
      const response = await request(app({ imageRuntimeCheck })).get("/api/ready").expect(503);
      assert.deepEqual(response.body.dependencies, {
        database: "ok", storage: "ok", imageProcessing: "unavailable",
      });
      assert.doesNotMatch(JSON.stringify(response.body), /decoder detail/i);
    }
  } finally {
    if (previous === undefined) delete process.env.READINESS_TIMEOUT_MS;
    else process.env.READINESS_TIMEOUT_MS = previous;
  }
});

test("all injected readiness checks pass without network credentials", async () => {
  const response = await request(app()).get("/api/ready").expect(200);
  assert.equal(response.body.ready, true);
  assert.deepEqual(response.body.dependencies, {
    database: "ok", storage: "ok", imageProcessing: "ok",
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createS3UploadStorage } from "../src/services/uploadStorage.service.js";

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
  const response = await request(app({
    env: { NODE_ENV: "production", APP_ENV: "production", RENDER_GIT_COMMIT: "0123456789abcdef0123456789abcdef01234567" },
    authRateLimitStore: { check: async () => true },
    uploadStorage: { check: async () => ({ enabled: false, bucket: "must-not-leak" }) },
  })).get("/api/ready").expect(503);
  assert.deepEqual(response.body.dependencies, {
    database: "ok", storage: "unavailable", imageProcessing: "unavailable",
  });
  assert.doesNotMatch(JSON.stringify(response.body), /bucket|must-not-leak/i);
});

test("storage failure fails closed without leaking provider details", async () => {
  const response = await request(app({ uploadStorage: { check: async () => { throw new Error("secret bucket and signed URL"); } } })).get("/api/ready").expect(503);
  assert.equal(response.body.dependencies.storage, "unavailable");
  assert.doesNotMatch(JSON.stringify(response.body), /secret|signed|bucket/i);
});

test("a controlled unresolved dependency is aborted with bounded readiness failure", async () => {
  let fireDeadline;
  let dependencyStarted;
  let dependencyAborted = false;
  const started = new Promise((resolve) => { dependencyStarted = resolve; });
  const readinessTimers = {
    setTimeout(callback) { fireDeadline = callback; return 1; },
    clearTimeout() {},
  };
  const check = (signal) => new Promise((_resolve, reject) => {
    dependencyStarted();
    signal.addEventListener("abort", () => {
      dependencyAborted = true;
      reject(signal.reason);
    }, { once: true });
  });

  const pendingResponse = request(app({ uploadStorage: { check }, readinessTimers })).get("/api/ready");
  const responsePromise = pendingResponse.then((response) => response);
  await started;
  fireDeadline();
  const response = await responsePromise;
  assert.equal(response.status, 503);
  assert.equal(dependencyAborted, true);
  assert.equal(response.body.dependencies.storage, "unavailable");
});

test("the readiness deadline aborts the real S3 HeadBucket check", async () => {
  let fireDeadline;
  let headBucketStarted;
  let receivedSignal;
  const started = new Promise((resolve) => { headBucketStarted = resolve; });
  const readinessTimers = {
    setTimeout(callback) { fireDeadline = callback; return 1; },
    clearTimeout() {},
  };
  const client = {
    send(command, { abortSignal }) {
      assert.equal(command.constructor.name, "HeadBucketCommand");
      assert.ok(abortSignal instanceof AbortSignal);
      receivedSignal = abortSignal;
      headBucketStarted();
      return new Promise((_resolve, reject) => {
        abortSignal.addEventListener("abort", () => reject(new Error("private provider bucket detail")), { once: true });
      });
    },
  };
  const uploadStorage = createS3UploadStorage({
    enabled: true,
    endpoint: "https://storage.example.test",
    region: "auto",
    forcePathStyle: false,
    accessKeyId: "test",
    secretAccessKey: "test",
    bucket: "private-bucket",
    publicBaseUrl: "https://assets.example.test",
    limits: { storageTimeoutMs: 60_000 },
  }, { client });

  const responsePromise = request(app({ uploadStorage, readinessTimers }))
    .get("/api/ready")
    .then((response) => response);
  await started;
  assert.equal(receivedSignal.aborted, false);
  fireDeadline();
  const response = await responsePromise;

  assert.equal(receivedSignal.aborted, true);
  assert.equal(response.status, 503);
  assert.equal(response.body.dependencies.storage, "unavailable");
  assert.doesNotMatch(JSON.stringify(response.body), /private|provider|bucket/i);
});

test("image processing failure fails readiness", async () => {
  const response = await request(app({ imageRuntimeCheck: async () => { throw new Error("decoder detail"); } })).get("/api/ready").expect(503);
  assert.deepEqual(response.body.dependencies, {
    database: "ok", storage: "ok", imageProcessing: "unavailable",
  });
  assert.doesNotMatch(JSON.stringify(response.body), /decoder detail/i);
});

test("all injected readiness checks pass without network credentials", async () => {
  const response = await request(app()).get("/api/ready").expect(200);
  assert.equal(response.body.ready, true);
  assert.deepEqual(response.body.dependencies, {
    database: "ok", storage: "ok", imageProcessing: "ok",
  });
});

test("one overall readiness deadline signal reaches every dependency", async () => {
  const signals = [];
  const instance = app({
    readinessCheck: async (signal) => { signals.push(signal); },
    authRateLimitConfig: { enabled: false },
    uploadStorage: { check: async (signal) => { signals.push(signal); return { enabled: true }; } },
    imageRuntimeCheck: async (signal) => { signals.push(signal); },
  });
  await request(instance).get("/api/ready").expect(200);
  assert.equal(signals.length, 3);
  assert.ok(signals[0] instanceof AbortSignal);
  assert.equal(signals[1], signals[0]);
  assert.equal(signals[2], signals[0]);
});

test("injected runtime environment controls health identity and revision", async () => {
  const revision = "abcdef0123456789abcdef0123456789abcdef01";
  const response = await request(app({ env: { NODE_ENV: "test", APP_ENV: "injected", APP_NAME: "injected-api", APP_VERSION: revision } }))
    .get("/api/health").expect(200);
  assert.equal(response.body.service, "injected-api");
  assert.equal(response.body.env, "injected");
  assert.equal(response.body.revision, revision);
});

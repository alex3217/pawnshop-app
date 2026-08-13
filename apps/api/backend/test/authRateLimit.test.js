import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { ipKeyGenerator } from "express-rate-limit";
import request from "supertest";

import {
  loadAuthRateLimitConfig,
  loadTrustProxyConfig,
} from "../src/config/authRateLimit.js";
import {
  createAuthRateLimiters,
  MemoryRateLimitStore,
  RedisAuthRateLimitStore,
} from "../src/middleware/authRateLimit.js";

const SECRET = "rate-limit-tests-only-secret-with-enough-entropy";

function config(overrides = {}) {
  return {
    enabled: true,
    windowMs: 1_000,
    ipMax: 3,
    sensitiveIpMax: 2,
    identifierMax: 4,
    combinedMax: 2,
    keySecret: SECRET,
    ...overrides,
  };
}

function createTestApp({
  limiterConfig = config(),
  store,
  now,
  trustProxy = 0,
  onRequest = () => {},
  onResponse = () => {},
} = {}) {
  const app = express();
  if (trustProxy > 0) app.set("trust proxy", trustProxy);
  const limiters = createAuthRateLimiters({
    config: limiterConfig,
    store,
    now,
  });
  app.use((req, res, next) => {
    req.requestId = "rate-limit-test-request";
    const sendJson = res.json.bind(res);
    res.json = (body) => {
      onResponse();
      return sendJson(body);
    };
    next();
  });
  app.use(limiters.beforeBody);
  app.use(express.json());
  app.use(limiters.afterBody);
  app.post(
    [
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/resend-verification",
      "/api/auth/verify-email",
      "/api/auth/mfa/challenge",
    ],
    (req, res) => {
      onRequest(req);
      res.json({
        success: true,
        message: req.path.includes("forgot-password")
          ? "If an account exists for that email, password reset instructions will be sent."
          : "ok",
      });
    },
  );
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use((error, req, res, _next) => {
    res.status(400).json({
      success: false,
      error: error instanceof SyntaxError ? "Invalid JSON payload" : "error",
      requestId: req.requestId,
    });
  });
  return { app, store: limiters.store };
}

function assertLimitHeaders(response) {
  assert.match(response.headers["ratelimit-limit"], /^\d+$/);
  assert.match(response.headers["ratelimit-remaining"], /^\d+$/);
  assert.match(response.headers["ratelimit-reset"], /^\d+$/);
  assert.match(response.headers["ratelimit-policy"], /^\d+;w=\d+$/);
}

test("login permits requests below all layers and then returns 429", async () => {
  const { app } = createTestApp({
    limiterConfig: config({
      ipMax: 5,
      identifierMax: 4,
      combinedMax: 2,
    }),
  });
  const payload = { email: "Target@Example.com", password: "not-a-key" };

  for (let count = 0; count < 2; count += 1) {
    const response = await request(app).post("/api/auth/login").send(payload);
    assert.equal(response.status, 200);
    assertLimitHeaders(response);
  }

  const limited = await request(app).post("/api/auth/login").send(payload);
  assert.equal(limited.status, 429);
  assert.match(limited.headers["retry-after"], /^\d+$/);
  assert.ok(Number(limited.headers["retry-after"]) >= 1);
  assertLimitHeaders(limited);
  assert.equal(JSON.stringify(limited.body).includes(payload.email), false);
});

test("rotating controlled IPs eventually triggers identifier-only limiting", async () => {
  let controllerCalls = 0;
  const { app } = createTestApp({
    trustProxy: 1,
    limiterConfig: config({
      ipMax: 20,
      identifierMax: 3,
      combinedMax: 2,
    }),
    onRequest() {
      controllerCalls += 1;
    },
  });
  const payload = {
    email: "Rotating@Target.Example",
    password: "never-stored",
  };

  for (const address of [
    "198.51.100.10",
    "198.51.100.11",
    "198.51.100.12",
  ]) {
    const response = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", address)
      .send(payload);
    assert.equal(response.status, 200);
  }

  const limited = await request(app)
    .post("/api/auth/login")
    .set("X-Forwarded-For", "198.51.100.13")
    .send(payload);
  assert.equal(limited.status, 429);
  assert.equal(controllerCalls, 3);
  assert.equal(JSON.stringify(limited.body).includes(payload.email), false);
});

test("different identifiers on one IP remain governed by the IP limiter", async () => {
  const { app } = createTestApp({
    limiterConfig: config({
      ipMax: 2,
      identifierMax: 10,
      combinedMax: 5,
    }),
  });

  for (const identifier of ["one@example.com", "two@example.com"]) {
    assert.equal(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: identifier, password: "unused" })
      ).status,
      200,
    );
  }

  const limited = await request(app)
    .post("/api/auth/login")
    .send({ email: "three@example.com", password: "unused" });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["ratelimit-limit"], "2");
});

test("combined IP and identifier limiting operates independently", async () => {
  const { app } = createTestApp({
    trustProxy: 1,
    limiterConfig: config({
      ipMax: 10,
      identifierMax: 10,
      combinedMax: 2,
    }),
  });
  const payload = { email: "combined@example.com", password: "unused" };

  for (let count = 0; count < 2; count += 1) {
    assert.equal(
      (
        await request(app)
          .post("/api/auth/login")
          .set("X-Forwarded-For", "198.51.100.20")
          .send(payload)
      ).status,
      200,
    );
  }
  const limited = await request(app)
    .post("/api/auth/login")
    .set("X-Forwarded-For", "198.51.100.20")
    .send(payload);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["ratelimit-limit"], "2");

  const differentPair = await request(app)
    .post("/api/auth/login")
    .set("X-Forwarded-For", "198.51.100.21")
    .send(payload);
  assert.equal(differentPair.status, 200);
});

test("a rejecting layer sends exactly one response and never reaches the controller", async () => {
  let controllerCalls = 0;
  let responseCalls = 0;
  const { app } = createTestApp({
    limiterConfig: config({
      ipMax: 10,
      identifierMax: 4,
      combinedMax: 1,
    }),
    onRequest() {
      controllerCalls += 1;
    },
    onResponse() {
      responseCalls += 1;
    },
  });
  const payload = { email: "single-response@example.com", password: "unused" };

  assert.equal(
    (await request(app).post("/api/auth/login").send(payload)).status,
    200,
  );
  assert.equal(
    (await request(app).post("/api/auth/login").send(payload)).status,
    429,
  );
  assert.equal(controllerCalls, 1);
  assert.equal(responseCalls, 2);
});

test("all repeatable public credential endpoints receive focused protection", async () => {
  for (const [path, payload] of [
    ["/api/auth/register", { email: "new@example.com" }],
    ["/api/auth/forgot-password", { email: "recover@example.com" }],
    ["/api/auth/resend-verification", { email: "verify@example.com" }],
    ["/api/auth/reset-password", { token: "reset-secret", password: "unused" }],
    ["/api/auth/verify-email", { token: "verification-secret" }],
    ["/api/auth/mfa/challenge", { challenge: "opaque-challenge", code: "123456" }],
  ]) {
    const { app } = createTestApp();
    assert.equal((await request(app).post(path).send(payload)).status, 200);
    assert.equal((await request(app).post(path).send(payload)).status, 200);
    const limited = await request(app).post(path).send(payload);
    assert.equal(limited.status, 429, path);
    assert.match(limited.headers["retry-after"], /^\d+$/);
  }
});

test("deployed authentication requires Redis while development and test allow memory", () => {
  for (const runtime of ["production", "staging"]) {
    assert.throws(
      () => createAuthRateLimiters({ config: config(), env: { APP_ENV: runtime } }),
      /REDIS_URL is required/,
    );
  }
  for (const runtime of ["development", "test"]) {
    const limiters = createAuthRateLimiters({ config: config(), env: { APP_ENV: runtime } });
    assert.ok(limiters.store instanceof MemoryRateLimitStore);
  }
});

test("Redis unavailability fails requests and readiness closed", async () => {
  const unavailable = {
    async increment() { throw new Error("redis unavailable"); },
    async check() { throw new Error("redis unavailable"); },
  };
  const { app } = createTestApp({ store: unavailable });
  const response = await request(app).post("/api/auth/mfa/challenge").send({
    challenge: "opaque-challenge", code: "123456",
  });
  assert.equal(response.status, 503);
  assert.equal(response.body.error, "Authentication protection is temporarily unavailable");
  const limiters = createAuthRateLimiters({ config: config(), store: unavailable });
  await assert.rejects(limiters.check(), /redis unavailable/);
});

test("Redis stores only fixed-format digests and reuses then closes its client", async () => {
  const observedKeys = [];
  let connects = 0;
  let quits = 0;
  const client = {
    isReady: false,
    isOpen: true,
    async connect() { connects += 1; this.isReady = true; },
    async eval(_script, { keys }) { observedKeys.push(...keys); return 1; },
    async pTTL() { return 1_000; },
    async ping() { return "PONG"; },
    async quit() { quits += 1; this.isOpen = false; },
  };
  const store = new RedisAuthRateLimitStore({ client });
  const sensitive = ["person@example.test", "opaque-challenge", "recovery-code", "123456", "jwt-token"];
  await store.increment(sensitive.join(":"), 1_000);
  await store.increment(sensitive.join(":"), 1_000);
  await store.check();
  await store.close();
  assert.equal(connects, 1);
  assert.equal(quits, 1);
  assert.equal(observedKeys.length, 2);
  for (const key of observedKeys) {
    assert.match(key, /^auth:rate:[a-f0-9]{64}$/);
    for (const value of sensitive) assert.equal(key.includes(value), false);
  }
});

test("limits expire deterministically", async () => {
  let clock = 10_000;
  const { app } = createTestApp({ now: () => clock });
  const payload = { email: "expiry@example.com" };
  await request(app).post("/api/auth/forgot-password").send(payload);
  await request(app).post("/api/auth/forgot-password").send(payload);
  assert.equal(
    (await request(app).post("/api/auth/forgot-password").send(payload)).status,
    429,
  );
  clock += 1_001;
  assert.equal(
    (await request(app).post("/api/auth/forgot-password").send(payload)).status,
    200,
  );
});

test("IP, identifier, combined, and token layers all expire and reset", async () => {
  let clock = 20_000;
  const { app, store } = createTestApp({
    now: () => clock,
    limiterConfig: config({
      ipMax: 10,
      sensitiveIpMax: 10,
      identifierMax: 2,
      combinedMax: 1,
    }),
  });

  const emailPayload = { email: "all-layers@example.com", password: "unused" };
  assert.equal(
    (await request(app).post("/api/auth/login").send(emailPayload)).status,
    200,
  );
  assert.equal(
    (await request(app).post("/api/auth/login").send(emailPayload)).status,
    429,
  );

  const tokenPayload = { token: "all-layers-token", password: "unused" };
  assert.equal(
    (await request(app).post("/api/auth/reset-password").send(tokenPayload))
      .status,
    200,
  );
  assert.equal(
    (await request(app).post("/api/auth/reset-password").send(tokenPayload))
      .status,
    200,
  );
  assert.equal(
    (await request(app).post("/api/auth/reset-password").send(tokenPayload))
      .status,
    429,
  );

  const oldResetTimes = [...store.entries.values()].map(
    (entry) => entry.resetAt,
  );
  assert.ok(oldResetTimes.every((resetAt) => resetAt === 21_000));

  clock = 21_001;
  assert.equal(
    (await request(app).post("/api/auth/login").send(emailPayload)).status,
    200,
  );
  assert.equal(
    (await request(app).post("/api/auth/reset-password").send(tokenPayload))
      .status,
    200,
  );
  assert.ok(
    [...store.entries.values()].some((entry) => entry.resetAt === 22_001),
  );
});

test("malformed JSON still consumes the pre-body IP allowance", async () => {
  const { app } = createTestApp();
  for (let count = 0; count < 2; count += 1) {
    const malformed = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send('{"email":');
    assert.equal(malformed.status, 400);
  }
  const limited = await request(app)
    .post("/api/auth/register")
    .send({ email: "valid@example.com" });
  assert.equal(limited.status, 429);
});

test("registration rejection occurs before invite or user work", async () => {
  let controllerCalls = 0;
  const { app } = createTestApp({
    onRequest() {
      controllerCalls += 1;
    },
  });
  const payload = {
    email: "invite@example.com",
    inviteToken: "must-never-enter-a-key",
  };
  await request(app).post("/api/auth/register").send(payload);
  await request(app).post("/api/auth/register").send(payload);
  const limited = await request(app).post("/api/auth/register").send(payload);
  assert.equal(limited.status, 429);
  assert.equal(controllerCalls, 2);
});

test("recovery remains enumeration-safe and identifier keys are opaque", async () => {
  const { app, store } = createTestApp();
  const known = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "known@example.com" });
  const unknown = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "unknown@example.com" });
  assert.deepEqual(known.body, unknown.body);

  const serializedKeys = [...store.entries.keys()].join("\n");
  assert.equal(serializedKeys.includes("known@example.com"), false);
  assert.equal(serializedKeys.includes("unknown@example.com"), false);
  assert.equal(serializedKeys.includes("must-never-enter-a-key"), false);
});

test("credentials, raw subjects, and invite tokens never enter store keys", async () => {
  const { app, store } = createTestApp();
  const secrets = {
    email: "private-account@example.com",
    password: "PrivatePassword123!",
    inviteToken: "private-invite-token",
    resetToken: "private-reset-token",
    verificationToken: "private-verification-token",
  };
  await request(app).post("/api/auth/register").send(secrets);
  await request(app).post("/api/auth/login").send(secrets);
  await request(app).post("/api/auth/reset-password").send({
    token: secrets.resetToken,
    password: secrets.password,
  });
  await request(app).post("/api/auth/verify-email").send({
    token: secrets.verificationToken,
  });

  const serializedKeys = [...store.entries.keys()].join("\n");
  for (const secret of Object.values(secrets)) {
    assert.equal(serializedKeys.includes(secret), false);
  }
  const hmacKeys = [...store.entries.keys()].filter((key) =>
    key.startsWith("auth:hmac:"),
  );
  assert.equal(new Set(hmacKeys).size, hmacKeys.length);
  assert.ok(
    hmacKeys.length >= 6,
    "policy and layer domain separation must produce distinct HMAC keys",
  );
});

test("unrelated routes are unaffected and disabled behavior is explicit", async () => {
  const disabled = createTestApp({
    limiterConfig: config({ enabled: false, sensitiveIpMax: 1 }),
  }).app;
  for (let count = 0; count < 4; count += 1) {
    assert.equal(
      (await request(disabled).post("/api/auth/register").send({})).status,
      200,
    );
  }
  assert.equal((await request(disabled).get("/api/health")).status, 200);
});

test("untrusted forwarded headers cannot bypass IP limits", async () => {
  const { app } = createTestApp({ trustProxy: 0 });
  for (const spoofed of ["198.51.100.1", "198.51.100.2"]) {
    assert.equal(
      (
        await request(app)
          .post("/api/auth/register")
          .set("X-Forwarded-For", spoofed)
          .send({})
      ).status,
      200,
    );
  }
  assert.equal(
    (
      await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "198.51.100.3")
        .send({})
    ).status,
    429,
  );
});

test("IPv6 keys use the library's /56 subnet convention", () => {
  assert.equal(
    ipKeyGenerator("2001:db8:abcd:0012::1", 56),
    ipKeyGenerator("2001:db8:abcd:00ff::2", 56),
  );
  assert.notEqual(
    ipKeyGenerator("2001:db8:abcd:0012::1", 56),
    ipKeyGenerator("2001:db8:abce::1", 56),
  );
});

test("store failure fails closed without invoking the controller", async () => {
  let controllerCalls = 0;
  const store = {
    async increment() {
      throw new Error("store unavailable");
    },
  };
  const { app } = createTestApp({
    store,
    onRequest() {
      controllerCalls += 1;
    },
  });
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values);
  try {
    const response = await request(app).post("/api/auth/login").send({
      email: "private@example.com",
      password: "private",
    });
    assert.equal(response.status, 503);
    assert.equal(controllerCalls, 0);
    assert.equal(JSON.stringify(response.body).includes("private"), false);
    assert.equal(JSON.stringify(logs).includes("private@example.com"), false);
    assert.equal(JSON.stringify(logs).includes('"private"'), false);
  } finally {
    console.error = originalConsoleError;
  }
});

test("configuration rejects unsafe values and proxy trust is explicit", () => {
  assert.equal(
    loadAuthRateLimitConfig({
      AUTH_RATE_LIMIT_ENABLED: "false",
    }).enabled,
    false,
  );
  for (const value of ["0", "-1", "NaN", "1.5", "9007199254740992"]) {
    for (const variable of [
      "AUTH_RATE_LIMIT_WINDOW_MS",
      "AUTH_RATE_LIMIT_IP_MAX",
      "AUTH_RATE_LIMIT_SENSITIVE_IP_MAX",
      "AUTH_RATE_LIMIT_IDENTIFIER_MAX",
      "AUTH_RATE_LIMIT_COMBINED_MAX",
    ]) {
      assert.throws(
        () =>
          loadAuthRateLimitConfig({
            AUTH_RATE_LIMIT_ENABLED: "true",
            AUTH_RATE_LIMIT_IDENTIFIER_MAX: "4",
            AUTH_RATE_LIMIT_COMBINED_MAX: "2",
            [variable]: value,
            JWT_SECRET: SECRET,
          }),
        /positive integer|safe positive integer/,
      );
    }
  }
  assert.throws(
    () =>
      loadAuthRateLimitConfig({
        AUTH_RATE_LIMIT_ENABLED: "yes",
        JWT_SECRET: SECRET,
      }),
    /must be true/,
  );
  assert.throws(
    () =>
      loadAuthRateLimitConfig({
        AUTH_RATE_LIMIT_ENABLED: "true",
        AUTH_RATE_LIMIT_IDENTIFIER_MAX: "2",
        AUTH_RATE_LIMIT_COMBINED_MAX: "2",
        JWT_SECRET: SECRET,
      }),
    /must be greater/,
  );
  assert.throws(
    () => loadAuthRateLimitConfig({ AUTH_RATE_LIMIT_ENABLED: "true" }),
    /requires the configured JWT\/auth secret/,
  );
  assert.equal(loadTrustProxyConfig({}), 0);
  assert.equal(loadTrustProxyConfig({ TRUST_PROXY: "1" }), 1);
  assert.throws(() => loadTrustProxyConfig({ TRUST_PROXY: "true" }), /0 or 1/);
  assert.throws(() => loadTrustProxyConfig({ TRUST_PROXY: "2" }), /0 or 1/);
});

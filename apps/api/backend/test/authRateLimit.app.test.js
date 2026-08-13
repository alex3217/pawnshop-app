import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { MemoryRateLimitStore } from "../src/middleware/authRateLimit.js";

const REAL_APP_CONFIG = Object.freeze({
  enabled: true,
  windowMs: 60_000,
  ipMax: 10,
  sensitiveIpMax: 2,
  identifierMax: 4,
  combinedMax: 2,
  keySecret: "real-app-rate-limit-test-secret",
});

test("real createApp limits malformed registration before its controller", async () => {
  const originalTrustProxy = process.env.TRUST_PROXY;
  const originalInviteEnforcement =
    process.env.INVITE_ONLY_REGISTRATION_ENABLED;
  const originalFindUnique = prisma.user.findUnique;
  let databaseCalls = 0;

  process.env.TRUST_PROXY = "0";
  process.env.INVITE_ONLY_REGISTRATION_ENABLED = "false";
  prisma.user.findUnique = async () => {
    databaseCalls += 1;
    throw new Error("registration controller must not reach the database");
  };

  try {
    const app = createApp({
      authRateLimitConfig: REAL_APP_CONFIG,
      authRateLimitStore: new MemoryRateLimitStore(),
      readinessCheck: async () => true,
    });

    for (let count = 0; count < 2; count += 1) {
      const malformed = await request(app)
        .post("/api/auth/register")
        .set("Content-Type", "application/json")
        .send('{"email":');
      assert.equal(malformed.status, 400);
      assert.equal(malformed.body.error, "Invalid JSON payload");
    }

    const limited = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Never Created",
        email: "never-created@example.com",
        password: "NeverCreated123!",
        role: "CONSUMER",
        legalConsent: {
          accepted: true,
          termsVersion: "2026-07-28",
          privacyVersion: "2026-07-28",
        },
      });
    assert.equal(limited.status, 429);
    assert.equal(databaseCalls, 0);
    assert.match(limited.headers["retry-after"], /^\d+$/);

    const health = await request(app).get("/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(databaseCalls, 0);
  } finally {
    prisma.user.findUnique = originalFindUnique;
    if (originalTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = originalTrustProxy;
    }
    if (originalInviteEnforcement === undefined) {
      delete process.env.INVITE_ONLY_REGISTRATION_ENABLED;
    } else {
      process.env.INVITE_ONLY_REGISTRATION_ENABLED =
        originalInviteEnforcement;
    }
  }
});

test("readiness fails closed when the shared authentication store is unavailable", async () => {
  const app = createApp({
    authRateLimitConfig: REAL_APP_CONFIG,
    authRateLimitStore: {
      async increment() { return { count: 1, resetAt: Date.now() + 60_000 }; },
      async check() { throw new Error("shared auth store unavailable"); },
    },
    readinessCheck: async () => true,
    uploadStorage: { async check() { return true; } },
    imageRuntimeCheck: async () => true,
  });
  const response = await request(app).get("/api/ready");
  assert.equal(response.status, 503);
  assert.equal(response.body.ready, false);
  assert.equal(JSON.stringify(response.body).includes("shared auth store unavailable"), false);
});

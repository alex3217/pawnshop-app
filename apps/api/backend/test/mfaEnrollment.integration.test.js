import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { confirmMfaEnrollment, startMfaEnrollment } from "../src/services/mfa.service.js";
import { createTotpCode, decryptTotpSecret } from "../src/services/mfaCrypto.service.js";

const jwtSecret = "phase-2a-jwt-test-secret-with-sufficient-entropy";
const encryptionKey = Buffer.alloc(32, 91);
const encodedEncryptionKey = encryptionKey.toString("base64");
const marker = `mfa-enrollment-${Date.now()}`;
let app;
let superAdmin;
let consumer;

function accessToken(user) {
  return jwt.sign({
    sub: user.id,
    role: user.role,
    authVersion: user.authVersion,
  }, jwtSecret, { expiresIn: "10m" });
}

function auth(requestBuilder, user = superAdmin) {
  return requestBuilder.set("Authorization", `Bearer ${accessToken(user)}`);
}

function objectKeys(value, result = new Set()) {
  if (!value || typeof value !== "object") return result;
  for (const [key, nested] of Object.entries(value)) {
    result.add(key);
    objectKeys(nested, result);
  }
  return result;
}

async function removeTestData() {
  const ids = [superAdmin?.id, consumer?.id].filter(Boolean);
  if (ids.length === 0) return;
  await prisma.superAdminAuditLog.deleteMany({
    where: { OR: [{ targetId: { in: ids } }, { actorId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.MFA_MODE = "optional";
  process.env.MFA_ENCRYPTION_KEY = encodedEncryptionKey;
  process.env.MFA_ENROLLMENT_TTL_SECONDS = "600";
  [superAdmin, consumer] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Phase 2A Super Admin",
        email: `${marker}-super@example.test`,
        password: await bcrypt.hash("Phase2A-Secure-Password!", 12),
        role: "SUPER_ADMIN",
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        name: "Phase 2A Consumer",
        email: `${marker}-consumer@example.test`,
        password: await bcrypt.hash("Phase2A-Secure-Password!", 12),
        role: "CONSUMER",
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    }),
  ]);
  app = createApp({
    authRateLimitConfig: {
      enabled: true,
      windowMs: 60_000,
      ipMax: 20_000,
      sensitiveIpMax: 20_000,
      identifierMax: 20_000,
      combinedMax: 10_000,
      keySecret: jwtSecret,
    },
  });
});

beforeEach(async () => {
  app.locals.authRateLimiters.store.resetAll();
  await prisma.superAdminAuditLog.deleteMany({ where: { targetId: superAdmin.id } });
  await prisma.userMfaCredential.deleteMany({
    where: { userId: { in: [superAdmin.id, consumer.id] } },
  });
  process.env.MFA_MODE = "optional";
});

after(async () => {
  await removeTestData();
  await prisma.$disconnect();
});

test("enrollment endpoints require authentication and current SUPER_ADMIN authority", async () => {
  const endpoints = [
    ["get", "/api/auth/mfa/status"],
    ["post", "/api/auth/mfa/enrollment"],
    ["post", "/api/auth/mfa/enrollment/confirm"],
  ];
  for (const [method, path] of endpoints) {
    assert.equal((await request(app)[method](path)).status, 401);
    assert.equal((await auth(request(app)[method](path), consumer).send({ code: "123456" })).status, 403);
  }
});

test("disabled rollout makes every enrollment endpoint unavailable and leaves login unchanged", async () => {
  process.env.MFA_MODE = "disabled";
  delete process.env.MFA_ENCRYPTION_KEY;
  for (const [method, path] of [
    ["get", "/api/auth/mfa/status"],
    ["post", "/api/auth/mfa/enrollment"],
    ["post", "/api/auth/mfa/enrollment/confirm"],
  ]) {
    const response = await auth(request(app)[method](path)).send({ code: "123456" });
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "MFA enrollment is unavailable");
  }
  const login = await request(app).post("/api/auth/login").send({
    email: superAdmin.email,
    password: "Phase2A-Secure-Password!",
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.success, true);
  assert.equal(typeof login.body.token, "string");
  assert.equal(login.body.mfaChallenge, undefined);
  process.env.MFA_ENCRYPTION_KEY = encodedEncryptionKey;
});

test("status is safe and enrollment start exposes setup material only in its response", async () => {
  const initial = await auth(request(app).get("/api/auth/mfa/status"));
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body.mfa, {
    available: true,
    rolloutMode: "optional",
    enrolled: false,
    enabled: false,
    enrollmentStartedAt: null,
    enabledAt: null,
    recoveryCodesGenerated: false,
  });

  const started = await auth(request(app).post("/api/auth/mfa/enrollment"));
  assert.equal(started.status, 201);
  assert.match(started.body.enrollment.secret, /^[A-Z2-7]+$/);
  assert.match(started.body.enrollment.otpauthUri, /^otpauth:\/\/totp\//);
  const stored = await prisma.userMfaCredential.findUnique({
    where: { userId: superAdmin.id },
    include: { recoveryCodes: true },
  });
  assert.equal(stored.encryptedTotpSecret.includes(started.body.enrollment.secret), false);
  assert.equal(decryptTotpSecret(stored.encryptedTotpSecret, encryptionKey), started.body.enrollment.secret);
  assert.equal(JSON.stringify(stored).includes(started.body.enrollment.otpauthUri), false);
  const audits = await prisma.superAdminAuditLog.findMany({ where: { targetId: superAdmin.id } });
  const serializedAudits = JSON.stringify(audits);
  assert.equal(serializedAudits.includes(started.body.enrollment.secret), false);
  assert.equal(serializedAudits.includes(started.body.enrollment.otpauthUri), false);
  assert.equal(audits.filter(({ action }) => action === "MFA_ENROLLMENT_STARTED").length, 1);

  const status = await auth(request(app).get("/api/auth/mfa/status"));
  assert.equal(status.body.mfa.enrolled, true);
  assert.equal(status.body.mfa.enabled, false);
  const responseKeys = objectKeys(status.body);
  for (const forbidden of [
    "encryptedTotpSecret", "secret", "recoveryCodes", "codeDigest",
    "lastAcceptedTotpCounter", "challenge", "encryptionKey",
  ]) assert.equal(responseKeys.has(forbidden), false);
});

test("confirmation enables once, accepts limited skew, and returns ten non-persisted codes", async () => {
  const started = await auth(request(app).post("/api/auth/mfa/enrollment"));
  const epochSeconds = Math.floor(Date.now() / 1000) - 30;
  const code = await createTotpCode({ secret: started.body.enrollment.secret, epochSeconds });
  const confirmed = await auth(request(app).post("/api/auth/mfa/enrollment/confirm")).send({ code });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.enabled, true);
  assert.equal(confirmed.body.recoveryCodes.length, 10);
  assert.equal(new Set(confirmed.body.recoveryCodes).size, 10);

  const credential = await prisma.userMfaCredential.findUnique({
    where: { userId: superAdmin.id },
    include: { recoveryCodes: true },
  });
  assert.ok(credential.enabledAt);
  assert.ok(Number.isInteger(credential.lastAcceptedTotpCounter));
  assert.equal(credential.recoveryCodes.filter(({ consumedAt, invalidatedAt }) => (
    consumedAt === null && invalidatedAt === null
  )).length, 10);
  const persistence = JSON.stringify(credential);
  const audits = JSON.stringify(await prisma.superAdminAuditLog.findMany({
    where: { targetId: superAdmin.id },
  }));
  for (const recoveryCode of confirmed.body.recoveryCodes) {
    assert.equal(persistence.includes(recoveryCode), false);
    assert.equal(audits.includes(recoveryCode), false);
  }
  assert.equal(audits.includes(code), false);

  const replay = await auth(request(app).post("/api/auth/mfa/enrollment/confirm")).send({ code });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error, "MFA enrollment confirmation is invalid");
  assert.equal(await prisma.userMfaRecoveryCode.count({
    where: { credentialId: credential.id, invalidatedAt: null },
  }), 10);
  const restart = await auth(request(app).post("/api/auth/mfa/enrollment"));
  assert.equal(restart.status, 409);
});

test("invalid and expired confirmations do not mutate protected enrollment state", async () => {
  const started = await auth(request(app).post("/api/auth/mfa/enrollment"));
  const invalid = await auth(request(app).post("/api/auth/mfa/enrollment/confirm"))
    .send({ code: "000000" });
  assert.equal(invalid.status, 401);
  assert.equal(JSON.stringify(invalid.body).includes("000000"), false);
  const credential = await prisma.userMfaCredential.findUnique({ where: { userId: superAdmin.id } });
  assert.equal(credential.enabledAt, null);
  assert.equal(credential.lastAcceptedTotpCounter, null);
  assert.equal(await prisma.userMfaRecoveryCode.count({ where: { credentialId: credential.id } }), 0);

  const oldEpoch = Math.floor(credential.enrollmentStartedAt.getTime() / 1000) + 601;
  const validAtExpiry = await createTotpCode({
    secret: started.body.enrollment.secret,
    epochSeconds: oldEpoch,
  });
  await assert.rejects(
    confirmMfaEnrollment({
      userId: superAdmin.id,
      token: validAtExpiry,
      encryptionKey,
      enrollmentTtlSeconds: 600,
      epochSeconds: oldEpoch,
      now: new Date(oldEpoch * 1000),
    }),
    (error) => error.code === "MFA_ENROLLMENT_INVALID",
  );
});

test("concurrent confirmation creates one active recovery-code batch and one enabled audit", async () => {
  const started = await auth(request(app).post("/api/auth/mfa/enrollment"));
  const code = await createTotpCode({ secret: started.body.enrollment.secret });
  const responses = await Promise.all([
    auth(request(app).post("/api/auth/mfa/enrollment/confirm")).send({ code }),
    auth(request(app).post("/api/auth/mfa/enrollment/confirm")).send({ code }),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 401]);
  const credential = await prisma.userMfaCredential.findUnique({ where: { userId: superAdmin.id } });
  assert.equal(await prisma.userMfaRecoveryCode.count({
    where: { credentialId: credential.id, consumedAt: null, invalidatedAt: null },
  }), 10);
  assert.equal(await prisma.superAdminAuditLog.count({
    where: { targetId: superAdmin.id, action: "MFA_ENABLED", success: true },
  }), 1);
});

test("concurrent enrollment starts return one persisted and confirmable pending secret", async () => {
  const responses = await Promise.all([
    auth(request(app).post("/api/auth/mfa/enrollment")),
    auth(request(app).post("/api/auth/mfa/enrollment")),
  ]);
  assert.deepEqual(responses.map(({ status }) => status), [201, 201]);

  const credential = await prisma.userMfaCredential.findUnique({
    where: { userId: superAdmin.id },
  });
  assert.ok(credential);
  const storedSecret = decryptTotpSecret(credential.encryptedTotpSecret, encryptionKey);
  assert.equal(new Set(responses.map(({ body }) => body.enrollment.secret)).size, 1);
  assert.equal(responses.every(({ body }) => body.enrollment.secret === storedSecret), true);
  assert.equal(
    responses.every(({ body }) => body.enrollment.enrollmentStartedAt === (
      credential.enrollmentStartedAt.toISOString()
    )),
    true,
  );
  assert.equal(await prisma.userMfaCredential.count({
    where: { userId: superAdmin.id },
  }), 1);
  assert.equal(await prisma.superAdminAuditLog.count({
    where: {
      targetId: superAdmin.id,
      action: "MFA_ENROLLMENT_STARTED",
      success: true,
    },
  }), 2);

  const code = await createTotpCode({ secret: responses[0].body.enrollment.secret });
  const confirmed = await auth(request(app).post("/api/auth/mfa/enrollment/confirm")).send({ code });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.enabled, true);
  assert.equal(confirmed.body.recoveryCodes.length, 10);
  assert.equal(await prisma.superAdminAuditLog.count({
    where: { targetId: superAdmin.id, action: "MFA_ENABLED", success: true },
  }), 1);
});

test("audit failure rolls back enablement, counter acceptance, and recovery-code creation", async () => {
  const { credential, secret } = await startMfaEnrollment({
    userId: superAdmin.id,
    encryptionKey,
  });
  const epochSeconds = Math.floor(Date.now() / 1000);
  const code = await createTotpCode({ secret, epochSeconds });
  const failingAuditClient = {
    $transaction(callback, options) {
      return prisma.$transaction((tx) => callback(new Proxy(tx, {
        get(target, property) {
          if (property === "superAdminAuditLog") {
            return { create: async () => { throw new Error("audit unavailable"); } };
          }
          return Reflect.get(target, property);
        },
      })), options);
    },
  };
  await assert.rejects(confirmMfaEnrollment({
    userId: superAdmin.id,
    token: code,
    encryptionKey,
    epochSeconds,
    prismaClient: failingAuditClient,
  }), /audit unavailable/);
  const after = await prisma.userMfaCredential.findUnique({ where: { id: credential.id } });
  assert.equal(after.enabledAt, null);
  assert.equal(after.lastAcceptedTotpCounter, null);
  assert.equal(after.recoveryCodesGeneratedAt, null);
  assert.equal(await prisma.userMfaRecoveryCode.count({ where: { credentialId: credential.id } }), 0);
});

test("start and confirmation limits are purpose-specific and keys contain no submitted values", async () => {
  const storedKeys = [];
  const fakeStore = {
    async increment(key) {
      storedKeys.push(key);
      return { count: storedKeys.filter((value) => value === key).length, resetAt: Date.now() + 60_000 };
    },
    resetAll() {},
  };
  const limitedApp = createApp({
    authRateLimitStore: fakeStore,
    authRateLimitConfig: {
      enabled: true,
      windowMs: 60_000,
      ipMax: 20_000,
      sensitiveIpMax: 20_000,
      identifierMax: 20_000,
      combinedMax: 10_000,
      keySecret: jwtSecret,
    },
    auditMfaRateLimit: async () => {},
  });
  await auth(request(limitedApp).post("/api/auth/mfa/enrollment"));
  const submitted = "739201";
  await auth(request(limitedApp).post("/api/auth/mfa/enrollment/confirm")).send({ code: submitted });
  assert.equal(storedKeys.some((key) => key.includes(superAdmin.id)), false);
  assert.equal(storedKeys.some((key) => key.includes(submitted)), false);
  assert.equal(storedKeys.some((key) => key.includes("mfa-enrollment-start")), false);
  assert.equal(new Set(storedKeys).size, 2);
});

test("enrollment rate limits fail closed and write only allowlisted enforcement audits", async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal((await auth(request(app).post("/api/auth/mfa/enrollment"))).status, 201);
  }
  const limited = await auth(request(app).post("/api/auth/mfa/enrollment"));
  assert.equal(limited.status, 429);
  const audit = await prisma.superAdminAuditLog.findFirst({
    where: {
      targetId: superAdmin.id,
      action: "MFA_RATE_LIMIT_ENFORCED",
      success: false,
    },
    orderBy: { createdAt: "desc" },
  });
  assert.deepEqual(audit.metadata, { outcome: "enforced", reason: "rate_limited" });

  app.locals.authRateLimiters.store.resetAll();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await auth(request(app).post("/api/auth/mfa/enrollment/confirm"))
      .send({ code: "000000" });
    assert.equal(response.status, 401);
  }
  const confirmLimited = await auth(request(app).post("/api/auth/mfa/enrollment/confirm"))
    .send({ code: "000000" });
  assert.equal(confirmLimited.status, 429);
  const confirmationAudit = await prisma.superAdminAuditLog.findFirst({
    where: {
      targetId: superAdmin.id,
      action: "MFA_RATE_LIMIT_ENFORCED",
      success: false,
    },
    orderBy: { createdAt: "desc" },
  });
  assert.deepEqual(confirmationAudit.metadata, {
    outcome: "enforced",
    reason: "rate_limited",
    purpose: "ENROLLMENT_CONFIRMATION",
  });
  assert.equal(JSON.stringify(await prisma.superAdminAuditLog.findMany({
    where: { targetId: superAdmin.id },
  })).includes("000000"), false);
});

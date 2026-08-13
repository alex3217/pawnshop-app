import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { confirmMfaEnrollment, startMfaEnrollment } from "../src/services/mfa.service.js";
import { createTotpCode } from "../src/services/mfaCrypto.service.js";

const password = "Privileged-Mfa-Test-Password!";
const encryptionKey = Buffer.alloc(32, 73);
const marker = `privileged-mfa-login-${Date.now()}`;
let app;
let admin;
let consumer;
let recoveryCodes;
let secret;

function loginTotp() {
  return createTotpCode({ secret, epochSeconds: Math.floor(Date.now() / 1000) + 30 });
}

async function login(user) {
  return request(app).post("/api/auth/login").send({ email: user.email, password });
}

before(async () => {
  process.env.JWT_SECRET = "privileged-mfa-login-test-jwt-secret";
  process.env.MFA_MODE = "required";
  process.env.MFA_ENCRYPTION_KEY = encryptionKey.toString("base64");
  process.env.MFA_CHALLENGE_TTL_SECONDS = "300";
  process.env.MFA_CHALLENGE_ATTEMPTS = "3";
  const hash = await bcrypt.hash(password, 12);
  [admin, consumer] = await Promise.all([
    prisma.user.create({ data: { name: "MFA Admin", email: `${marker}-admin@example.test`, password: hash, role: "ADMIN", isActive: true, emailVerifiedAt: new Date() } }),
    prisma.user.create({ data: { name: "MFA Consumer", email: `${marker}-consumer@example.test`, password: hash, role: "CONSUMER", isActive: true, emailVerifiedAt: new Date() } }),
  ]);
  const started = await startMfaEnrollment({ userId: admin.id, encryptionKey });
  secret = started.secret;
  const confirmed = await confirmMfaEnrollment({
    userId: admin.id, encryptionKey,
    token: await createTotpCode({ secret }),
  });
  recoveryCodes = confirmed.recoveryCodes;
  app = createApp({ authRateLimitConfig: { enabled: true, windowMs: 60_000, ipMax: 1000, sensitiveIpMax: 1000, identifierMax: 1000, combinedMax: 1000, keySecret: process.env.JWT_SECRET } });
});

beforeEach(() => app.locals.authRateLimiters.store.resetAll());

after(async () => {
  await prisma.superAdminAuditLog.deleteMany({ where: { targetId: { in: [admin.id, consumer.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, consumer.id] } } });
  await prisma.$disconnect();
});

test("password verification returns only a challenge for enrolled administrators", async () => {
  const response = await login(admin);
  assert.equal(response.status, 202);
  assert.equal(response.body.mfaRequired, true);
  assert.equal(typeof response.body.challenge, "string");
  assert.equal(response.body.token, undefined);
  assert.equal(response.body.user, undefined);
});

test("TOTP completion issues a token once and replay is generic", async () => {
  const challenge = (await login(admin)).body.challenge;
  const success = await request(app).post("/api/auth/mfa/challenge").send({ challenge, method: "totp", code: await loginTotp() });
  assert.equal(success.status, 200);
  assert.equal(typeof success.body.token, "string");
  const replay = await request(app).post("/api/auth/mfa/challenge").send({ challenge, method: "totp", code: "000000" });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error, "Unable to complete authentication");
});

test("recovery codes are single-use and invalid attempts lock the challenge", async () => {
  const first = (await login(admin)).body.challenge;
  assert.equal((await request(app).post("/api/auth/mfa/challenge").send({ challenge: first, method: "recovery_code", code: recoveryCodes[0] })).status, 200);
  const second = (await login(admin)).body.challenge;
  assert.equal((await request(app).post("/api/auth/mfa/challenge").send({ challenge: second, method: "recovery_code", code: recoveryCodes[0] })).status, 401);
  const locked = (await login(admin)).body.challenge;
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await request(app).post("/api/auth/mfa/challenge").send({ challenge: locked, method: "totp", code: "000000" })).status, 401);
  }
  assert.equal((await request(app).post("/api/auth/mfa/challenge").send({ challenge: locked, method: "totp", code: await loginTotp() })).status, 401);
});

test("authVersion changes and suspension invalidate challenges while ordinary consumers login normally", async () => {
  const stale = (await login(admin)).body.challenge;
  await prisma.user.update({ where: { id: admin.id }, data: { authVersion: { increment: 1 } } });
  assert.equal((await request(app).post("/api/auth/mfa/challenge").send({ challenge: stale, method: "totp", code: await loginTotp() })).status, 401);
  const active = (await login(admin)).body.challenge;
  await prisma.user.update({ where: { id: admin.id }, data: { isActive: false, authVersion: { increment: 1 } } });
  assert.equal((await request(app).post("/api/auth/mfa/challenge").send({ challenge: active, method: "totp", code: await loginTotp() })).status, 401);
  const normal = await login(consumer);
  assert.equal(normal.status, 200);
  assert.equal(typeof normal.body.token, "string");
});

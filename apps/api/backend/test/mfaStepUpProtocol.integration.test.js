import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createTotpCode } from "../src/services/mfaCrypto.service.js";
import { ensureMfaEnrollment, issueMfaStepUpProof, resetMfaTestMode } from "./helpers/mfaStepUp.fixture.js";

const secret = "real-step-up-protocol-integration-secret";
const marker = `real-step-up-${Date.now()}`;
let app;
let actor;
let target;

function tokenFor(jti = crypto.randomUUID()) {
  return jwt.sign({ sub: actor.id, role: actor.role, email: actor.email, authVersion: actor.authVersion, jti }, secret);
}

function auth(call, token, proof) {
  const result = call.set("Authorization", `Bearer ${token}`);
  return proof ? result.set("x-mfa-step-up-proof", proof) : result;
}

before(async () => {
  process.env.JWT_SECRET = secret;
  process.env.MFA_MODE = "required";
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 73).toString("base64");
  process.env.MFA_CHALLENGE_ATTEMPTS = "3";
  const password = await bcrypt.hash("StepUp-Protocol-Password!", 12);
  actor = await prisma.user.create({ data: { name: "Protocol Admin", email: `${marker}-actor@example.test`, password, role: "SUPER_ADMIN", emailVerifiedAt: new Date() } });
  target = await prisma.user.create({ data: { name: "Protocol Target", email: `${marker}-target@example.test`, password, role: "CONSUMER", emailVerifiedAt: new Date() } });
  app = createApp({ authRateLimitConfig: { enabled: true, windowMs: 60_000, ipMax: 1000, sensitiveIpMax: 1000, identifierMax: 1000, combinedMax: 1000, keySecret: secret } });
});

beforeEach(async () => {
  app.locals.authRateLimiters.store.resetAll();
  await prisma.user.update({ where: { id: target.id }, data: { isActive: true } });
});

after(async () => {
  await prisma.superAdminAuditLog.deleteMany({ where: { targetId: { in: [actor.id, target.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [actor.id, target.id] } } });
  resetMfaTestMode();
  await prisma.$disconnect();
});

test("real TOTP proof authorizes once, replay is denied, and audits persist", async () => {
  const token = tokenFor();
  const { proof } = await issueMfaStepUpProof({ app, token, userId: actor.id, scope: "privilege.admin-user.block", method: "totp" });
  assert.equal((await auth(request(app).delete(`/api/admin/users/${target.id}`), token, proof)).status, 200);
  assert.equal((await auth(request(app).delete(`/api/admin/users/${target.id}`), token, proof)).status, 403);
  assert.equal((await prisma.user.findUnique({ where: { id: target.id } })).isActive, false);
  const events = await prisma.superAdminAuditLog.findMany({ where: { actorId: actor.id } });
  assert.ok(events.some(({ action }) => action === "MFA_STEP_UP_SUCCEEDED"));
  assert.ok(events.some(({ action }) => action === "MFA_STEP_UP_FAILED"));
});

test("cross-session, cross-scope, and expired proofs cannot execute a mutation", async () => {
  const first = tokenFor();
  const second = tokenFor();
  const sessionProof = await issueMfaStepUpProof({ app, token: first, userId: actor.id, scope: "privilege.admin-user.block" });
  assert.equal((await auth(request(app).delete(`/api/admin/users/${target.id}`), second, sessionProof.proof)).status, 403);
  const scopeProof = await issueMfaStepUpProof({ app, token: first, userId: actor.id, scope: "privilege.admin-user.update" });
  assert.equal((await auth(request(app).delete(`/api/admin/users/${target.id}`), first, scopeProof.proof)).status, 403);
  const expiring = await issueMfaStepUpProof({ app, token: first, userId: actor.id, scope: "privilege.admin-user.block" });
  const latest = await prisma.mfaStepUpProof.findFirst({ where: { userId: actor.id, consumedAt: null }, orderBy: { createdAt: "desc" } });
  await prisma.mfaStepUpProof.update({ where: { id: latest.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await auth(request(app).delete(`/api/admin/users/${target.id}`), first, expiring.proof)).status, 403);
  assert.equal((await prisma.user.findUnique({ where: { id: target.id } })).isActive, true);
});

test("real recovery code is single-use and a challenge locks after bounded failures", async () => {
  const token = tokenFor();
  const enrollment = await ensureMfaEnrollment(actor.id);
  const recovery = enrollment.recoveryCodes[Math.max(0, enrollment.proofCount - 1)];
  await issueMfaStepUpProof({ app, token, userId: actor.id, scope: "privilege.admin-user.block", method: "recovery_code", recoveryCode: recovery });
  const issued = await auth(request(app).post("/api/auth/mfa/step-up"), token).send({ scope: "privilege.admin-user.block" });
  assert.equal((await auth(request(app).post("/api/auth/mfa/step-up/verify"), token).send({ scope: "privilege.admin-user.block", challenge: issued.body.challenge, method: "recovery_code", code: recovery })).status, 401);
  const locked = await auth(request(app).post("/api/auth/mfa/step-up"), token).send({ scope: "privilege.admin-user.block" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal((await auth(request(app).post("/api/auth/mfa/step-up/verify"), token).send({ scope: "privilege.admin-user.block", challenge: locked.body.challenge, method: "totp", code: "000000" })).status, 401);
  }
  assert.equal((await auth(request(app).post("/api/auth/mfa/step-up/verify"), token).send({ scope: "privilege.admin-user.block", challenge: locked.body.challenge, method: "totp", code: await createTotpCode({ secret: enrollment.secret }) })).status, 401);
});

test("concurrent proof consumption allows exactly one protected mutation", async () => {
  await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });
  const token = tokenFor();
  const { proof } = await issueMfaStepUpProof({ app, token, userId: actor.id, scope: "privilege.admin-user.unblock" });
  const responses = await Promise.all([
    auth(request(app).patch(`/api/admin/users/${target.id}/unblock`), token, proof),
    auth(request(app).patch(`/api/admin/users/${target.id}/unblock`), token, proof),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 403]);
  assert.equal((await prisma.user.findUnique({ where: { id: target.id } })).isActive, true);
});

test("every newly protected route category rejects an administrator without proof before mutation", async () => {
  const token = tokenFor();
  const calls = [
    request(app).patch("/api/settlements/missing/fulfillment").send({ status: "SHIPPED" }),
    request(app).post("/api/stripe/payment-intents/settlements/missing").send({}),
    request(app).post("/api/marketplace-transactions/missing/customer-sell/offline-payment").send({}),
    request(app).post("/api/super-admin/shops/missing/support-sessions").send({ reason: "review" }),
    request(app).post("/api/super-admin/shops/missing/inventory").send({ reason: "review" }),
    request(app).post("/api/super-admin/messaging/conversations/missing/moderation").send({}),
    request(app).post("/api/training/admin").send({}),
    request(app).post("/api/locations/backfill-coordinates").send({}),
    request(app).post("/api/locations/missing/verify-location").send({}),
    request(app).post("/api/super-admin/shops").send({}),
  ];
  const responses = await Promise.all(calls.map((call) => auth(call, token)));
  assert.deepEqual(responses.map(({ status }) => status), Array(calls.length).fill(403));
  assert.ok(responses.every(({ body }) => body.code === "MFA_STEP_UP_REQUIRED" && typeof body.scope === "string"));
});

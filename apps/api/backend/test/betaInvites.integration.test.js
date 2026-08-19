import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { digestInviteToken } from "../src/services/betaInvite.service.js";
import { digestAccountActionToken } from "../src/services/accountActionToken.service.js";
import { issueMfaStepUpProof, resetMfaTestMode } from "./helpers/mfaStepUp.fixture.js";

const SECRET = "beta-invite-integration-test-secret";
const DOMAIN = "@beta-invite.integration.pawnloop.test";
const PASSWORD = "BetaInviteSecure123!";
const CONSENT = {
  accepted: true,
  termsVersion: "2026-07-28",
  privacyVersion: "2026-07-28",
};

let app;
let prisma;
let superAdmin;
let admin;
let databaseVerified = false;

function tokenFor(user) {
  return jwt.sign({
    sub: user.id,
    role: user.role,
    authVersion: user.authVersion,
    jti: crypto.randomUUID(),
  }, SECRET);
}

function auth(user) {
  return `Bearer ${tokenFor(user)}`;
}

async function createUser(prefix, role) {
  return prisma.user.create({
    data: {
      name: prefix,
      email: `${prefix}${DOMAIN}`.toLowerCase(),
      password: await bcrypt.hash(PASSWORD, 12),
      role,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
}

function registration(email, token, role = "CONSUMER", overrides = {}) {
  const payload = {
    name: "Beta Registrant",
    email,
    password: PASSWORD,
    role,
    legalConsent: CONSENT,
    ...overrides,
  };
  if (token !== undefined) payload.inviteToken = token;
  return request(app).post("/api/auth/register").send(payload);
}

async function issue(overrides = {}, actor = superAdmin) {
  const token = tokenFor(actor);
  const { proof } = await issueMfaStepUpProof({ app, token, userId: actor.id, scope: "privilege.beta-invite.create" });
  return request(app)
    .post("/api/super-admin/beta-invites")
    .set("Authorization", `Bearer ${token}`)
    .set("x-mfa-step-up-proof", proof)
    .send({
      cohort: "founding-beta",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      maxUses: 1,
      ...overrides,
    });
}

async function revoke(inviteId) {
  const token = tokenFor(superAdmin);
  const { proof } = await issueMfaStepUpProof({ app, token, userId: superAdmin.id, scope: "privilege.beta-invite.revoke" });
  return request(app).post(`/api/super-admin/beta-invites/${inviteId}/revoke`)
    .set("Authorization", `Bearer ${token}`).set("x-mfa-step-up-proof", proof).send({});
}

async function cleanup() {
  await prisma.superAdminAuditLog.deleteMany({
    where: {
      OR: [
        { actorEmail: { endsWith: DOMAIN } },
        { action: { in: ["BETA_INVITE_ISSUED", "BETA_INVITE_REVOKED", "BETA_INVITE_REDEEMED"] } },
      ],
    },
  });
  await prisma.betaInviteRedemption.deleteMany({
    where: { user: { email: { endsWith: DOMAIN } } },
  });
  await prisma.betaInvite.deleteMany({
    where: { issuedBy: { email: { endsWith: DOMAIN } } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
    INVITE_ONLY_REGISTRATION_ENABLED: "true",
    WEB_URL: "http://localhost:5173",
  });
  const raw = String(process.env.DATABASE_URL || "");
  assert.ok(raw, "DATABASE_URL is required");
  assert.equal(
    decodeURIComponent(new URL(raw).pathname.replace(/^\/+/, "")),
    "pawnshop_test",
  );
  const appModule = await import("../src/app.js");
  ({ prisma } = await import("../src/lib/prisma.js"));
  app = appModule.createApp();
  const result = await prisma.$queryRaw`SELECT current_database() AS database_name`;
  assert.equal(result[0]?.database_name, "pawnshop_test");
  databaseVerified = true;
});

beforeEach(async () => {
  resetMfaTestMode();
  app.locals.authRateLimiters.store.resetAll();
  assert.equal(databaseVerified, true);
  await cleanup();
  superAdmin = await createUser("super-admin", "SUPER_ADMIN");
  admin = await createUser("admin", "ADMIN");
  process.env.INVITE_ONLY_REGISTRATION_ENABLED = "true";
});

after(async () => {
  if (!prisma) return;
  if (databaseVerified) await cleanup();
  resetMfaTestMode();
  await prisma.$disconnect();
});

test("SUPER_ADMIN issuance returns a token once and stores only its digest", async () => {
  const response = await issue({ email: `Person${DOMAIN}` });
  assert.equal(response.status, 201);
  assert.match(response.body.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(response.body.invite.email, `person${DOMAIN}`);
  const stored = await prisma.betaInvite.findUnique({ where: { id: response.body.invite.id } });
  assert.equal(stored.tokenDigest, digestInviteToken(response.body.token));
  assert.notEqual(stored.tokenDigest, response.body.token);

  const list = await request(app)
    .get("/api/super-admin/beta-invites")
    .set("Authorization", auth(superAdmin));
  const detail = await request(app)
    .get(`/api/super-admin/beta-invites/${stored.id}`)
    .set("Authorization", auth(superAdmin));
  assert.equal(JSON.stringify(list.body).includes(response.body.token), false);
  assert.equal(JSON.stringify(detail.body).includes(response.body.token), false);
  assert.equal("tokenDigest" in list.body.invites[0], false);

  const audits = await prisma.superAdminAuditLog.findMany({
    where: { targetId: stored.id },
  });
  assert.equal(JSON.stringify(audits).includes(response.body.token), false);
});

test("non-SUPER_ADMIN and unauthenticated users cannot issue, list, detail, or revoke", async () => {
  const created = await issue();
  for (const authorization of [null, auth(admin)]) {
    const headers = authorization ? { Authorization: authorization } : {};
    assert.equal((await request(app).post("/api/super-admin/beta-invites").set(headers).send({})).status, authorization ? 403 : 401);
    assert.equal((await request(app).get("/api/super-admin/beta-invites").set(headers)).status, authorization ? 403 : 401);
    assert.equal((await request(app).get(`/api/super-admin/beta-invites/${created.body.invite.id}`).set(headers)).status, authorization ? 403 : 401);
    assert.equal((await request(app).post(`/api/super-admin/beta-invites/${created.body.invite.id}/revoke`).set(headers).send({})).status, authorization ? 403 : 401);
  }
});

test("valid invite registration records a redemption and redemption audit", async () => {
  const created = await issue({ intendedRole: "OWNER", email: `Owner${DOMAIN}` });
  const response = await registration(`OWNER${DOMAIN}`, created.body.token, "OWNER");
  assert.equal(response.status, 201);
  const invite = await prisma.betaInvite.findUnique({
    where: { id: created.body.invite.id },
    include: { redemptions: true },
  });
  assert.equal(invite.redeemedCount, 1);
  assert.equal(invite.redemptions.length, 1);
  assert.equal(await prisma.superAdminAuditLog.count({
    where: { action: "BETA_INVITE_REDEEMED", targetId: invite.id },
  }), 1);
});

test("missing, invalid, expired, revoked, exhausted, email-mismatched, and role-mismatched invites fail without users", async () => {
  const cases = [];
  cases.push([`${"missing"}${DOMAIN}`, undefined, "CONSUMER", "INVITE_REQUIRED"]);
  cases.push([`${"invalid"}${DOMAIN}`, "not-a-real-token", "CONSUMER", "INVALID_INVITE"]);

  const expired = await issue();
  await prisma.betaInvite.update({ where: { id: expired.body.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  cases.push([`expired${DOMAIN}`, expired.body.token, "CONSUMER", "INVITE_EXPIRED"]);

  const revoked = await issue();
  const revokedResponse = await revoke(revoked.body.invite.id);
  assert.equal(revokedResponse.status, 200);
  assert.ok(revokedResponse.body.invite.revokedAt);
  assert.equal(await prisma.superAdminAuditLog.count({
    where: { action: "BETA_INVITE_REVOKED", targetId: revoked.body.invite.id },
  }), 1);
  cases.push([`revoked${DOMAIN}`, revoked.body.token, "CONSUMER", "INVITE_REVOKED"]);

  const exhausted = await issue();
  await prisma.betaInvite.update({ where: { id: exhausted.body.invite.id }, data: { redeemedCount: 1 } });
  cases.push([`exhausted${DOMAIN}`, exhausted.body.token, "CONSUMER", "INVITE_EXHAUSTED"]);

  const emailRestricted = await issue({ email: `allowed${DOMAIN}` });
  cases.push([`wrong${DOMAIN}`, emailRestricted.body.token, "CONSUMER", "INVITE_EMAIL_MISMATCH"]);

  // This table deliberately crosses more independent invite-policy scenarios than
  // the step-up creation limiter permits in one window. Reset only the in-memory
  // test limiter between batches; production rate-limit behavior is covered by
  // the dedicated MFA protocol tests.
  app.locals.authRateLimiters.store.resetAll();
  const roleRestricted = await issue({ intendedRole: "OWNER" });
  cases.push([`role${DOMAIN}`, roleRestricted.body.token, "CONSUMER", "INVITE_ROLE_MISMATCH"]);

  for (const [email, token, role, code] of cases) {
    const response = await registration(email, token, role);
    assert.equal(response.status, 403);
    assert.equal(response.body.code, code);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  }
});

test("failed registration does not consume capacity", async () => {
  const created = await issue();
  const response = await registration(`weak${DOMAIN}`, created.body.token, "CONSUMER", { password: "short" });
  assert.equal(response.status, 400);
  const invite = await prisma.betaInvite.findUnique({ where: { id: created.body.invite.id } });
  assert.equal(invite.redeemedCount, 0);
  assert.equal(await prisma.betaInviteRedemption.count({ where: { inviteId: invite.id } }), 0);
});

test("concurrent redemption cannot exceed maxUses", async () => {
  const created = await issue({ maxUses: 1 });
  const responses = await Promise.all([
    registration(`race-a${DOMAIN}`, created.body.token),
    registration(`race-b${DOMAIN}`, created.body.token),
  ]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [201, 403]);
  const invite = await prisma.betaInvite.findUnique({ where: { id: created.body.invite.id } });
  assert.equal(invite.redeemedCount, 1);
  assert.equal(await prisma.betaInviteRedemption.count({ where: { inviteId: invite.id } }), 1);
});

test("sequential redemption stops at maxUses and duplicate linkage is rejected", async () => {
  const created = await issue({ maxUses: 2 });
  const first = await registration(`sequential-a${DOMAIN}`, created.body.token);
  const second = await registration(`sequential-b${DOMAIN}`, created.body.token);
  const exhausted = await registration(`sequential-c${DOMAIN}`, created.body.token);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(exhausted.status, 403);
  assert.equal(exhausted.body.code, "INVITE_EXHAUSTED");

  const invite = await prisma.betaInvite.findUnique({
    where: { id: created.body.invite.id },
    include: { redemptions: true },
  });
  assert.equal(invite.redeemedCount, 2);
  assert.equal(invite.redemptions.length, 2);
  await assert.rejects(
    prisma.betaInviteRedemption.create({
      data: {
        inviteId: invite.id,
        userId: invite.redemptions[0].userId,
      },
    }),
    (error) => error?.code === "P2002",
  );
});

test("a failure after redemption inside registration rolls back every write", async () => {
  const created = await issue({ intendedRole: "OWNER" });
  const fixedBytes = Buffer.alloc(32, 7);
  const conflictingRawToken = fixedBytes.toString("base64url");
  await prisma.accountActionToken.create({
    data: {
      userId: admin.id,
      purpose: "EMAIL_VERIFICATION",
      tokenDigest: digestAccountActionToken(conflictingRawToken),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const originalRandomBytes = crypto.randomBytes;
  crypto.randomBytes = () => fixedBytes;
  let response;
  try {
    response = await registration(`rollback-owner${DOMAIN}`, created.body.token, "OWNER");
  } finally {
    crypto.randomBytes = originalRandomBytes;
  }

  assert.equal(response.status, 409);
  assert.equal(await prisma.user.count({
    where: { email: `rollback-owner${DOMAIN}` },
  }), 0);
  const invite = await prisma.betaInvite.findUnique({
    where: { id: created.body.invite.id },
  });
  assert.equal(invite.redeemedCount, 0);
  assert.equal(await prisma.betaInviteRedemption.count({
    where: { inviteId: invite.id },
  }), 0);
  assert.equal(await prisma.superAdminAuditLog.count({
    where: { action: "BETA_INVITE_REDEEMED", targetId: invite.id },
  }), 0);
});

test("issuance, revocation, and redemption audit metadata never contain the raw token", async () => {
  const redeemed = await issue();
  assert.equal((await registration(`audit-redeem${DOMAIN}`, redeemed.body.token)).status, 201);
  const revoked = await issue();
  assert.equal((await revoke(revoked.body.invite.id)).status, 200);

  const audits = await prisma.superAdminAuditLog.findMany({
    where: {
      targetId: { in: [redeemed.body.invite.id, revoked.body.invite.id] },
    },
  });
  assert.ok(audits.some((audit) => audit.action === "BETA_INVITE_ISSUED"));
  assert.ok(audits.some((audit) => audit.action === "BETA_INVITE_REDEEMED"));
  assert.ok(audits.some((audit) => audit.action === "BETA_INVITE_REVOKED"));
  const serializedMetadata = JSON.stringify(audits.map((audit) => audit.metadata));
  assert.equal(serializedMetadata.includes(redeemed.body.token), false);
  assert.equal(serializedMetadata.includes(revoked.body.token), false);
  assert.doesNotMatch(serializedMetadata, /tokenDigest|inviteToken|inviteCode/i);
});

test("enforcement disabled preserves explicit backward-compatible registration", async () => {
  process.env.INVITE_ONLY_REGISTRATION_ENABLED = "false";
  const response = await registration(`open${DOMAIN}`, undefined);
  assert.equal(response.status, 201);
});

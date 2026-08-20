import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { issueMfaStepUpProof, resetMfaTestMode } from "./helpers/mfaStepUp.fixture.js";
import { validateIntegrationTestDatabase, verifyConnectedIntegrationTestDatabase } from "./helpers/databaseSafety.fixture.js";

const TEST_JWT_SECRET = "pawnloop-db-tests-only-secret-2026";
const TEST_DOMAIN = "@integration.pawnloop.test";

const VALID_LEGAL_CONSENT = Object.freeze({
  accepted: true,
  termsVersion: "2026-07-28",
  privacyVersion: "2026-07-28",
});
const GENERIC_VERIFICATION_RESPONSE_FOR_TEST = Object.freeze({
  success: true,
  message: "If the account is eligible, a verification email will be sent.",
});

const sentEmail = [];
let emailDeliveryError = null;
let app;
let prisma;
let databaseVerified = false;

function email(prefix) {
  return `${prefix}${TEST_DOMAIN}`;
}

function tokenFromLatestEmail() {
  const text = String(sentEmail.at(-1)?.text || "");
  const match = text.match(/[?&]token=([A-Za-z0-9_-]+)/);
  assert.ok(match, "action email must contain a token URL");
  return match[1];
}

async function registerUser({
  name = "Integration User",
  userEmail = email("consumer"),
  password = "ConsumerSecure123!",
  role = "CONSUMER",
  legalConsent = VALID_LEGAL_CONSENT,
  omitLegalConsent = false,
} = {}) {
  const payload = {
    name,
    email: userEmail,
    password,
    role,
  };

  if (!omitLegalConsent) {
    payload.legalConsent = legalConsent;
  }

  return request(app)
    .post("/api/auth/register")
    .send(payload);
}

async function verifyLatestEmail() {
  return request(app).post("/api/auth/verify-email").send({
    token: tokenFromLatestEmail(),
  });
}

async function registerAndVerify(options = {}) {
  const registered = await registerUser(options);
  assert.equal(registered.status, 201);
  const verified = await verifyLatestEmail();
  assert.equal(verified.status, 200);
  return registered;
}

async function loginUser({
  userEmail,
  password = "ConsumerSecure123!",
}) {
  return request(app).post("/api/auth/login").send({
    email: userEmail,
    password,
  });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME: "pawnloop-api-integration-test",
    JWT_SECRET: TEST_JWT_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
    WEB_URL: "http://localhost:5173",
    INVITE_ONLY_REGISTRATION_ENABLED: "false",
    EMAIL_PROVIDER: "resend",
  });
  const databaseTarget = validateIntegrationTestDatabase();

  const appModule = await import("../src/app.js");
  const prismaModule = await import("../src/lib/prisma.js");
  const emailModule = await import("../src/services/transactionalEmail.service.js");
  emailModule.setTransactionalEmailResendClientForTests({
    emails: {
      async send(message) {
        if (emailDeliveryError) throw emailDeliveryError;
        sentEmail.push(message);
        return { data: { id: "test-message" }, error: null };
      },
    },
  });
  app = appModule.createApp();
  prisma = prismaModule.prisma;

  await verifyConnectedIntegrationTestDatabase(prisma, databaseTarget);
  databaseVerified = true;
});

beforeEach(async () => {
  resetMfaTestMode();
  assert.equal(
    databaseVerified,
    true,
    "Database isolation must be verified before cleanup",
  );
  sentEmail.length = 0;
  emailDeliveryError = null;
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
});

after(async () => {
  if (!prisma) return;
  try {
    if (databaseVerified) {
      await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test("registration creates an unverified account without a login token", async () => {
  const response = await registerUser({
    userEmail: "Consumer@Integration.PawnLoop.Test",
    role: "BUYER",
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.nextStep, "VERIFY_EMAIL");
  assert.equal(response.body.emailDelivery, "SENT");
  assert.equal("token" in response.body, false);
  assert.equal(response.body.user.email, email("consumer"));
  assert.equal(response.body.user.role, "CONSUMER");

  const stored = await prisma.user.findUnique({ where: { email: email("consumer") } });
  assert.equal(stored.emailVerifiedAt, null);
  assert.equal(await bcrypt.compare("ConsumerSecure123!", stored.password), true);
});

test("registration preserves the account and returns a structured result when email delivery fails", async () => {
  const userEmail = email("delivery-failure");
  emailDeliveryError = Object.assign(new Error("Email delivery failed"), {
    code: "ETIMEDOUT",
  });

  const response = await registerUser({ userEmail });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.nextStep, "VERIFY_EMAIL");
  assert.equal(response.body.emailDelivery, "FAILED");
  assert.equal(response.body.code, "VERIFICATION_EMAIL_DELIVERY_FAILED");
  assert.equal(
    response.body.message,
    "Your account was created, but we could not send the verification email. Please request another verification email.",
  );
  assert.equal("token" in response.body, false);
  assert.equal(sentEmail.length, 0);

  const stored = await prisma.user.findUnique({ where: { email: userEmail } });
  assert.ok(stored);
  assert.equal(stored.emailVerifiedAt, null);
});

test("registration records auditable legal consent", async () => {
  const userEmail = email("legal-audit");

  const response = await registerUser({
    userEmail,
  });

  assert.equal(response.status, 201);

  const consent = await prisma.legalConsent.findFirst({
    where: {
      user: {
        email: userEmail,
      },
    },
  });

  assert.ok(consent);
  assert.equal(consent.termsVersion, "2026-07-28");
  assert.equal(consent.privacyVersion, "2026-07-28");
  assert.ok(consent.acceptedAt instanceof Date);
});

test("registration rejects missing, false, and outdated legal consent", async () => {
  const missing = await registerUser({
    userEmail: email("legal-missing"),
    omitLegalConsent: true,
  });

  assert.equal(missing.status, 400);
  assert.equal(
    missing.body.code,
    "LEGAL_CONSENT_REQUIRED",
  );

  const declined = await registerUser({
    userEmail: email("legal-declined"),
    legalConsent: {
      ...VALID_LEGAL_CONSENT,
      accepted: false,
    },
  });

  assert.equal(declined.status, 400);
  assert.equal(
    declined.body.code,
    "LEGAL_CONSENT_REQUIRED",
  );

  const outdated = await registerUser({
    userEmail: email("legal-outdated"),
    legalConsent: {
      accepted: true,
      termsVersion: "2026-01-01",
      privacyVersion: "2026-01-01",
    },
  });

  assert.equal(outdated.status, 400);
  assert.equal(
    outdated.body.code,
    "LEGAL_POLICY_VERSION_MISMATCH",
  );
});

test("registration stores only a verification token digest", async () => {
  await registerUser({ userEmail: email("digest") });
  const rawToken = tokenFromLatestEmail();
  const stored = await prisma.accountActionToken.findFirst({
    where: { user: { email: email("digest") } },
  });
  assert.ok(stored);
  assert.notEqual(stored.tokenDigest, rawToken);
  assert.match(stored.tokenDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(stored).includes(rawToken), false);
});

test("valid email verification is single-use", async () => {
  await registerUser({ userEmail: email("verify") });
  const token = tokenFromLatestEmail();
  const first = await request(app).post("/api/auth/verify-email").send({ token });
  assert.equal(first.status, 200);
  const stored = await prisma.user.findUnique({ where: { email: email("verify") } });
  assert.ok(stored.emailVerifiedAt instanceof Date);

  const repeated = await request(app).post("/api/auth/verify-email").send({ token });
  assert.equal(repeated.status, 400);
  assert.equal(repeated.body.code, "INVALID_OR_EXPIRED_TOKEN");
});

test("expired verification tokens fail safely", async () => {
  await registerUser({ userEmail: email("verify-expired") });
  const token = tokenFromLatestEmail();
  await prisma.accountActionToken.updateMany({
    where: { user: { email: email("verify-expired") } },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const response = await request(app).post("/api/auth/verify-email").send({ token });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "INVALID_OR_EXPIRED_TOKEN");
});

test("resending verification invalidates the previous token", async () => {
  await registerUser({ userEmail: email("resend") });
  const oldToken = tokenFromLatestEmail();
  const response = await request(app)
    .post("/api/auth/resend-verification")
    .send({ email: email("resend") });
  assert.equal(response.status, 200);
  const newToken = tokenFromLatestEmail();
  assert.notEqual(newToken, oldToken);
  assert.equal((await request(app).post("/api/auth/verify-email").send({ token: oldToken })).status, 400);
  assert.equal((await request(app).post("/api/auth/verify-email").send({ token: newToken })).status, 200);
});

test("resend verification keeps the privacy-safe response when delivery fails", async () => {
  await registerUser({ userEmail: email("resend-failure") });
  emailDeliveryError = Object.assign(new Error("Email delivery failed"), {
    code: "ETIMEDOUT",
  });

  const response = await request(app)
    .post("/api/auth/resend-verification")
    .send({ email: email("resend-failure") });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, GENERIC_VERIFICATION_RESPONSE_FOR_TEST);
});

test("resend response is generic for unknown emails", async () => {
  const response = await request(app)
    .post("/api/auth/resend-verification")
    .send({ email: email("missing") });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    message: "If the account is eligible, a verification email will be sent.",
  });
});

test("unverified login is rejected and verified login remains successful", async () => {
  await registerUser({ userEmail: email("login"), password: "LoginSecure123!" });
  const unverified = await request(app).post("/api/auth/login").send({
    email: email("login"),
    password: "LoginSecure123!",
  });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.code, "EMAIL_VERIFICATION_REQUIRED");

  await verifyLatestEmail();
  const verified = await request(app).post("/api/auth/login").send({
    email: email("login"),
    password: "LoginSecure123!",
  });
  assert.equal(verified.status, 200);
  assert.equal(typeof verified.body.token, "string");
});

test("OWNER registration creates a draft application and verification does not approve a shop", async () => {
  const registration = await registerUser({
    userEmail: email("owner"),
    role: "OWNER",
  });

  assert.equal(registration.status, 201);
  assert.equal(registration.body.nextStep, "VERIFY_EMAIL");

  const registeredOwner = await prisma.user.findUnique({
    where: { email: email("owner") },
    include: {
      ownerApplication: true,
      shops: true,
    },
  });

  assert.equal(registeredOwner.role, "OWNER");
  assert.equal(
    registeredOwner.ownerApplication.status,
    "DRAFT",
  );
  assert.equal(
    registeredOwner.ownerApplication.businessEmail,
    email("owner"),
  );
  assert.equal(
    registeredOwner.ownerApplication.reviewedAt,
    null,
  );
  assert.equal(registeredOwner.ownerApplication.submittedAt, null);
  assert.deepEqual(registeredOwner.shops, []);

  const response = await verifyLatestEmail();
  assert.equal(response.status, 200);

  const verifiedOwner = await prisma.user.findUnique({
    where: { email: email("owner") },
    include: {
      ownerApplication: true,
      shops: true,
    },
  });

  assert.ok(verifiedOwner.emailVerifiedAt instanceof Date);
  assert.equal(
    verifiedOwner.ownerApplication.status,
    "DRAFT",
  );
  assert.deepEqual(verifiedOwner.shops, []);
});

test("forgot-password response is identical for existing and unknown emails", async () => {
  await registerUser({ userEmail: email("forgot") });
  const existing = await request(app).post("/api/auth/forgot-password").send({ email: email("forgot") });
  const unknown = await request(app).post("/api/auth/forgot-password").send({ email: email("unknown") });
  assert.equal(existing.status, 200);
  assert.deepEqual(unknown.body, existing.body);
});

test("valid password reset updates password metadata and increments authVersion", async () => {
  await registerUser({ userEmail: email("reset") });
  await request(app).post("/api/auth/forgot-password").send({ email: email("reset") });
  const token = tokenFromLatestEmail();
  const response = await request(app).post("/api/auth/reset-password").send({
    token,
    password: "UpdatedSecure123!",
  });
  assert.equal(response.status, 200);
  const stored = await prisma.user.findUnique({ where: { email: email("reset") } });
  assert.equal(stored.authVersion, 1);
  assert.ok(stored.passwordChangedAt instanceof Date);
  assert.equal(await bcrypt.compare("UpdatedSecure123!", stored.password), true);
});

test("expired and repeated password reset tokens are rejected", async () => {
  await registerUser({ userEmail: email("reset-expired") });
  await request(app).post("/api/auth/forgot-password").send({ email: email("reset-expired") });
  const expiredToken = tokenFromLatestEmail();
  await prisma.accountActionToken.updateMany({
    where: { user: { email: email("reset-expired") }, purpose: "PASSWORD_RESET" },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await request(app).post("/api/auth/reset-password").send({
    token: expiredToken,
    password: "UpdatedSecure123!",
  })).status, 400);

  await request(app).post("/api/auth/forgot-password").send({ email: email("reset-expired") });
  const validToken = tokenFromLatestEmail();
  assert.equal((await request(app).post("/api/auth/reset-password").send({
    token: validToken,
    password: "UpdatedSecure123!",
  })).status, 200);
  assert.equal((await request(app).post("/api/auth/reset-password").send({
    token: validToken,
    password: "AnotherSecure123!",
  })).status, 400);
});

test("password reset enforces the centralized password policy", async () => {
  await registerUser({ userEmail: email("reset-policy") });
  await request(app).post("/api/auth/forgot-password").send({ email: email("reset-policy") });
  const response = await request(app).post("/api/auth/reset-password").send({
    token: tokenFromLatestEmail(),
    password: "short",
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "PASSWORD_TOO_SHORT");
});

test("existing JWT is rejected after password reset", async () => {
  await registerUser({ userEmail: email("session-reset"), password: "OriginalSecure123!" });
  await verifyLatestEmail();
  const login = await request(app).post("/api/auth/login").send({
    email: email("session-reset"),
    password: "OriginalSecure123!",
  });
  assert.equal(login.status, 200);

  await request(app).post("/api/auth/forgot-password").send({ email: email("session-reset") });
  await request(app).post("/api/auth/reset-password").send({
    token: tokenFromLatestEmail(),
    password: "UpdatedSecure123!",
  });
  const me = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(me.status, 401);
});

test("registration preserves centralized password policy and public role restrictions", async () => {
  const weak = await registerUser({ userEmail: email("weak"), password: "short" });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, "PASSWORD_TOO_SHORT");
  const admin = await registerUser({ userEmail: email("admin"), role: "ADMIN" });
  assert.equal(admin.status, 403);
});

test("duplicate unverified registration uses a nonspecific error", async () => {
  await registerUser({ userEmail: email("duplicate") });
  const duplicate = await registerUser({ userEmail: email("duplicate") });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, { error: "Unable to create account with those details" });
});

test("duplicate verified registration uses the same nonspecific error", async () => {
  await registerAndVerify({ userEmail: email("duplicate-verified") });
  const duplicate = await registerUser({ userEmail: email("duplicate-verified") });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, {
    error: "Unable to create account with those details",
  });
});

test("verified users with an incorrect password cannot log in", async () => {
  await registerAndVerify({
    userEmail: email("wrong-password"),
    password: "CorrectSecure123!",
  });
  const response = await loginUser({
    userEmail: email("wrong-password"),
    password: "IncorrectSecure123!",
  });
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Invalid credentials" });
});

test("inactive verified users cannot log in", async () => {
  await registerAndVerify({ userEmail: email("inactive") });
  await prisma.user.update({
    where: { email: email("inactive") },
    data: { isActive: false },
  });
  const response = await loginUser({ userEmail: email("inactive") });
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Invalid credentials" });
});

test("authenticated verified users can load their profile", async () => {
  await registerAndVerify({ userEmail: email("profile") });
  const login = await loginUser({ userEmail: email("profile") });
  assert.equal(login.status, 200);
  const response = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.email, email("profile"));
  assert.equal("password" in response.body.user, false);
  assert.equal(
    "ownerApplication" in response.body.user,
    false,
  );
});

test("authenticated owners receive their draft application status through auth me", async () => {
  await registerAndVerify({
    userEmail: email("owner-profile"),
    role: "OWNER",
  });

  const login = await loginUser({
    userEmail: email("owner-profile"),
  });

  assert.equal(login.status, 200);

  const response = await request(app)
    .get("/api/auth/me")
    .set(
      "Authorization",
      `Bearer ${login.body.token}`,
    );

  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, "OWNER");
  assert.equal(
    response.body.user.ownerApplication.status,
    "DRAFT",
  );
  assert.equal(
    response.body.user.ownerApplication.reviewedAt,
    null,
  );
  assert.equal(
    response.body.user.ownerApplication.decisionReason,
    null,
  );
  assert.equal(
    "adminNotes" in
      response.body.user.ownerApplication,
    false,
  );
});

test("legacy password hashes continue to authenticate for verified users", async () => {
  await prisma.user.create({
    data: {
      name: "Legacy User",
      email: email("legacy-password"),
      password: await bcrypt.hash("old-pass", 10),
      role: "CONSUMER",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  const response = await loginUser({
    userEmail: email("legacy-password"),
    password: "old-pass",
  });
  assert.equal(response.status, 200);
});

test("authenticated requests reject missing or wrong authVersion", async () => {
  await registerAndVerify({ userEmail: email("token-version") });
  const login = await loginUser({ userEmail: email("token-version") });
  const payload = jwt.decode(login.body.token);
  const legacyToken = jwt.sign(
    { sub: payload.sub, role: "CONSUMER" },
    TEST_JWT_SECRET,
  );
  const wrongToken = jwt.sign(
    { sub: payload.sub, role: "CONSUMER", authVersion: 99 },
    TEST_JWT_SECRET,
  );

  for (const token of [legacyToken, wrongToken]) {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { error: "Invalid token" });
  }
});

test("authenticated requests reject users made inactive after token issuance", async () => {
  await registerAndVerify({ userEmail: email("session-inactive") });
  const login = await loginUser({ userEmail: email("session-inactive") });
  await prisma.user.update({
    where: { email: email("session-inactive") },
    data: { isActive: false },
  });
  const response = await request(app)
    .post("/api/auth/refresh")
    .set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(response.status, 401);
});

test("database role, not stale JWT role, controls authorization", async () => {
  const user = await prisma.user.create({
    data: {
      name: "Role Authority",
      email: email("role-authority"),
      password: await bcrypt.hash("RoleAuthoritySecure123!", 12),
      role: "CONSUMER",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  const forgedPrivilege = jwt.sign(
    { sub: user.id, role: "SUPER_ADMIN", authVersion: user.authVersion },
    TEST_JWT_SECRET,
  );
  const denied = await request(app)
    .post("/api/auth/super-admin/users")
    .set("Authorization", `Bearer ${forgedPrivilege}`)
    .send({
      name: "Denied",
      email: email("denied-role"),
      password: "DeniedSecure123!",
      role: "ADMIN",
    });
  assert.equal(denied.status, 403);

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "SUPER_ADMIN" },
  });
  const staleLowRole = jwt.sign(
    { sub: user.id, role: "CONSUMER", authVersion: user.authVersion, jti: crypto.randomUUID() },
    TEST_JWT_SECRET,
  );
  const { proof } = await issueMfaStepUpProof({ app, token: staleLowRole, userId: user.id, scope: "privilege.super-admin-user.create" });
  const allowed = await request(app)
    .post("/api/auth/super-admin/users")
    .set("Authorization", `Bearer ${staleLowRole}`)
    .set("x-mfa-step-up-proof", proof)
    .send({
      name: "Allowed",
      email: email("allowed-role"),
      password: "AllowedSecure123!",
      role: "ADMIN",
    });
  assert.equal(allowed.status, 201);
});

test("admin and super-admin creation use the centralized password policy", async () => {
  const admin = await prisma.user.create({
    data: {
      name: "Creation Admin",
      email: email("creation-admin"),
      password: await bcrypt.hash("CreationAdminSecure123!", 12),
      role: "SUPER_ADMIN",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  const token = jwt.sign(
    { sub: admin.id, role: admin.role, authVersion: admin.authVersion, jti: crypto.randomUUID() },
    TEST_JWT_SECRET,
  );
  const input = {
    name: "Weak User",
    email: email("weak-created"),
    password: "short",
    role: "CONSUMER",
  };
  const { proof: adminProof } = await issueMfaStepUpProof({ app, token, userId: admin.id, scope: "privilege.admin-user.create" });
  const adminResponse = await request(app)
    .post("/api/admin/users")
    .set("Authorization", `Bearer ${token}`)
    .set("x-mfa-step-up-proof", adminProof)
    .send(input);
  assert.equal(adminResponse.status, 400);
  assert.equal(adminResponse.body.code, "PASSWORD_TOO_SHORT");
  const { proof: superProof } = await issueMfaStepUpProof({ app, token, userId: admin.id, scope: "privilege.super-admin-user.create" });
  const superResponse = await request(app)
    .post("/api/auth/super-admin/users")
    .set("Authorization", `Bearer ${token}`)
    .set("x-mfa-step-up-proof", superProof)
    .send(input);
  assert.equal(superResponse.status, 400);
  assert.equal(superResponse.body.code, "PASSWORD_TOO_SHORT");
});

test("authenticated verified users can refresh their token", async () => {
  await registerAndVerify({ userEmail: email("refresh") });
  const login = await loginUser({ userEmail: email("refresh") });
  const response = await request(app)
    .post("/api/auth/refresh")
    .set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.token, "string");
  assert.equal(response.body.user.email, email("refresh"));
  const payload = jwt.verify(response.body.token, TEST_JWT_SECRET);
  assert.equal(payload.role, "CONSUMER");
  assert.equal(payload.authVersion, 0);
});

test("admin deactivation increments authVersion and invalidates an issued token", async () => {
  const superAdmin = await prisma.user.create({
    data: {
      name: "Session Admin",
      email: email("session-admin"),
      password: await bcrypt.hash("SessionAdminSecure123!", 12),
      role: "SUPER_ADMIN",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  await registerAndVerify({ userEmail: email("session-target") });
  const targetLogin = await loginUser({ userEmail: email("session-target") });
  const target = await prisma.user.findUnique({
    where: { email: email("session-target") },
  });
  const actorToken = jwt.sign(
    {
      sub: superAdmin.id,
      role: superAdmin.role,
      authVersion: superAdmin.authVersion,
      jti: crypto.randomUUID(),
    },
    TEST_JWT_SECRET,
  );
  const { proof } = await issueMfaStepUpProof({ app, token: actorToken, userId: superAdmin.id, scope: "privilege.admin-user.block" });
  const deactivated = await request(app)
    .delete(`/api/admin/users/${target.id}`)
    .set("Authorization", `Bearer ${actorToken}`)
    .set("x-mfa-step-up-proof", proof);
  assert.equal(deactivated.status, 200);
  const stored = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(stored.isActive, false);
  assert.equal(stored.authVersion, 1);
  const denied = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${targetLogin.body.token}`);
  assert.equal(denied.status, 401);
});

test("super-admin role changes increment authVersion", async () => {
  const superAdmin = await prisma.user.create({
    data: {
      name: "Governance Admin",
      email: email("governance-admin"),
      password: await bcrypt.hash("GovernanceAdminSecure123!", 12),
      role: "SUPER_ADMIN",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  const target = await prisma.user.create({
    data: {
      name: "Governance Target",
      email: email("governance-target"),
      password: await bcrypt.hash("GovernanceTargetSecure123!", 12),
      role: "CONSUMER",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  const actorToken = jwt.sign(
    {
      sub: superAdmin.id,
      role: superAdmin.role,
      authVersion: superAdmin.authVersion,
      jti: crypto.randomUUID(),
    },
    TEST_JWT_SECRET,
  );
  const { proof } = await issueMfaStepUpProof({ app, token: actorToken, userId: superAdmin.id, scope: "privilege.super-admin-user.update" });
  const response = await request(app)
    .patch(`/api/super-admin/users/${target.id}`)
    .set("Authorization", `Bearer ${actorToken}`)
    .set("x-mfa-step-up-proof", proof)
    .send({
      role: "OWNER",
      reason: "Promote the verified account owner for governance coverage.",
      confirmed: true,
    });
  assert.equal(response.status, 200);
  const stored = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(stored.role, "OWNER");
  assert.equal(stored.authVersion, 1);
  const audit = await prisma.superAdminAuditLog.findFirst({
    where: {
      action: "UPDATE_USER_GOVERNANCE",
      targetType: "USER",
      targetId: target.id,
      actorId: superAdmin.id,
    },
  });
  assert.ok(audit);
  assert.equal(
    audit.metadata.reason,
    "Promote the verified account owner for governance coverage.",
  );
  assert.equal(audit.metadata.beforeState.role, "CONSUMER");
  assert.equal(audit.metadata.afterState.role, "OWNER");
});

test("verified consumers cannot create privileged users", async () => {
  await registerAndVerify({ userEmail: email("consumer-denied") });
  const login = await loginUser({ userEmail: email("consumer-denied") });
  const response = await request(app)
    .post("/api/auth/super-admin/users")
    .set("Authorization", `Bearer ${login.body.token}`)
    .send({
      name: "Unauthorized Admin",
      email: email("unauthorized-admin"),
      password: "AdminSecure123!",
      role: "ADMIN",
    });
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: "Forbidden" });
});

test("verified super admins can create privileged users", async () => {
  const superAdminPassword = "SuperAdmin123!";
  const superAdmin = await prisma.user.create({
    data: {
      name: "Integration Super Admin",
      email: email("super-admin"),
      password: await bcrypt.hash(superAdminPassword, 12),
      role: "SUPER_ADMIN",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  const login = await loginUser({
    userEmail: email("super-admin"),
    password: superAdminPassword,
  });
  assert.equal(login.status, 200);
  const { proof } = await issueMfaStepUpProof({ app, token: login.body.token, userId: superAdmin.id, scope: "privilege.super-admin-user.create" });
  const response = await request(app)
    .post("/api/auth/super-admin/users")
    .set("Authorization", `Bearer ${login.body.token}`)
    .set("x-mfa-step-up-proof", proof)
    .send({
      name: "Created Integration Admin",
      email: email("created-admin"),
      password: "CreatedAdmin123!",
      role: "ADMIN",
    });
  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.role, "ADMIN");
  assert.equal(response.body.user.email, email("created-admin"));
  const stored = await prisma.user.findUnique({
    where: { email: email("created-admin") },
  });
  assert.ok(stored);
  assert.equal(stored.role, "ADMIN");
  assert.equal("password" in response.body.user, false);

  const audits = await prisma.superAdminAuditLog.findMany({
    where: {
      action: "SUPER_ADMIN_CREATE_USER",
      targetType: "USER",
      targetId: stored.id,
    },
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].targetId, stored.id);
  assert.equal(audits[0].actorId, superAdmin.id);
  assert.equal(audits[0].actorRole, "SUPER_ADMIN");
  assert.equal(audits[0].action, "SUPER_ADMIN_CREATE_USER");
  assert.equal(audits[0].targetType, "USER");
  assert.equal(audits[0].metadata.email, email("created-admin"));
  assert.equal(audits[0].metadata.role, "ADMIN");
  assert.doesNotMatch(
    JSON.stringify(audits),
    /CreatedAdmin123!|password/i,
  );
});

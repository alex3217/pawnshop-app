import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260729230000_invite_only_beta_admission_v1/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const authController = readFileSync(
  new URL("../src/controllers/auth.controller.js", import.meta.url),
  "utf8",
);
const inviteService = readFileSync(
  new URL("../src/services/betaInvite.service.js", import.meta.url),
  "utf8",
);
const routes = readFileSync(
  new URL("../src/routes/superAdmin.routes.js", import.meta.url),
  "utf8",
);

test("Prisma schema and migration share invite columns, uniqueness, relations, and indexes", () => {
  for (const field of [
    "tokenDigest",
    "email",
    "intendedRole",
    "cohort",
    "maxUses",
    "redeemedCount",
    "expiresAt",
    "revokedAt",
    "revokedByUserId",
    "issuedByUserId",
    "createdAt",
    "updatedAt",
  ]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
    assert.match(migration, new RegExp(`"${field}"`));
  }
  assert.match(schema, /tokenDigest\s+String\s+@unique/);
  assert.match(migration, /CREATE UNIQUE INDEX "BetaInvite_tokenDigest_key"/);
  assert.match(schema, /@@unique\(\[inviteId, userId\]\)/);
  assert.match(migration, /"BetaInviteRedemption_inviteId_userId_key"/);
  assert.match(migration, /"BetaInviteRedemption_userId_idx"/);
  assert.match(migration, /CHECK \("maxUses" > 0\)/);
  assert.match(migration, /"redeemedCount" >= 0 AND "redeemedCount" <= "maxUses"/);
  assert.equal((migration.match(/FOREIGN KEY/g) || []).length, 4);
});

test("registration keeps invite claim, user-linked records, and audit in one transaction", () => {
  const transactionStart = authController.indexOf("prisma.$transaction(async (tx)");
  const transactionEnd = authController.indexOf("await sendVerificationEmail", transactionStart);
  const transactionBody = authController.slice(transactionStart, transactionEnd);
  for (const operation of [
    "tx.user.create",
    "redeemInviteInTransaction(tx",
    "tx.ownerApplication.create",
    "tx.legalConsent.create",
    "replaceActiveAccountActionToken(tx",
  ]) {
    assert.ok(transactionBody.includes(operation), `${operation} must remain in the registration transaction`);
  }
  assert.match(inviteService, /tx\.betaInvite\.updateMany\([\s\S]*redeemedCount: \{ lt: invite\.maxUses \}/);
  assert.match(inviteService, /data: \{ redeemedCount: \{ increment: 1 \} \}/);
  assert.match(inviteService, /tx\.betaInviteRedemption\.create/);
  assert.match(inviteService, /tx\.superAdminAuditLog\.create/);
});

test("all invite management endpoints remain behind the shared SUPER_ADMIN guard", () => {
  const guardIndex = routes.indexOf("router.use(authRequired, requireRole(...SUPER_ADMIN_ROLES))");
  assert.ok(guardIndex >= 0);
  for (const route of [
    'router.post("/beta-invites"',
    'router.get("/beta-invites"',
    'router.get("/beta-invites/:id"',
    'router.post("/beta-invites/:id/revoke"',
  ]) {
    assert.ok(routes.indexOf(route) > guardIndex, `${route} must follow the SUPER_ADMIN guard`);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveEffectiveMessagingPermission } from "../src/controllers/superAdminGovernance.controller.js";

test("effective messaging permission is the most restrictive intersection", () => {
  const base = { userActive: true, userConsent: true, blocked: false, administrativeRestriction: false, contextAuthorized: true };
  assert.equal(resolveEffectiveMessagingPermission(base).allowed, true);
  for (const change of [{ userActive: false }, { userConsent: false }, { blocked: true }, { administrativeRestriction: true }, { contextAuthorized: false }]) {
    const result = resolveEffectiveMessagingPermission({ ...base, ...change });
    assert.equal(result.allowed, false);
    assert.equal(result.policy, "MOST_RESTRICTIVE");
  }
});

test("governance routes are SUPER_ADMIN protected and content access is separately audited", async () => {
  const routes = await readFile(new URL("../src/routes/superAdmin.routes.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/controllers/superAdminGovernance.controller.js", import.meta.url), "utf8");
  const auth = routes.indexOf("router.use(authRequired, requireRole(...SUPER_ADMIN_ROLES))");
  for (const route of ["/users/lookup", "/users/:id/governance", "/users/:id/governance-actions", "/messaging/conversations", "/messaging/reports", "/messaging/analytics"]) assert.ok(routes.lastIndexOf(route) > auth, `${route} must follow SUPER_ADMIN auth`);
  assert.match(controller, /SENSITIVE_USER_LOOKUP/);
  assert.match(controller, /VIEW_USER_GOVERNANCE/);
  assert.match(controller, /VIEW_MODERATION_CONTENT/);
  assert.match(controller, /messageBodiesIncluded: false/);
  assert.match(controller, /Explicit confirmation is required/);
  assert.match(controller, /sessionsInvalidated/);
  assert.doesNotMatch(controller, /impersonat/i);
});

test("migration is additive and keeps administrative preferences separate", async () => {
  const sql = await readFile(new URL("../prisma/migrations/20260813210000_super_admin_messaging_governance_v1/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE "UserGovernanceRestriction"/);
  assert.match(sql, /CREATE TABLE "UserGovernanceAction"/);
  assert.match(sql, /CREATE TABLE "MessagingAbuseReport"/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN/);
});

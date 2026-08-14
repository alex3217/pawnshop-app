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
  assert.equal(resolveEffectiveMessagingPermission({ ...base, userConsent: undefined }).allowed, false, "missing consent must fail closed");
  assert.equal(resolveEffectiveMessagingPermission({ ...base, contextAuthorized: undefined }).allowed, false, "missing context authorization must fail closed");
  assert.equal(resolveEffectiveMessagingPermission({ ...base, userConsent: true, administrativeRestriction: true }).allowed, false, "Super Admin restrictions override consent");
});

test("buyer messaging dependency is integrated without exposing private identifiers to shops", async () => {
  const [schema, governance, conversations] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../src/controllers/superAdminGovernance.controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/controllers/shopConversations.controller.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(governance, new RegExp(["DEPENDENCY", "PENDING"].join("_")));
  assert.match(governance, /allowShopFirstContact === true \? "ENABLED" : "DISABLED"/);
  for (const model of ["BuyerMessagingShopBlock", "BuyerMessagingProfileAudit", "UserGovernanceRestriction", "UserGovernanceAction", "MessagingAbuseReport"]) assert.match(schema, new RegExp(`model ${model}`));
  for (const contract of ["allowShopFirstContact === true", "allowTransactionalMessages === true", "RECIPIENT_BLOCKED", "governanceRestriction", "shopInitiated: true"]) assert.ok(conversations.includes(contract), contract);
  const ownerSearch = conversations.slice(conversations.indexOf("export async function searchShopMessageRecipients"), conversations.indexOf("export async function createShopOutboundConversation"));
  assert.doesNotMatch(ownerSearch, /email:\s*true|email:\s*\{/);
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
  const sql = await readFile(new URL("../prisma/migrations/20260813220000_super_admin_messaging_governance_v1/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE "UserGovernanceRestriction"/);
  assert.match(sql, /CREATE TABLE "UserGovernanceAction"/);
  assert.match(sql, /CREATE TABLE "MessagingAbuseReport"/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN/);
});

test("Super Admin governance migration timestamp is unique", async () => {
  const migrations = await import("node:fs/promises").then(({ readdir }) => readdir(new URL("../prisma/migrations/", import.meta.url)));
  assert.equal(migrations.filter((name) => name.startsWith("20260813220000_")).length, 1);
  assert.ok(migrations.includes("20260813220000_super_admin_messaging_governance_v1"));
});

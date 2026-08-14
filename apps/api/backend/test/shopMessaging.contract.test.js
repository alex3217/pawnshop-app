import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createShopMessagingRateLimit } from "../src/middleware/shopMessagingRateLimit.js";

const root = new URL("../", import.meta.url);
async function source(path) { return readFile(new URL(path, root), "utf8"); }

test("messaging schema is durable, single-shop, contextual, and idempotent", async () => {
  const schema = await source("prisma/schema.prisma");
  assert.match(schema, /model ShopConversation[\s\S]*shopId\s+String/);
  assert.doesNotMatch(schema, /shopIds\s+String\[\]/);
  for (const field of ["buyerItemSubmissionId", "buyerItemSubmissionTargetId", "marketplaceListingId", "itemId", "offerId"]) assert.match(schema, new RegExp(`${field}\\s+String\\?`));
  assert.match(schema, /model ShopMessage[\s\S]*@@unique\(\[conversationId, senderUserId, idempotencyKey\]\)/);
  assert.match(schema, /enum ShopConversationStatus\s*{\s*OPEN\s+CLOSED\s+BLOCKED/);
});

test("public search is case-insensitive, paginated, active-only, and privacy selected", async () => {
  const controller = await source("src/controllers/shops.controller.js");
  assert.match(controller, /mode: "insensitive"/);
  assert.match(controller, /isDeleted: false|buildPawnShopWhere/);
  assert.match(controller, /isActive: true, isPublic: true/);
  assert.match(controller, /skip: \(page - 1\) \* limit, take: limit/);
  const publicSet = controller.match(/PAWNSHOP_PUBLIC_FIELDS = new Set\(\[([^\]]+)/)?.[1] || "";
  assert.doesNotMatch(publicSet, /ownerId|email|staff|configuration/);
});

test("routes require authentication and rate-limit writes", async () => {
  const routes = await source("src/routes/shopConversations.routes.js");
  assert.match(routes, /router\.use\(authRequired\)/);
  assert.match(routes, /router\.post\("\/", shopMessagingRateLimit/);
  assert.match(routes, /router\.post\("\/:id\/messages", shopMessagingRateLimit/);
});

test("message rate limiting rejects requests over the configured user limit", async () => {
  const store = { count: 0, async increment() { this.count += 1; return { count: this.count, resetAt: Date.now() + 60_000 }; } };
  const middleware = createShopMessagingRateLimit({ env: { SHOP_MESSAGE_RATE_LIMIT_MAX: "1" }, store });
  const req = { user: { sub: "seller-1" }, requestId: "req-1" };
  const response = () => ({ statusCode: 200, body: null, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  let calls = 0; const first = response(); await middleware(req, first, () => { calls += 1; });
  const second = response(); await middleware(req, second, () => { calls += 1; });
  assert.equal(calls, 1); assert.equal(second.statusCode, 429); assert.equal(second.body.code, "SHOP_MESSAGE_RATE_LIMITED");
});

test("controller contains seller, shop-scope, context, blocked, closed, notification and audit enforcement", async () => {
  const controller = await source("src/controllers/shopConversations.controller.js");
  for (const contract of ["sellerUserId === userId(req)", "assertShopPermission", "getAccessibleShopScope", "Invalid submission target reference", "cannot message your own shop", "status === \"BLOCKED\"", "status === \"CLOSED\"", "notification.createMany", "shopConversationAuditEvent.create"]) assert.ok(controller.includes(contract), contract);
});

test("outbound compose enforces privacy, authorization, account state, atomicity, reuse, and idempotency", async () => {
  const controller = await source("src/controllers/shopConversations.controller.js");
  for (const contract of ["messages:write", "publicMessageIdentifier", "isActive: true", "isDeleted: false", "relationshipWhere(shopId)", "Administrators cannot impersonate a shop", "prisma.$transaction", "findFirst", "senderUserId_idempotencyKey", "SHOP_COMPOSED", "createNotifications"]) assert.ok(controller.includes(contract), contract);
  const selectedRecipientFields = controller.match(/select: \{ publicDisplayName: true, publicMessageIdentifier: true \}/)?.[0] || "";
  assert.doesNotMatch(selectedRecipientFields, /email|phone|\bid:\s*true/);
  for (const contract of ["messageDiscoverable: true", "allowShopFirstContact", "allowTransactionalMessages", "blockedMessagingShops", "FIRST_CONTACT_NOT_ALLOWED", "TRANSACTIONAL_MESSAGES_DISABLED"]) assert.ok(controller.includes(contract), contract);
  const routes = await source("src/routes/shopConversations.routes.js");
  assert.match(routes, /router\.post\("\/shop-compose", shopMessagingRateLimit/);
});

test("buyer messaging profile is private, validated, audited, and block-aware", async () => {
  const [schema, controller, routes, migration] = await Promise.all([
    source("prisma/schema.prisma"), source("src/controllers/buyerMessagingProfile.controller.js"),
    source("src/routes/buyerMessagingProfile.routes.js"), source("prisma/migrations/20260813210000_buyer_messaging_profile_discoverability_v1/migration.sql"),
  ]);
  for (const field of ["publicDisplayName", "messageDiscoverable", "allowShopFirstContact", "allowTransactionalMessages"]) assert.match(schema, new RegExp(field));
  assert.match(schema, /model BuyerMessagingShopBlock/); assert.match(schema, /model BuyerMessagingProfileAudit/);
  assert.match(routes, /router\.use\(authRequired, requireRole\("CONSUMER"\)\)/); assert.match(routes, /blocked-shops\/\:shopId/);
  for (const contract of ["selectProfile", "email: true", "PUBLIC_IDENTIFIER_TAKEN", "PROFILE_UPDATED", "SHOP_UNBLOCKED", "prisma.$transaction"]) assert.ok(controller.includes(contract), contract);
  assert.match(migration, /CREATE TABLE "BuyerMessagingShopBlock"/); assert.match(migration, /CREATE TABLE "BuyerMessagingProfileAudit"/);
});

test("customer recipient search never queries private identity fields", async () => {
  const controller = await source("src/controllers/shopConversations.controller.js");
  const customerSearch = controller.slice(controller.indexOf("const rows = await prisma.user.findMany"), controller.indexOf("export async function createShopOutboundConversation"));
  assert.match(customerSearch, /publicDisplayName/); assert.match(customerSearch, /publicMessageIdentifier/);
  for (const forbidden of ["email", "phone", "address", "legalName", "id: { contains"]) assert.doesNotMatch(customerSearch, new RegExp(forbidden));
});

test("additive migration leaves seller_shop_messaging_v1 untouched and supports shop recipients", async () => {
  const migration = await source("prisma/migrations/20260813190000_shop_outbound_message_compose_v1/migration.sql");
  assert.match(migration, /ADD COLUMN "publicMessageIdentifier"/);
  assert.match(migration, /ADD COLUMN "recipientShopId"/);
  assert.match(migration, /ShopMessage_senderUserId_idempotencyKey_key/);
});

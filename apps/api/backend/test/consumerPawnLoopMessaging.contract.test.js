import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("consumer messaging migration is additive, preference-separated, and lifecycle-aware", async () => {
  const [schema, migration] = await Promise.all([source("prisma/schema.prisma"), source("prisma/migrations/20260819153000_consumer_initiated_pawnloop_messaging/migration.sql")]);
  for (const field of ["sellerDiscoverable", "allowMarketplaceFirstContact", "recipientUserId", "sellerMutedAt", "recipientMutedAt", "sellerArchivedAt", "recipientArchivedAt"]) assert.match(schema, new RegExp(field));
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
  assert.match(migration, /ALTER COLUMN "shopId" DROP NOT NULL/);
  assert.match(migration, /ShopConversation_recipientUserId_fkey/);
});

test("consumer recipient modes enforce public search boundaries", async () => {
  const controller = await source("src/controllers/shopConversations.controller.js");
  for (const value of ["SHOP", "SELLER", "CONTACT", "city", "state", "publicDisplayName", "publicMessageIdentifier"]) assert.ok(controller.includes(value), value);
  const search = controller.slice(controller.indexOf("export async function searchConsumerRecipients"), controller.indexOf("async function sellerContactAuthorization"));
  assert.doesNotMatch(search, /email:\s*true|phone:\s*true|email:\s*\{|phone:\s*\{/);
  assert.match(search, /sellerDiscoverable: true/);
});

test("seller first contact is context-authorized, reusable, idempotent, and abuse controlled", async () => {
  const [controller, routes, limiter] = await Promise.all([source("src/controllers/shopConversations.controller.js"), source("src/routes/shopConversations.routes.js"), source("src/middleware/shopMessagingRateLimit.js")]);
  for (const contract of ["ACTIVE_PUBLIC_LISTING", "MARKETPLACE_RELATIONSHIP", "EXISTING_CONTACT", "SELLER_OPT_IN", "FIRST_CONTACT_NOT_AUTHORIZED", "senderUserId_idempotencyKey", "status: { not: \"BLOCKED\" }", "CONSUMER_FIRST_CONTACT", "notification.createMany"]) assert.ok(controller.includes(contract), contract);
  for (const action of ["mute", "unmute", "archive", "unarchive", "block", "report", "close"]) assert.ok(routes.includes(`/:id/${action}`), action);
  assert.match(routes, /consumer-compose", firstContactRateLimit/);
  assert.match(limiter, /max: 5/);
  assert.match(controller, /cannot contain HTML/);
  assert.match(controller, /cannot contain URLs/);
});

test("API authorization remains participant-scoped and admin moderation is explicit", async () => {
  const controller = await source("src/controllers/shopConversations.controller.js");
  assert.match(controller, /conversation\.sellerUserId, conversation\.recipientUserId/);
  assert.match(controller, /You do not have access to this conversation/);
  assert.match(controller, /Private messages require the explicit audited moderation path/);
  assert.match(controller, /The selected marketplace context does not authorize this seller/);
});

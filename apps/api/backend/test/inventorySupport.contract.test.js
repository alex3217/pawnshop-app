import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertCommerceSafe } from "../src/controllers/inventorySupport.controller.js";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function commerceClient(blocked = {}) {
  const calls = {};
  const model = (name) => ({
    async findFirst(query) {
      calls[name] = query;
      return blocked[name] ? { id: `${name}-1` } : null;
    },
  });
  return {
    calls,
    client: {
      auction: model("auction"),
      offer: model("offer"),
      marketplaceListing: model("marketplaceListing"),
      marketplaceTransaction: model("marketplaceTransaction"),
    },
  };
}

test("material changes reject every protected commerce relationship", async (t) => {
  for (const relation of ["auction", "offer", "marketplaceListing", "marketplaceTransaction"]) {
    await t.test(relation, async () => {
      const { client } = commerceClient({ [relation]: true });
      await assert.rejects(
        assertCommerceSafe(client, { id: "item-1" }, { quantity: 2 }),
        (error) => error.statusCode === 409 && /auction, offer, reservation, purchase, or fulfillment/.test(error.message),
      );
    });
  }
});

test("commerce guard uses the complete protected status sets", async () => {
  const { client, calls } = commerceClient();
  await assertCommerceSafe(client, { id: "item-1" }, { availability: "UNAVAILABLE" });
  assert.deepEqual(calls.auction.where.status.in, ["SCHEDULED", "LIVE"]);
  assert.deepEqual(calls.offer.where.status.in, ["PENDING", "COUNTERED", "ACCEPTED"]);
  assert.deepEqual(calls.marketplaceListing.where.status.in, ["RESERVED", "SOLD"]);
  assert.deepEqual(calls.marketplaceTransaction.where.status.in, ["PENDING", "PAYMENT_PROCESSING", "PAID", "FULFILLING", "COMPLETED", "DISPUTED"]);
});

test("non-material descriptive changes do not query commerce records", async () => {
  const { client, calls } = commerceClient({ auction: true });
  await assertCommerceSafe(client, { id: "item-1" }, { description: "Corrected description" });
  assert.deepEqual(calls, {});
});

test("Super Admin routes have explicit role denial and shop-scoped support controls", async () => {
  const routes = await read("src/routes/superAdmin.routes.js");
  assert.match(routes, /router\.use\(authRequired, requireRole\(\.\.\.SUPER_ADMIN_ROLES\)\)/);
  assert.match(routes, /normalizeRole\(user\.role\) !== "SUPER_ADMIN"/);
  for (const path of ["support-sessions", "inventory", "inventory-locations"]) assert.match(routes, new RegExp(`/shops/:shopId/${path}`));
  const controller = await read("src/controllers/inventorySupport.controller.js");
  assert.match(controller, /id, shopId, actorId: actorId\(req\).*endedAt: null/);
  assert.match(controller, /id: itemId, pawnShopId: shopId/);
  assert.match(controller, /id: locationId, shopId, isArchived: false/);
});

test("audit, request correlation, owner notification, and immutable evidence are required", async () => {
  const controller = await read("src/controllers/inventorySupport.controller.js");
  assert.match(controller, /requestId: req\.requestId \|\| null/);
  assert.match(controller, /beforeState: safeItem\(before\), afterState: safeItem\(item\)/);
  assert.match(controller, /tx\.notification\.create/);
  assert.doesNotMatch(controller, /inventoryAdminEvent\.(update|delete|updateMany|deleteMany)/);
});

test("inventory-support migration is additive, unique, and schema-aligned", async () => {
  const migration = await read("prisma/migrations/20260813213000_super_admin_inventory_support_v1/migration.sql");
  const schema = await read("prisma/schema.prisma");
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE|DELETE\s+FROM|RENAME)\b/i);
  for (const model of ["InventoryLocation", "InventorySupportSession", "InventoryAdminEvent"]) {
    assert.equal((migration.match(new RegExp(`CREATE TABLE "${model}"`, "g")) || []).length, 1);
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(migration, /"quantity" INTEGER NOT NULL DEFAULT 1/);
  assert.match(migration, /"availability" "InventoryAvailability" NOT NULL DEFAULT 'AVAILABLE'/);
  assert.match(migration, /CHECK \("quantity" >= 0\)/);
  assert.match(schema, /quantity\s+Int\s+@default\(1\)/);
  assert.match(schema, /availability\s+InventoryAvailability\s+@default\(AVAILABLE\)/);
});

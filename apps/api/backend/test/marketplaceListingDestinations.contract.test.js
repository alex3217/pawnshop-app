import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("marketplace destination migration adds constrained indexed relations", async () => {
  const migration = await read("prisma/migrations/20260819190000_marketplace_listing_destinations/migration.sql");
  assert.match(migration, /ADD COLUMN "destinationUserId" TEXT/);
  assert.match(migration, /ADD COLUMN "destinationShopId" TEXT/);
  assert.match(migration, /MarketplaceListing_destination_type_check/);
  assert.match(migration, /destinationUserId_status_createdAt_idx/);
  assert.match(migration, /destinationShopId_status_createdAt_idx/);
});

test("directed listing routes require authentication and precede the id route", async () => {
  const routes = await read("src/routes/marketplaceListings.routes.js");
  for (const path of ["/destinations/customers", "/destinations/shops", "/received"]) {
    assert.match(routes, new RegExp(`router\\.get\\(\\"${path.replaceAll("/", "\\/")}\\", authRequired`));
  }
  assert.ok(routes.indexOf('"/received"') < routes.indexOf('"/:id"'));
  assert.match(routes, /router\.get\("\/:id", optionalAuth, getMarketplaceListing\)/);
});

test("listing controller validates targets and excludes directed listings from public discovery", async () => {
  const controller = await read("src/controllers/marketplaceListings.controller.js");
  assert.match(controller, /role: "CONSUMER", isActive: true, messageDiscoverable: true/);
  assert.match(controller, /isDeleted: false, isActive: true, isPublic: true/);
  assert.match(controller, /destinationUserId: null,\s+destinationShopId: null/);
  assert.match(controller, /canAccessDirectedListing/);
});

test("purchase reservation rejects a buyer outside the directed destination", async () => {
  const service = await read("src/services/marketplaceTransaction.service.js");
  assert.match(service, /listing\.destinationUserId !== buyer\.id/);
  assert.match(service, /listing\.destinationShopId !== buyerShop\?\.id/);
  assert.match(service, /LISTING_DESTINATION_FORBIDDEN/);
});

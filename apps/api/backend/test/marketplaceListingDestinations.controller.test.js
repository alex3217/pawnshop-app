import assert from "node:assert/strict";
import test from "node:test";
import { canAccessDirectedListing, resolveListingDestination } from "../src/controllers/marketplaceListings.controller.js";
import { assertListingCanBePurchased } from "../src/services/marketplaceTransaction.service.js";

const unused = { user: { findFirst: async () => null }, pawnShop: { findFirst: async () => null } };

test("public customer-to-customer listings need no destination", async () => {
  assert.deepEqual(await resolveListingDestination({ listingType: "CUSTOMER_TO_CUSTOMER", audience: "PUBLIC_MARKETPLACE", sellerUserId: "seller", prismaClient: unused }), { destinationUserId: null, destinationShopId: null });
});

test("specific customer resolves a public identifier without accepting an internal id", async () => {
  let where;
  const prismaClient = { ...unused, user: { findFirst: async (query) => { where = query.where; return { id: "internal-user-id" }; } } };
  assert.deepEqual(await resolveListingDestination({ listingType: "CUSTOMER_TO_CUSTOMER", audience: "SPECIFIC_CUSTOMER", destinationCustomerReference: "@public_buyer", sellerUserId: "seller", prismaClient }), { destinationUserId: "internal-user-id", destinationShopId: null });
  assert.equal(where.publicMessageIdentifier, "public_buyer");
  assert.deepEqual(where.id, { not: "seller" });
});

test("customer and shop destination conflicts fail closed", async () => {
  await assert.rejects(resolveListingDestination({ listingType: "CUSTOMER_TO_CUSTOMER", audience: "PUBLIC_MARKETPLACE", destinationShopId: "shop", sellerUserId: "seller", prismaClient: unused }), /cannot include a destination/);
  await assert.rejects(resolveListingDestination({ listingType: "CUSTOMER_TO_CUSTOMER", audience: "SPECIFIC_CUSTOMER", destinationCustomerReference: "buyer", destinationShopId: "shop", sellerUserId: "seller", prismaClient: unused }), /cannot include a shop/);
  await assert.rejects(resolveListingDestination({ listingType: "CUSTOMER_TO_SHOP", destinationShopId: "shop", destinationCustomerReference: "buyer", sellerUserId: "seller", prismaClient: unused }), /cannot include a customer/);
});

test("inactive or undiscoverable customer and unavailable shop are rejected", async () => {
  await assert.rejects(resolveListingDestination({ listingType: "CUSTOMER_TO_CUSTOMER", audience: "SPECIFIC_CUSTOMER", destinationCustomerReference: "inactive", sellerUserId: "seller", prismaClient: unused }), /unavailable/);
  let shopWhere;
  const prismaClient = { ...unused, pawnShop: { findFirst: async (query) => { shopWhere = query.where; return null; } } };
  await assert.rejects(resolveListingDestination({ listingType: "CUSTOMER_TO_SHOP", destinationShopId: "inactive-shop", sellerUserId: "seller", prismaClient }), /unavailable/);
  assert.deepEqual(shopWhere.owner, { isActive: true });
  assert.equal(shopWhere.isActive, true);
  assert.equal(shopWhere.isPublic, true);
  assert.equal(shopWhere.isDeleted, false);
});

test("owner and authorized active staff can access a shop-directed listing while strangers cannot", async () => {
  const listing = { sellerUserId: "seller", destinationUserId: null, destinationShopId: "shop-1" };
  const authorizedScope = async () => ({ unrestricted: false, shopIds: ["shop-1"] });
  const deniedScope = async () => ({ unrestricted: false, shopIds: [] });
  assert.equal(await canAccessDirectedListing(listing, { sub: "owner", role: "OWNER" }, authorizedScope), true);
  assert.equal(await canAccessDirectedListing(listing, { sub: "staff", role: "CONSUMER" }, authorizedScope), true);
  assert.equal(await canAccessDirectedListing(listing, { sub: "stranger", role: "CONSUMER" }, deniedScope), false);
  assert.equal(await canAccessDirectedListing(listing, null, deniedScope), false);
});

test("purchase validation rejects non-recipients without leaking the intended recipient", () => {
  const base = { status: "ACTIVE", sellerUserId: "seller", sellerShop: null, sellerShopId: null, quantity: 1, price: "10.00", expiresAt: null };
  assert.throws(() => assertListingCanBePurchased({ listing: { ...base, destinationUserId: "recipient", destinationShopId: null }, buyer: { id: "stranger" }, buyerShop: null, quantity: 1 }), (error) => error.statusCode === 403 && error.code === "LISTING_DESTINATION_FORBIDDEN" && !error.message.includes("recipient"));
  assert.throws(() => assertListingCanBePurchased({ listing: { ...base, destinationUserId: null, destinationShopId: "shop-1" }, buyer: { id: "staff" }, buyerShop: { id: "shop-2" }, quantity: 1 }), (error) => error.statusCode === 403 && error.code === "LISTING_DESTINATION_FORBIDDEN" && !error.message.includes("shop-1"));
});

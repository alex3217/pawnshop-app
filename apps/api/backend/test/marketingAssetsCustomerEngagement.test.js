import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { destinationPath } from "../src/controllers/shopMarketing.controller.js";
import { getMarketingTemplateAccess } from "../src/services/sellerPlan.service.js";
import { followShop, serializeShopFollow, unfollowShop, updateShopFollowPreferences } from "../src/services/shopFollow.service.js";
import { recordReferralAttribution } from "../src/services/customerEngagement.service.js";

const entitlements = (effectivePlan) => ({ subscription: { effectivePlan } });

test("seller plans centrally gate printable templates without changing internal plan codes", () => {
  assert.equal(getMarketingTemplateAccess(entitlements("FREE"), "STOREFRONT_POSTER").allowed, true);
  assert.equal(getMarketingTemplateAccess(entitlements("FREE"), "PRODUCT_DISPLAY_CARD").allowed, false);
  assert.equal(getMarketingTemplateAccess(entitlements("PRO"), "PRODUCT_DISPLAY_CARD").allowed, true);
  assert.equal(getMarketingTemplateAccess(entitlements("PREMIUM"), "REVIEW_REQUEST_CARD").allowed, true);
  assert.equal(getMarketingTemplateAccess(entitlements("ULTRA"), "WINDOW_24_7_POSTER").allowed, true);
});

test("existing QR destination mapping remains internal and shop/item specific", () => {
  assert.equal(destinationPath({ destinationType: "STOREFRONT", resourceId: null, shop: { id: "shop-a", slug: "safe-shop" } }), "/shops/safe-shop");
  assert.equal(destinationPath({ destinationType: "ITEM", resourceId: "item-a", shop: { id: "shop-a", slug: "safe-shop" } }), "/items/item-a");
  assert.equal(destinationPath({ destinationType: "FOLLOW_SHOP", resourceId: null, shop: { id: "shop-a", slug: "safe-shop" } }), "/shops/safe-shop?action=follow");
});

function followPrisma(existing = null) {
  const state = { row: existing, upserts: 0, updates: 0 };
  return { state, pawnShop: { findFirst: async () => ({ id: "shop-a", name: "Shop A", slug: "shop-a" }) }, shopFollow: {
    findUnique: async () => state.row,
    upsert: async ({ create, update }) => { state.upserts += 1; state.row = state.row ? { ...state.row, ...update } : { id: "follow-a", status: "FOLLOWING", pausedAt: null, newArrivalNotifications: false, dealNotifications: false, auctionNotifications: false, generalShopNotifications: false, ...create }; return state.row; },
    update: async ({ data }) => { state.updates += 1; state.row = { ...state.row, ...data }; return state.row; },
  } };
}

test("follow is idempotent and marketing preferences default off", async () => {
  const fake = followPrisma();
  const first = await followShop("buyer-a", "shop-a", fake);
  const second = await followShop("buyer-a", "shop-a", fake);
  assert.equal(fake.state.upserts, 2);
  assert.equal(first.id, second.id);
  assert.deepEqual(serializeShopFollow(second).preferences, { newArrivals: false, deals: false, auctions: false, general: false });
});

test("preferences require explicit changes; pause and unfollow preserve transactional notification scope", async () => {
  const fake = followPrisma({ id: "follow-a", userId: "buyer-a", shopId: "shop-a", status: "FOLLOWING", pausedAt: null, newArrivalNotifications: false, dealNotifications: false, auctionNotifications: false, generalShopNotifications: false });
  const optedIn = await updateShopFollowPreferences("buyer-a", "shop-a", { newArrivals: true, paused: true }, fake);
  assert.equal(optedIn.newArrivalNotifications, true); assert.ok(optedIn.pausedAt);
  const removed = await unfollowShop("buyer-a", "shop-a", fake);
  assert.equal(removed.status, "UNFOLLOWED"); assert.equal(removed.newArrivalNotifications, false);
  assert.equal(Object.hasOwn(removed, "transactionalNotifications"), false);
});

test("inactive shop follows are rejected", async () => {
  const fake = followPrisma(); fake.pawnShop.findFirst = async () => null;
  await assert.rejects(() => followShop("buyer-a", "shop-a", fake), /Active public shop/);
});

test("referrals reject self-attribution and duplicate conversions use one idempotency key", async () => {
  let creates = 0;
  const fake = { referralCode: { findUnique: async () => ({ id: "ref-a", ownerUserId: null, shop: { ownerId: "owner-a" }, isActive: true }) }, referralAttribution: { upsert: async ({ where, create }) => { creates += 1; return { id: "event-a", eventKey: where.eventKey, ...create }; } } };
  await assert.rejects(() => recordReferralAttribution({ code: "code", attributedUserId: "owner-a", eventType: "REGISTRATION_COMPLETED", eventKey: "same" }, fake), /Self-referral/);
  const one = await recordReferralAttribution({ code: "code", attributedUserId: "buyer-a", eventType: "REGISTRATION_COMPLETED", eventKey: "same" }, fake);
  const two = await recordReferralAttribution({ code: "code", attributedUserId: "buyer-a", eventType: "REGISTRATION_COMPLETED", eventKey: "same" }, fake);
  assert.equal(one.eventKey, two.eventKey); assert.equal(creates, 2);
});

test("route contracts enforce shop authorization, aggregate privacy, PDF headers, and audited admin disabling", async () => {
  const [assetsRoute, assetController, assetService, engagement, adminService, adminRoutes] = await Promise.all([
    readFile(new URL("../src/routes/marketingAssets.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/controllers/marketingAssets.controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/marketingAssets.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/customerEngagement.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/marketingAdministration.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/superAdmin.routes.js", import.meta.url), "utf8"),
  ]);
  assert.match(assetsRoute, /requireOwnerAdminOrStaffPermission\("marketing:read"\)/);
  assert.match(assetController, /application\/pdf/); assert.match(assetController, /Content-Disposition/); assert.match(assetController, /private, no-store/);
  assert.match(assetService, /pawnShopId: shopId, isDeleted: false, status: "AVAILABLE"/); assert.match(assetService, /campaign\.resourceId !== item\.id/);
  assert.match(engagement, /buyerContactsIncluded: false/);
  assert.match(adminRoutes, /requireRole\(\.\.\.SUPER_ADMIN_ROLES\)/); assert.match(adminService, /DISABLE_MARKETING_CAMPAIGN/); assert.match(adminService, /reason/); assert.match(adminService, /superAdminAuditLog\.create/);
});

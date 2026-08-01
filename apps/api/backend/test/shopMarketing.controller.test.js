import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/lib/prisma.js";
import {
  createShopMarketingCampaign,
  destinationPath,
  listShopMarketingCampaigns,
  redirectMarketingCampaign,
  shopMarketingSchemas,
  updateShopMarketingCampaign,
} from "../src/controllers/shopMarketing.controller.js";
import { SHOP_PERMISSION_CODES } from "../src/config/shopPermissions.js";

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    redirect(code, location) { this.statusCode = code; this.headers.Location = location; return this; },
  };
}

function ownerRequest(shopId, body = {}) {
  return { params: { shopId }, body, user: { sub: "owner-1", role: "OWNER" } };
}

test("marketing permission codes are assignable", () => {
  assert.ok(SHOP_PERMISSION_CODES.includes("marketing:read"));
  assert.ok(SHOP_PERMISSION_CODES.includes("marketing:write"));
});

test("campaign validation rejects unknown fields and missing resource identifiers", () => {
  assert.equal(shopMarketingSchemas.campaignSchema.safeParse({ name: "Door", destinationType: "EXTERNAL_URL" }).success, false);
  assert.equal(shopMarketingSchemas.campaignSchema.safeParse({ name: "Door", destinationType: "STOREFRONT", url: "https://example.test" }).success, false);
});

test("owner cannot update a campaign belonging to another shop", async () => {
  const originalShop = prisma.pawnShop.findFirst;
  prisma.pawnShop.findFirst = async () => null;
  try {
    const res = response();
    await updateShopMarketingCampaign(ownerRequest("shop-other", { isActive: false }), res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, "Shop not found");
  } finally { prisma.pawnShop.findFirst = originalShop; }
});

test("staff read access is shop-scoped", async () => {
  const originals = {
    shop: prisma.pawnShop.findFirst,
    defaultCampaign: prisma.shopMarketingCampaign.findFirst,
    campaigns: prisma.shopMarketingCampaign.findMany,
  };
  prisma.pawnShop.findFirst = async ({ where }) => where.id === "shop-1"
    ? { id: "shop-1", name: "Loop Pawn", slug: "loop-pawn", ownerId: "owner-1", subscriptionStatus: "ACTIVE" }
    : null;
  prisma.shopMarketingCampaign.findFirst = async () => ({ id: "default-1", shopId: "shop-1", isDefault: true });
  prisma.shopMarketingCampaign.findMany = async () => [];
  const req = {
    params: { shopId: "shop-1" },
    user: { sub: "staff-1", role: "CONSUMER" },
    staffAccess: {
      canAccessShop(permission, shopId) { return permission === "marketing:read" && shopId === "shop-1"; },
    },
  };
  try {
    const allowed = response();
    await listShopMarketingCampaigns(req, allowed);
    assert.equal(allowed.statusCode, 200);
    const denied = response();
    await listShopMarketingCampaigns({ ...req, params: { shopId: "shop-2" } }, denied);
    assert.equal(denied.statusCode, 404);
  } finally {
    prisma.pawnShop.findFirst = originals.shop;
    prisma.shopMarketingCampaign.findFirst = originals.defaultCampaign;
    prisma.shopMarketingCampaign.findMany = originals.campaigns;
  }
});

test("specific item campaigns require an available item owned by the selected shop", async () => {
  const originals = {
    shop: prisma.pawnShop.findFirst,
    planShop: prisma.pawnShop.findUnique,
    item: prisma.item.findFirst,
    itemCount: prisma.item.count,
    create: prisma.shopMarketingCampaign.create,
    campaignFind: prisma.shopMarketingCampaign.findFirst,
    campaignCount: prisma.shopMarketingCampaign.count,
    transaction: prisma.$transaction,
  };
  prisma.pawnShop.findFirst = async () => ({ id: "shop-1", name: "Loop Pawn", slug: "loop-pawn", ownerId: "owner-1", subscriptionStatus: "ACTIVE" });
  prisma.item.findFirst = async ({ where }) => where.id === "item-1" && where.pawnShopId === "shop-1" ? { id: "item-1" } : null;
  prisma.pawnShop.findUnique = async () => ({ id: "shop-1", name: "Loop Pawn", ownerId: "owner-1", isDeleted: false, subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE", subscriptionCurrentPeriodEnd: null, cancelAtPeriodEnd: false, stripeCustomerId: null, stripeSubscriptionId: null });
  prisma.item.count = async () => 1;
  prisma.shopMarketingCampaign.count = async () => 0;
  prisma.$transaction = async (operations) => Promise.all(operations);
  prisma.shopMarketingCampaign.create = async ({ data }) => ({ id: "campaign-1", createdAt: new Date(), updatedAt: new Date(), ...data });
  prisma.shopMarketingCampaign.findFirst = async ({ where }) => where.isDefault ? { id: "default-1", shopId: "shop-1", isDefault: true } : null;
  try {
    const valid = response();
    await createShopMarketingCampaign(ownerRequest("shop-1", { name: "Featured", destinationType: "ITEM", resourceId: "item-1" }), valid);
    assert.equal(valid.statusCode, 201);
    const otherShopItem = response();
    await createShopMarketingCampaign(ownerRequest("shop-1", { name: "Not ours", destinationType: "ITEM", resourceId: "item-2" }), otherShopItem);
    assert.equal(otherShopItem.statusCode, 400);
  } finally {
    prisma.pawnShop.findFirst = originals.shop;
    prisma.pawnShop.findUnique = originals.planShop;
    prisma.item.findFirst = originals.item;
    prisma.item.count = originals.itemCount;
    prisma.shopMarketingCampaign.create = originals.create;
    prisma.shopMarketingCampaign.findFirst = originals.campaignFind;
    prisma.shopMarketingCampaign.count = originals.campaignCount;
    prisma.$transaction = originals.transaction;
  }
});

test("public redirect is internal, records privacy-conscious analytics, and stores no IP", async () => {
  const originals = {
    find: prisma.shopMarketingCampaign.findUnique,
    scan: prisma.shopMarketingCampaignScan.create,
  };
  let scanData;
  prisma.shopMarketingCampaign.findUnique = async () => ({
    id: "campaign-1", shopId: "shop-1", shortCode: "safe-code", destinationType: "STOREFRONT",
    resourceId: null, isActive: true,
    shop: { id: "shop-1", slug: "loop-pawn", isDeleted: false, subscriptionStatus: "ACTIVE" },
  });
  prisma.shopMarketingCampaignScan.create = async ({ data }) => { scanData = data; return { id: "scan-1", ...data }; };
  try {
    const res = response();
    await redirectMarketingCampaign({
      params: { shortCode: "safe-code" }, ip: "203.0.113.10", socket: {},
      get(name) { return name === "referer" ? "https://social.example/post/1" : "Mobile Safari"; },
    }, res);
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, "/shops/loop-pawn");
    assert.equal(scanData.referrerHost, "social.example");
    assert.equal(scanData.userAgentClass, "MOBILE");
    assert.equal(Object.hasOwn(scanData, "ipAddress"), false);
    assert.equal(Object.hasOwn(scanData, "ipHash"), false);
  } finally {
    prisma.shopMarketingCampaign.findUnique = originals.find;
    prisma.shopMarketingCampaignScan.create = originals.scan;
  }
});

test("disabled and inactive-shop campaigns do not redirect", async () => {
  const original = prisma.shopMarketingCampaign.findUnique;
  try {
    prisma.shopMarketingCampaign.findUnique = async () => ({ isActive: false, shop: { isDeleted: false, subscriptionStatus: "ACTIVE" } });
    const disabled = response();
    await redirectMarketingCampaign({ params: { shortCode: "disabled" } }, disabled);
    assert.equal(disabled.statusCode, 404);
    prisma.shopMarketingCampaign.findUnique = async () => ({ isActive: true, shop: { isDeleted: false, subscriptionStatus: "INACTIVE" } });
    const inactive = response();
    await redirectMarketingCampaign({ params: { shortCode: "inactive" } }, inactive);
    assert.equal(inactive.statusCode, 404);
  } finally { prisma.shopMarketingCampaign.findUnique = original; }
});

test("destination mapping cannot create an external redirect", () => {
  const campaign = { destinationType: "UNKNOWN", resourceId: "https://evil.example", shop: { id: "shop-1", slug: "loop-pawn" } };
  assert.equal(destinationPath(campaign), "/shops/loop-pawn");
  assert.equal(destinationPath({ ...campaign, destinationType: "ITEM", resourceId: "item-1" }), "/items/item-1");
});

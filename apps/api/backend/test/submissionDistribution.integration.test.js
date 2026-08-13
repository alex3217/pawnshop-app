import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { assertTargetShopAccess, distributeSubmission, searchDistributionShops } from "../src/services/submissionDistribution.service.js";
import { acceptSubmissionOffer } from "../src/services/customerSellTransaction.service.js";
import { reserveMarketplacePurchase } from "../src/services/marketplaceTransaction.service.js";

const prisma = new PrismaClient();
const run = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
async function user(label, role = "CONSUMER") { return prisma.user.create({ data: { name: label, email: `${label}-${run}@example.test`, password: "test-password", role } }); }
async function shop(ownerId, index, extra = {}) { return prisma.pawnShop.create({ data: { name: `Target Shop ${index} ${run}`, ownerId, address: `${index} Main St`, city: "Austin", state: "TX", zip: `787${String(index).padStart(2, "0")}`, latitude: 30.2672 + index / 1000, longitude: -97.7431, subscriptionStatus: "ACTIVE", ...extra } }); }
async function submission(buyerId, label = "Camera") { return prisma.buyerItemSubmission.create({ data: { buyerId, title: `${label} ${run}`, category: "Electronics", condition: "Good", images: ["https://assets.example.test/photo.jpg"], estimatedValue: "200.00", intent: "BOTH" } }); }

test("one-shop targeting creates one durable target, private conversation, notification, and audit", async () => {
  const seller = await user("seller-one"); const owner = await user("owner-one", "OWNER"); const targetShop = await shop(owner.id, 1); const item = await submission(seller.id);
  const result = await distributeSubmission({ submissionId: item.id, sellerId: seller.id, mode: "ONE_SHOP", shopIds: [targetShop.id], idempotencyKey: `one:${run}` });
  assert.equal(result.targets.length, 1); assert.equal(result.targets[0].status, "DELIVERED");
  assert.equal(await prisma.buyerItemSubmissionConversation.count({ where: { submissionId: item.id, shopId: targetShop.id } }), 1);
  assert.equal(await prisma.notification.count({ where: { dedupeKey: `submission-target:${result.targets[0].id}` } }), 1);
  assert.equal(await prisma.buyerItemSubmissionAuditEvent.count({ where: { submissionId: item.id } }), 2);
});

test("multi-shop selection rejects duplicates, inactive/deleted shops, and the configurable limit", async () => {
  const seller = await user("seller-guards"); const owner = await user("owner-guards", "OWNER"); const active = await shop(owner.id, 2); const inactive = await shop(owner.id, 3, { subscriptionStatus: "CANCELED" }); const deleted = await shop(owner.id, 4, { isDeleted: true });
  await assert.rejects(async () => distributeSubmission({ submissionId: (await submission(seller.id, "duplicate")).id, sellerId: seller.id, mode: "SELECTED_SHOPS", shopIds: [active.id, active.id] }), (error) => error.code === "DUPLICATE_TARGET_SHOP");
  for (const invalid of [inactive, deleted]) await assert.rejects(async () => distributeSubmission({ submissionId: (await submission(seller.id, `invalid-${invalid.id}`)).id, sellerId: seller.id, mode: "ONE_SHOP", shopIds: [invalid.id] }), (error) => error.code === "TARGET_SHOP_INVALID");
  await prisma.platformSetting.upsert({ where: { key: "seller_distribution_max_selected_shops" }, create: { key: "seller_distribution_max_selected_shops", value: "1" }, update: { value: "1" } });
  const second = await shop(owner.id, 5);
  await assert.rejects(async () => distributeSubmission({ submissionId: (await submission(seller.id, "limit")).id, sellerId: seller.id, mode: "SELECTED_SHOPS", shopIds: [active.id, second.id] }), (error) => error.code === "TARGET_SHOP_LIMIT_EXCEEDED");
  await prisma.platformSetting.update({ where: { key: "seller_distribution_max_selected_shops" }, data: { value: "10" } });
});

test("nearby targeting uses radius and shop search returns distance/location", async () => {
  const seller = await user("seller-nearby"); const owner = await user("owner-nearby", "OWNER"); const near = await shop(owner.id, 6, { latitude: 0.001, longitude: 0.001 }); await shop(owner.id, 7, { latitude: 34.0522, longitude: -118.2437 });
  const item = await submission(seller.id, "nearby"); const result = await distributeSubmission({ submissionId: item.id, sellerId: seller.id, mode: "NEARBY_SHOPS", radiusMiles: 10, latitude: 0, longitude: 0 });
  assert(result.targets.some((target) => target.shopId === near.id));
  const matches = await searchDistributionShops({ query: near.name, latitude: 0, longitude: 0 }); assert.equal(matches.length, 1); assert.equal(typeof matches[0].distanceMiles, "number");
});

test("marketplace-only and combined distribution enforce photo, price, quantity, and fulfillment guards", async () => {
  const seller = await user("seller-market"); const owner = await user("owner-market", "OWNER"); const targetShop = await shop(owner.id, 8);
  const cases = [
    [{ price: 0, quantity: 1, pickupAvailable: true }, "MARKETPLACE_PRICE_REQUIRED"],
    [{ price: 100, quantity: 2, pickupAvailable: true }, "MARKETPLACE_QUANTITY_REQUIRED"],
    [{ price: 100, quantity: 1, pickupAvailable: false, shippingAvailable: false }, "MARKETPLACE_FULFILLMENT_REQUIRED"],
  ];
  for (const [marketplace, code] of cases) await assert.rejects(async () => distributeSubmission({ submissionId: (await submission(seller.id, `guard-${code}`)).id, sellerId: seller.id, mode: "MARKETPLACE", marketplace }), (error) => error.code === code);
  const noPhoto = await prisma.buyerItemSubmission.create({ data: { buyerId: seller.id, title: "No photo", category: "Other", condition: "Good", images: [], intent: "MARKETPLACE_LISTING" } });
  await assert.rejects(() => distributeSubmission({ submissionId: noPhoto.id, sellerId: seller.id, mode: "MARKETPLACE", marketplace: { price: 10, quantity: 1, pickupAvailable: true } }), (error) => error.code === "MARKETPLACE_PHOTOS_REQUIRED");
  const market = await distributeSubmission({ submissionId: (await submission(seller.id, "market-only")).id, sellerId: seller.id, mode: "MARKETPLACE", marketplace: { price: 100, quantity: 1, pickupAvailable: true } }); assert.equal(market.marketplaceListing.status, "DRAFT"); assert.equal(market.targets.length, 0);
  const combined = await distributeSubmission({ submissionId: (await submission(seller.id, "combined")).id, sellerId: seller.id, mode: "SELECTED_SHOPS_AND_MARKETPLACE", shopIds: [targetShop.id], marketplace: { price: 100, quantity: 1, pickupAvailable: true } }); assert.equal(combined.targets.length, 1); assert(combined.marketplaceListingId);
});

test("seller ownership and cross-shop target authorization are query scoped", async () => {
  const seller = await user("seller-private"); const stranger = await user("stranger-private"); const ownerA = await user("owner-a", "OWNER"); const ownerB = await user("owner-b", "OWNER"); const shopA = await shop(ownerA.id, 9); const shopB = await shop(ownerB.id, 10); const item = await submission(seller.id, "private");
  await assert.rejects(() => distributeSubmission({ submissionId: item.id, sellerId: stranger.id, mode: "ONE_SHOP", shopIds: [shopA.id] }), (error) => error.code === "SUBMISSION_NOT_FOUND");
  await distributeSubmission({ submissionId: item.id, sellerId: seller.id, mode: "ONE_SHOP", shopIds: [shopA.id] });
  await assert.rejects(() => assertTargetShopAccess({ user: { sub: ownerB.id, role: "OWNER" }, submissionId: item.id, shopId: shopB.id }), (error) => [403, 404].includes(error.statusCode));
  const access = await assertTargetShopAccess({ user: { sub: ownerA.id, role: "OWNER" }, submissionId: item.id, shopId: shopA.id }); assert.equal(access.shopId, shopA.id);
});

test("pawnshop offer acceptance is idempotent, closes competing offers/targets, and removes marketplace availability", async () => {
  const seller = await user("seller-accept"); const ownerA = await user("accept-a", "OWNER"); const ownerB = await user("accept-b", "OWNER"); const shopA = await shop(ownerA.id, 11); const shopB = await shop(ownerB.id, 12); const item = await submission(seller.id, "accept");
  const distributed = await distributeSubmission({ submissionId: item.id, sellerId: seller.id, mode: "SELECTED_SHOPS_AND_MARKETPLACE", shopIds: [shopA.id, shopB.id], marketplace: { price: 250, quantity: 1, pickupAvailable: true } });
  const [winning, competing] = await Promise.all([
    prisma.buyerItemSubmissionOffer.create({ data: { submissionId: item.id, shopId: shopA.id, ownerId: ownerA.id, amount: "180.00" } }),
    prisma.buyerItemSubmissionOffer.create({ data: { submissionId: item.id, shopId: shopB.id, ownerId: ownerB.id, amount: "175.00" } }),
  ]);
  await prisma.buyerItemSubmission.update({ where: { id: item.id }, data: { status: "OFFERED" } });
  const first = await acceptSubmissionOffer({ offerId: winning.id, customerId: seller.id }); const replay = await acceptSubmissionOffer({ offerId: winning.id, customerId: seller.id });
  assert.equal(first.offer.status, "ACCEPTED"); assert.equal(replay.reused, true);
  assert.equal((await prisma.buyerItemSubmissionOffer.findUnique({ where: { id: competing.id } })).status, "REJECTED");
  assert.equal(await prisma.buyerItemSubmissionTarget.count({ where: { submissionId: item.id, status: "CLOSED" } }), 2);
  assert.equal((await prisma.marketplaceListing.findUnique({ where: { id: distributed.marketplaceListingId } })).status, "CANCELED");
});

test("simultaneous competing pawnshop acceptances select exactly one winner", async () => {
  const seller = await user("seller-race"); const ownerA = await user("race-a", "OWNER"); const ownerB = await user("race-b", "OWNER"); const shopA = await shop(ownerA.id, 13); const shopB = await shop(ownerB.id, 14); const item = await submission(seller.id, "race");
  await distributeSubmission({ submissionId: item.id, sellerId: seller.id, mode: "SELECTED_SHOPS", shopIds: [shopA.id, shopB.id] });
  const offers = await Promise.all([[shopA, ownerA], [shopB, ownerB]].map(([targetShop, owner]) => prisma.buyerItemSubmissionOffer.create({ data: { submissionId: item.id, shopId: targetShop.id, ownerId: owner.id, amount: "150.00" } })));
  await prisma.buyerItemSubmission.update({ where: { id: item.id }, data: { status: "OFFERED" } });
  const outcomes = await Promise.allSettled(offers.map((offer) => acceptSubmissionOffer({ offerId: offer.id, customerId: seller.id })));
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(await prisma.buyerItemSubmissionOffer.count({ where: { submissionId: item.id, status: "ACCEPTED" } }), 1);
});

test("marketplace reservation winning first closes shop targets and blocks later shop-offer acceptance", async () => {
  const seller = await user("seller-market-win"); const marketBuyer = await user("market-buyer"); const owner = await user("market-win-owner", "OWNER"); const targetShop = await shop(owner.id, 15); const item = await submission(seller.id, "market-win");
  const distributed = await distributeSubmission({ submissionId: item.id, sellerId: seller.id, mode: "SELECTED_SHOPS_AND_MARKETPLACE", shopIds: [targetShop.id], marketplace: { price: 225, quantity: 1, pickupAvailable: true } });
  const offer = await prisma.buyerItemSubmissionOffer.create({ data: { submissionId: item.id, shopId: targetShop.id, ownerId: owner.id, amount: "170.00" } });
  await prisma.buyerItemSubmission.update({ where: { id: item.id }, data: { status: "OFFERED" } }); await prisma.marketplaceListing.update({ where: { id: distributed.marketplaceListingId }, data: { status: "ACTIVE", publishedAt: new Date() } });
  await reserveMarketplacePurchase({ listingId: distributed.marketplaceListingId, buyerUserId: marketBuyer.id, quantity: 1 });
  assert.equal((await prisma.buyerItemSubmissionTarget.findFirst({ where: { submissionId: item.id } })).status, "CLOSED"); assert.equal((await prisma.buyerItemSubmissionOffer.findUnique({ where: { id: offer.id } })).status, "REJECTED");
  await assert.rejects(() => acceptSubmissionOffer({ offerId: offer.id, customerId: seller.id }), (error) => ["SUBMISSION_OFFER_ALREADY_ACCEPTED", "SUBMISSION_OFFER_SUBMISSION_NOT_ACCEPTABLE", "SUBMISSION_OFFER_NOT_PENDING"].includes(error.code));
});

test.after(async () => { await prisma.$disconnect(); });

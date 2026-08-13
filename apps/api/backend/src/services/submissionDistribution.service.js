import { prisma } from "../lib/prisma.js";
import { assertShopPermission } from "./shopAccess.service.js";

export const DISTRIBUTION_MODES = new Set([
  "ONE_SHOP", "SELECTED_SHOPS", "NEARBY_SHOPS", "MARKETPLACE",
  "SELECTED_SHOPS_AND_MARKETPLACE", "NEARBY_SHOPS_AND_MARKETPLACE",
]);
const SHOP_MODES = new Set(["ONE_SHOP", "SELECTED_SHOPS", "NEARBY_SHOPS", "SELECTED_SHOPS_AND_MARKETPLACE", "NEARBY_SHOPS_AND_MARKETPLACE"]);
const MARKETPLACE_MODES = new Set(["MARKETPLACE", "SELECTED_SHOPS_AND_MARKETPLACE", "NEARBY_SHOPS_AND_MARKETPLACE"]);
const NEARBY_MODES = new Set(["NEARBY_SHOPS", "NEARBY_SHOPS_AND_MARKETPLACE"]);
const DEFAULT_SELECTED_SHOP_LIMIT = 10;

function problem(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}
function text(value) { return String(value ?? "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function radians(value) { return Number(value) * Math.PI / 180; }
function distanceMiles(aLat, aLon, bLat, bLon) {
  const dLat = radians(bLat - aLat); const dLon = radians(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function publicShopWhere() { return { isDeleted: false, subscriptionStatus: "ACTIVE" }; }
const SHOP_SELECT = { id: true, name: true, address: true, city: true, state: true, zip: true, latitude: true, longitude: true, phone: true, description: true, ownerId: true };

export async function selectedShopLimit(client = prisma) {
  const row = await client.platformSetting.findUnique({ where: { key: "seller_distribution_max_selected_shops" }, select: { value: true } });
  const parsed = Number.parseInt(row?.value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : DEFAULT_SELECTED_SHOP_LIMIT;
}

export async function searchDistributionShops({ query, latitude, longitude, maxDistanceMiles, take = 50 }) {
  const needle = text(query);
  const shops = await prisma.pawnShop.findMany({
    where: { ...publicShopWhere(), ...(needle ? { OR: ["name", "address", "city", "state", "zip", "description"].map((field) => ({ [field]: { contains: needle, mode: "insensitive" } })) } : {}) },
    select: SHOP_SELECT,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(Number(take) || 50, 1), 100),
  });
  const hasOrigin = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  return shops.map((shop) => ({ ...shop, distanceMiles: hasOrigin && shop.latitude != null && shop.longitude != null ? Number(distanceMiles(Number(latitude), Number(longitude), shop.latitude, shop.longitude).toFixed(1)) : null }))
    .filter((shop) => !Number.isFinite(Number(maxDistanceMiles)) || shop.distanceMiles == null || shop.distanceMiles <= Number(maxDistanceMiles))
    .sort((a, b) => a.distanceMiles == null ? 1 : b.distanceMiles == null ? -1 : a.distanceMiles - b.distanceMiles);
}

function marketplaceInput(input, submission) {
  const price = Number(input?.price); const quantity = Number(input?.quantity);
  const pickupAvailable = input?.pickupAvailable === true; const shippingAvailable = input?.shippingAvailable === true;
  if (!submission.images?.length) throw problem(422, "MARKETPLACE_PHOTOS_REQUIRED", "Marketplace distribution requires at least one durable photo.");
  if (!Number.isFinite(price) || price <= 0) throw problem(422, "MARKETPLACE_PRICE_REQUIRED", "Marketplace distribution requires a positive price.");
  if (quantity !== 1) throw problem(422, "MARKETPLACE_QUANTITY_REQUIRED", "A distributed physical item must have quantity 1.");
  if (!pickupAvailable && !shippingAvailable) throw problem(422, "MARKETPLACE_FULFILLMENT_REQUIRED", "Marketplace distribution requires pickup or shipping fulfillment.");
  return { sellerUserId: submission.buyerId, listingType: "CUSTOMER_TO_CUSTOMER", status: "DRAFT", title: submission.title, description: submission.description, category: submission.category, condition: submission.condition, price: price.toFixed(2), quantity, images: submission.images, pickupAvailable, shippingAvailable, allowOffers: input?.allowOffers !== false, expiresAt: input?.expiresAt ? new Date(input.expiresAt) : undefined, metadata: { source: "SELLER_TARGETED_SHOP_OFFERS_V1", submissionId: submission.id } };
}

async function notify(tx, data) {
  if (!tx.notification) return;
  await tx.notification.upsert({ where: { dedupeKey: data.dedupeKey }, create: data, update: {} });
}
async function audit(tx, data) {
  if (!tx.buyerItemSubmissionAuditEvent) return;
  await tx.buyerItemSubmissionAuditEvent.upsert({ where: { idempotencyKey: data.idempotencyKey }, create: data, update: {} });
}

export async function distributeSubmission({ submissionId, sellerId, mode, shopIds = [], radiusMiles, latitude, longitude, marketplace, expiresAt, idempotencyKey }) {
  const distributionMode = upper(mode);
  if (!DISTRIBUTION_MODES.has(distributionMode)) throw problem(400, "DISTRIBUTION_MODE_REQUIRED", "Choose how to offer your item before distributing it.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BuyerItemSubmission" WHERE id = ${submissionId} FOR UPDATE`;
    const submission = await tx.buyerItemSubmission.findFirst({ where: { id: submissionId, buyerId: sellerId } });
    if (!submission) throw problem(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
    if (submission.distributionMode) {
      if (idempotencyKey) {
        const prior = await tx.buyerItemSubmissionAuditEvent.findUnique({ where: { idempotencyKey } });
        if (prior) return tx.buyerItemSubmission.findUnique({ where: { id: submissionId }, include: { targets: { include: { shop: { select: SHOP_SELECT } } }, marketplaceListing: true } });
      }
      throw problem(409, "SUBMISSION_ALREADY_DISTRIBUTED", "This submission has already been distributed.");
    }
    const rawShopIds = shopIds.map(text).filter(Boolean);
    if (new Set(rawShopIds).size !== rawShopIds.length) throw problem(409, "DUPLICATE_TARGET_SHOP", "A pawnshop may only be selected once.");
    let requestedIds = [...rawShopIds];
    if (SHOP_MODES.has(distributionMode)) {
      if (NEARBY_MODES.has(distributionMode)) {
        const radius = Number(radiusMiles);
        if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) throw problem(400, "TARGETING_LOCATION_REQUIRED", "Nearby distribution requires a valid radius and seller coordinates.");
        const candidates = await tx.pawnShop.findMany({ where: { ...publicShopWhere(), latitude: { not: null }, longitude: { not: null } }, select: SHOP_SELECT });
        requestedIds = candidates.filter((shop) => distanceMiles(Number(latitude), Number(longitude), shop.latitude, shop.longitude) <= radius).map((shop) => shop.id);
      }
      const limit = await selectedShopLimit(tx);
      if (!requestedIds.length) throw problem(400, "TARGET_SHOPS_REQUIRED", "Select at least one pawnshop.");
      if (distributionMode === "ONE_SHOP" && requestedIds.length !== 1) throw problem(400, "ONE_SHOP_REQUIRED", "One-shop distribution requires exactly one pawnshop.");
      if (requestedIds.length > limit) throw problem(400, "TARGET_SHOP_LIMIT_EXCEEDED", `Select no more than ${limit} pawnshops.`);
      const valid = await tx.pawnShop.findMany({ where: { ...publicShopWhere(), id: { in: requestedIds } }, select: SHOP_SELECT });
      if (valid.length !== requestedIds.length) throw problem(400, "TARGET_SHOP_INVALID", "Every selected pawnshop must be active, public, and available.");
    } else if (requestedIds.length) throw problem(400, "MARKETPLACE_SHOPS_NOT_ALLOWED", "Marketplace-only distribution cannot include pawnshops.");

    let listing = null;
    if (MARKETPLACE_MODES.has(distributionMode)) {
      const linkedListingId = text(marketplace?.marketplaceListingId);
      if (linkedListingId) {
        listing = await tx.marketplaceListing.findFirst({ where: { id: linkedListingId, sellerUserId: sellerId } });
        if (!listing) throw problem(404, "MARKETPLACE_LISTING_NOT_FOUND", "Marketplace draft not found.");
        marketplaceInput({ price: listing.price, quantity: listing.quantity, pickupAvailable: listing.pickupAvailable, shippingAvailable: listing.shippingAvailable }, { ...submission, images: listing.images });
        if (listing.status !== "DRAFT") throw problem(409, "MARKETPLACE_DRAFT_REQUIRED", "Only a marketplace draft may be linked during distribution.");
      } else listing = await tx.marketplaceListing.create({ data: marketplaceInput(marketplace, submission) });
    }
    const now = new Date();
    const targetRows = requestedIds.length ? await Promise.all(requestedIds.map((shopId) => tx.buyerItemSubmissionTarget.create({ data: { submissionId, shopId, status: "DELIVERED", deliveredAt: now } }))) : [];
    for (const target of targetRows) {
      await tx.buyerItemSubmissionConversation.create({ data: { submissionId, shopId: target.shopId, targetId: target.id } });
      const shop = await tx.pawnShop.findUnique({ where: { id: target.shopId }, select: { ownerId: true } });
      await notify(tx, { userId: shop.ownerId, type: "SELLER_ITEM_TARGETED", title: "A seller offered an item to your shop", message: submission.title, actionUrl: `/owner/submissions?shopId=${target.shopId}`, dedupeKey: `submission-target:${target.id}` });
      await audit(tx, { submissionId, targetId: target.id, shopId: target.shopId, actorUserId: sellerId, eventType: "DISTRIBUTION_DELIVERED", idempotencyKey: `target-delivered:${target.id}`, data: { distributionMode } });
    }
    await audit(tx, { submissionId, actorUserId: sellerId, eventType: "DISTRIBUTION_CREATED", idempotencyKey: idempotencyKey || `distribution:${submissionId}`, data: { distributionMode, targetCount: targetRows.length, marketplaceListingId: listing?.id || null } });
    return tx.buyerItemSubmission.update({ where: { id: submissionId }, data: { distributionMode, radiusMiles: NEARBY_MODES.has(distributionMode) ? Number(radiusMiles) : submission.radiusMiles, distributionExpiresAt: expiresAt ? new Date(expiresAt) : null, marketplaceListingId: listing?.id || null, status: targetRows.length ? "SUBMITTED" : "LISTED" }, include: { targets: { include: { shop: { select: SHOP_SELECT } } }, marketplaceListing: true } });
  }, { isolationLevel: "Serializable" });
}

export async function assertTargetShopAccess({ user, submissionId, shopId, permission = "offers:read" }) {
  await assertShopPermission({ user, shopId, permission });
  const target = await prisma.buyerItemSubmissionTarget.findUnique({ where: { submissionId_shopId: { submissionId, shopId } }, include: { conversation: true } });
  if (!target) throw problem(404, "TARGET_NOT_FOUND", "Opportunity not found.");
  return target;
}

export async function closeDistribution({ tx, submissionId, actorUserId, reason, winningShopId = null }) {
  if (!tx.buyerItemSubmissionTarget) return;
  const now = new Date();
  const targets = await tx.buyerItemSubmissionTarget.findMany({ where: { submissionId, status: { not: "CLOSED" } } });
  await tx.buyerItemSubmissionTarget.updateMany({ where: { submissionId, status: { not: "CLOSED" } }, data: { status: "CLOSED", closedAt: now, closeReason: reason } });
  for (const target of targets) {
    await audit(tx, { submissionId, targetId: target.id, shopId: target.shopId, actorUserId, eventType: "TARGET_CLOSED", idempotencyKey: `target-closed:${target.id}:${reason}`, data: { reason } });
    if (target.shopId !== winningShopId) {
      const shop = await tx.pawnShop.findUnique({ where: { id: target.shopId }, select: { ownerId: true } });
      await notify(tx, { userId: shop.ownerId, type: "SELLER_OPPORTUNITY_CLOSED", title: "Item opportunity closed", message: "The item is no longer available through this channel.", actionUrl: `/owner/submissions?shopId=${target.shopId}`, dedupeKey: `target-closed:${target.id}:${reason}` });
    }
  }
}

export { problem, audit, notify, SHOP_SELECT };

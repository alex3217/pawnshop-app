import { prisma } from "../lib/prisma.js";
import { assertShopPermission } from "./shopAccess.service.js";
import { assertCanUseAiListingAssistantForShop } from "./sellerPlan.service.js";
import { getOwnedListingOrThrow } from "../controllers/marketplaceListings.controller.js";

export const AI_DESCRIPTION_CONTEXTS = Object.freeze([
  "INVENTORY_ITEM",
  "MARKETPLACE_LISTING",
  "AUCTION",
  "SELL_SUBMISSION",
  "PAWN_SUBMISSION",
]);

function forbidden(message = "You cannot generate a description for this resource.") {
  return Object.assign(new Error(message), { statusCode: 403, code: "AI_RESOURCE_FORBIDDEN" });
}

export async function authorizeAiDescriptionRequest({
  user,
  body,
  prismaClient = prisma,
  assertPermission = assertShopPermission,
  assertEntitlement = assertCanUseAiListingAssistantForShop,
  assertMarketplaceListingAccess = getOwnedListingOrThrow,
}) {
  const context = String(body?.context || "").trim().toUpperCase();
  if (!AI_DESCRIPTION_CONTEXTS.includes(context)) {
    throw Object.assign(new Error("context must be a supported AI description context."), { statusCode: 400, code: "AI_CONTEXT_INVALID" });
  }
  const userId = String(user?.sub || user?.id || "").trim();
  const role = String(user?.role || "").trim().toUpperCase();
  const shopId = String(body?.pawnShopId || "").trim();
  const resourceId = String(body?.resourceId || "").trim();
  if (shopId.length > 128 || resourceId.length > 128) {
    throw Object.assign(new Error("Resource identifiers must be 128 characters or fewer."), { statusCode: 400, code: "AI_INPUT_TOO_LONG" });
  }

  async function authorizeShop(targetShopId) {
    await assertPermission({ user, shopId: targetShopId, permission: "inventory:write", prismaClient });
    await assertEntitlement(targetShopId, { prismaClient });
  }

  if (context === "INVENTORY_ITEM") {
    if (!shopId) throw forbidden("A managed shop is required for this description.");
    await authorizeShop(shopId);
    if (resourceId) {
      const item = await prismaClient.item.findFirst({ where: { id: resourceId, pawnShopId: shopId, isDeleted: false }, select: { id: true } });
      if (!item) throw forbidden();
    }
    return { context, shopId, userId };
  }

  if (context === "AUCTION") {
    if (!shopId || !resourceId) throw forbidden("An existing auction and managed shop are required for this description.");
    const auction = await prismaClient.auction.findUnique({ where: { id: resourceId }, select: { item: { select: { pawnShopId: true, isDeleted: true } } } });
    if (!auction?.item || auction.item.isDeleted || auction.item.pawnShopId !== shopId) throw forbidden();
    await authorizeShop(shopId);
    return { context, shopId, userId };
  }

  if (context === "MARKETPLACE_LISTING") {
    if (resourceId) {
      const listing = await prismaClient.marketplaceListing.findUnique({ where: { id: resourceId }, select: { sellerUserId: true, sellerShopId: true } });
      if (!listing) throw forbidden();
      if (shopId && shopId !== String(listing.sellerShopId || "")) throw forbidden();
      if (listing.sellerShopId) {
        await authorizeShop(listing.sellerShopId);
      } else {
        await assertMarketplaceListingAccess({ listingId: resourceId, userId, role });
      }
      return { context, shopId: listing.sellerShopId || "", userId };
    }
    if (shopId) await authorizeShop(shopId);
    else if (role !== "CONSUMER") throw forbidden("Only customers can generate descriptions for new customer listings.");
    return { context, shopId, userId };
  }

  if (resourceId) {
    const submission = await prismaClient.buyerItemSubmission.findUnique({ where: { id: resourceId }, select: { buyerId: true, intent: true } });
    const permittedIntents = context === "PAWN_SUBMISSION" ? ["PAWN_OFFERS", "BOTH"] : ["MARKETPLACE_LISTING", "BOTH"];
    if (!submission || submission.buyerId !== userId || !permittedIntents.includes(String(submission.intent || ""))) throw forbidden();
  } else if (role !== "CONSUMER") {
    throw forbidden("Only customers can generate descriptions for new item submissions.");
  }
  return { context, shopId: "", userId };
}

export async function enforceAiDescriptionAuthorization(req, _res, next) {
  await authorizeAiDescriptionRequest({ user: req.user, body: req.body });
  next();
}

import { prisma } from "../lib/prisma.js";
import { sendControllerError } from "../lib/controllerErrorResponse.js";

const DISPLAY_MAX = 60;
const IDENTIFIER = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const HTML = /<[^>]*>/;
const id = (req) => String(req.user?.sub || "").trim();
const fail = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });
const sendError = (res, error) => sendControllerError(res, error);

const selectProfile = {
  publicDisplayName: true, publicMessageIdentifier: true, email: true,
  messageDiscoverable: true, allowShopFirstContact: true, allowTransactionalMessages: true,
  sellerDiscoverable: true, allowMarketplaceFirstContact: true,
  blockedMessagingShops: { orderBy: { createdAt: "desc" }, select: { createdAt: true, shop: { select: { id: true, name: true, logoUrl: true, city: true, state: true } } } },
};

export async function getBuyerMessagingProfile(req, res) {
  try {
    const profile = await prisma.user.findUnique({ where: { id: id(req) }, select: selectProfile });
    if (!profile) throw fail(404, "Account not found.");
    return res.json({ success: true, profile });
  } catch (error) { return sendError(res, error); }
}

export async function updateBuyerMessagingProfile(req, res) {
  try {
    const displayName = String(req.body.publicDisplayName || "").trim().replace(/\s+/g, " ");
    const identifier = String(req.body.publicMessageIdentifier || "").trim().toLowerCase();
    if (displayName.length < 2 || displayName.length > DISPLAY_MAX || HTML.test(displayName)) throw fail(400, "Public display name must be 2 to 60 plain-text characters.");
    if (!IDENTIFIER.test(identifier)) throw fail(400, "PawnLoop identifier must be 3 to 32 lowercase letters, numbers, underscores, or hyphens.");
    const data = {
      publicDisplayName: displayName, publicMessageIdentifier: identifier,
      messageDiscoverable: req.body.messageDiscoverable === true,
      allowShopFirstContact: req.body.allowShopFirstContact === true,
      allowTransactionalMessages: req.body.allowTransactionalMessages === true,
      sellerDiscoverable: req.body.sellerDiscoverable === true,
      allowMarketplaceFirstContact: req.body.allowMarketplaceFirstContact === true,
    };
    if (!data.messageDiscoverable) data.allowShopFirstContact = false;
    if (!data.sellerDiscoverable) data.allowMarketplaceFirstContact = false;
    const profile = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: id(req), isActive: true }, data, select: selectProfile });
      await tx.buyerMessagingProfileAudit.create({ data: { userId: id(req), action: "PROFILE_UPDATED", metadata: { messageDiscoverable: data.messageDiscoverable, allowShopFirstContact: data.allowShopFirstContact, allowTransactionalMessages: data.allowTransactionalMessages, sellerDiscoverable: data.sellerDiscoverable, allowMarketplaceFirstContact: data.allowMarketplaceFirstContact } } });
      return updated;
    });
    return res.json({ success: true, profile });
  } catch (error) {
    if (error?.code === "P2002") return sendError(res, fail(409, "That PawnLoop identifier is already in use.", "PUBLIC_IDENTIFIER_TAKEN"));
    return sendError(res, error);
  }
}

export async function unblockBuyerMessagingShop(req, res) {
  try {
    const shopId = String(req.params.shopId || "").trim();
    const buyerUserId = id(req);
    await prisma.$transaction(async (tx) => {
      const block = await tx.buyerMessagingShopBlock.findUnique({
        where: { buyerUserId_shopId: { buyerUserId, shopId } },
        select: { id: true },
      });
      if (block) {
        await tx.buyerMessagingShopBlock.delete({ where: { id: block.id } });
        await tx.buyerMessagingProfileAudit.create({ data: { userId: buyerUserId, action: "SHOP_UNBLOCKED", metadata: { shopId } } });
      }
    });
    return res.json({ success: true });
  } catch (error) { return sendError(res, error); }
}

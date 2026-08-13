import { prisma } from "../lib/prisma.js";
import { assertShopPermission, getAccessibleShopScope } from "../services/shopAccess.service.js";

const REASONS = new Set(["SELL_ITEM", "PAWN_ITEM", "INVENTORY", "OFFER", "VISIT", "OTHER"]);
const SUBJECT_MAX = 120;
const MESSAGE_MAX = 4000;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/i;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;

const conversationInclude = {
  shop: { select: { id: true, name: true, address: true, city: true, state: true, zip: true, logoUrl: true } },
  seller: { select: { id: true, name: true } },
  buyerItemSubmission: { select: { id: true, title: true, intent: true, status: true } },
  buyerItemSubmissionTarget: { select: { id: true, submissionId: true, shopId: true } },
  marketplaceListing: { select: { id: true, title: true, status: true } },
  item: { select: { id: true, title: true, pawnShopId: true } },
  offer: { select: { id: true, itemId: true, status: true } },
  messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, senderUserId: true, body: true, readAt: true, systemMetadata: true, createdAt: true } },
};

function userId(req) { return String(req.user?.sub || "").trim(); }
function role(req) { return String(req.user?.role || "").toUpperCase(); }
function httpError(statusCode, message, code) { const error = new Error(message); error.statusCode = statusCode; error.code = code; return error; }
function cleanText(value, name, max) {
  const text = String(value ?? "").trim();
  if (!text) throw httpError(400, `${name} is required.`);
  if (text.length > max) throw httpError(400, `${name} must be ${max} characters or fewer.`);
  if (HTML_PATTERN.test(text)) throw httpError(400, `${name} cannot contain HTML.`);
  if (URL_PATTERN.test(text)) throw httpError(400, `${name} cannot contain URLs in messaging V1.`);
  return text;
}
function cleanId(value) { const id = String(value || "").trim(); return id || null; }
function isPlatformAdmin(req) { return ["ADMIN", "SUPER_ADMIN"].includes(role(req)); }
function sendError(res, error) { return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || "Internal server error", ...(error?.code ? { code: error.code } : {}) }); }

async function sideForConversation(req, conversation, permission = "messages:read") {
  if (isPlatformAdmin(req)) throw httpError(403, "Private messages require the explicit audited moderation path.");
  if (conversation.sellerUserId === userId(req)) return "SELLER";
  await assertShopPermission({ user: req.user, shopId: conversation.shopId, permission });
  return "SHOP";
}

async function loadAuthorized(req, permission = "messages:read") {
  const conversation = await prisma.shopConversation.findUnique({ where: { id: req.params.id }, include: conversationInclude });
  if (!conversation) throw httpError(404, "Conversation not found.");
  const side = await sideForConversation(req, conversation, permission);
  return { conversation, side };
}

async function validateContext(input, sellerUserId, shopId) {
  const buyerItemSubmissionId = cleanId(input.buyerItemSubmissionId);
  const buyerItemSubmissionTargetId = cleanId(input.buyerItemSubmissionTargetId);
  const marketplaceListingId = cleanId(input.marketplaceListingId);
  const itemId = cleanId(input.itemId);
  const offerId = cleanId(input.offerId);

  if (buyerItemSubmissionId) {
    const row = await prisma.buyerItemSubmission.findFirst({ where: { id: buyerItemSubmissionId, buyerId: sellerUserId }, select: { id: true } });
    if (!row) throw httpError(400, "Invalid buyer item submission reference.");
  }
  if (buyerItemSubmissionTargetId) {
    const row = await prisma.buyerItemSubmissionTarget.findFirst({ where: { id: buyerItemSubmissionTargetId, shopId, submission: { buyerId: sellerUserId } }, select: { id: true, submissionId: true } });
    if (!row || (buyerItemSubmissionId && row.submissionId !== buyerItemSubmissionId)) throw httpError(400, "Invalid submission target reference.");
  }
  if (marketplaceListingId) {
    const row = await prisma.marketplaceListing.findFirst({ where: { id: marketplaceListingId, sellerUserId }, select: { id: true } });
    if (!row) throw httpError(400, "Invalid marketplace listing reference.");
  }
  if (itemId) {
    const row = await prisma.item.findFirst({ where: { id: itemId, pawnShopId: shopId, isDeleted: false }, select: { id: true } });
    if (!row) throw httpError(400, "Invalid item reference for this shop.");
  }
  if (offerId) {
    const row = await prisma.offer.findFirst({ where: { id: offerId, buyerId: sellerUserId, item: { pawnShopId: shopId } }, select: { id: true } });
    if (!row) throw httpError(400, "Invalid offer reference for this shop.");
  }
  return { buyerItemSubmissionId, buyerItemSubmissionTargetId, marketplaceListingId, itemId, offerId };
}

async function recipientIds(tx, conversation, senderSide) {
  if (senderSide === "SHOP") return [conversation.sellerUserId];
  const shop = await tx.pawnShop.findUnique({ where: { id: conversation.shopId }, select: { ownerId: true, staffMembers: { where: { status: "ACTIVE", permissions: { has: "messages:read" } }, select: { userId: true } } } });
  return [...new Set([shop?.ownerId, ...(shop?.staffMembers || []).map((member) => member.userId)].filter(Boolean))];
}

async function createNotifications(tx, conversation, senderSide, messageId) {
  const recipients = await recipientIds(tx, conversation, senderSide);
  if (!recipients.length) return;
  await tx.notification.createMany({ data: recipients.map((recipientId) => ({ userId: recipientId, type: "SHOP_MESSAGE", title: `New message: ${conversation.subject}`, message: senderSide === "SELLER" ? "A seller sent your shop a message." : `${conversation.shop.name} replied to your message.`, actionUrl: senderSide === "SELLER" ? `/owner/messages/${conversation.id}` : `/messages/${conversation.id}`, dedupeKey: `shop-message:${messageId}:${recipientId}` })), skipDuplicates: true });
}

export async function createConversation(req, res) {
  try {
    if (isPlatformAdmin(req)) throw httpError(403, "Administrators cannot create seller conversations.");
    const sellerUserId = userId(req);
    const shopId = cleanId(req.body.shopId);
    if (!shopId) throw httpError(400, "Shop is required.");
    const subject = cleanText(req.body.subject, "Subject", SUBJECT_MAX);
    const body = cleanText(req.body.message, "Message", MESSAGE_MAX);
    const contactReason = String(req.body.contactReason || "").trim().toUpperCase();
    if (!REASONS.has(contactReason)) throw httpError(400, "A valid contact reason is required.");
    const shop = await prisma.pawnShop.findFirst({ where: { id: shopId, isDeleted: false, isActive: true, isPublic: true }, select: { id: true, name: true, ownerId: true, staffMembers: { where: { status: "ACTIVE", userId: sellerUserId }, select: { id: true } } } });
    if (!shop) throw httpError(404, "This shop is not available for messaging.");
    if (shop.ownerId === sellerUserId || shop.staffMembers.length) throw httpError(403, "You cannot message your own shop through the seller workflow.");
    const context = await validateContext(req.body, sellerUserId, shopId);
    const idempotencyKey = cleanId(req.get("Idempotency-Key"));
    if (!idempotencyKey || idempotencyKey.length > 100) throw httpError(400, "A valid Idempotency-Key header is required.");

    const result = await prisma.$transaction(async (tx) => {
      const existingMessage = await tx.shopMessage.findFirst({ where: { senderUserId: sellerUserId, idempotencyKey }, select: { conversationId: true } });
      if (existingMessage) return tx.shopConversation.findUnique({ where: { id: existingMessage.conversationId }, include: conversationInclude });
      let conversation = null;
      const reopenId = cleanId(req.body.conversationId);
      if (reopenId) {
        conversation = await tx.shopConversation.findFirst({ where: { id: reopenId, sellerUserId, shopId } });
        if (!conversation || conversation.status === "BLOCKED") throw httpError(409, "This conversation cannot be reopened.");
        conversation = await tx.shopConversation.update({ where: { id: conversation.id }, data: { status: "OPEN", sellerLastReadAt: new Date() } });
        await tx.shopConversationAuditEvent.create({ data: { conversationId: conversation.id, actorUserId: sellerUserId, action: "REOPENED" } });
      } else {
        conversation = context.buyerItemSubmissionTargetId
          ? await tx.shopConversation.findUnique({ where: { buyerItemSubmissionTargetId: context.buyerItemSubmissionTargetId } })
          : null;
        if (conversation) {
          if (conversation.sellerUserId !== sellerUserId || conversation.shopId !== shopId || conversation.status === "BLOCKED") throw httpError(409, "This targeted conversation cannot be reused.");
          if (conversation.status === "CLOSED") conversation = await tx.shopConversation.update({ where: { id: conversation.id }, data: { status: "OPEN", sellerLastReadAt: new Date() } });
        } else {
          conversation = await tx.shopConversation.create({ data: { shopId, sellerUserId, subject, contactReason, sellerLastReadAt: new Date(), ...context } });
          await tx.shopConversationAuditEvent.create({ data: { conversationId: conversation.id, actorUserId: sellerUserId, action: "CREATED" } });
        }
      }
      const message = await tx.shopMessage.create({ data: { conversationId: conversation.id, senderUserId: sellerUserId, body, idempotencyKey } });
      await createNotifications(tx, { ...conversation, shop }, "SELLER", message.id);
      return tx.shopConversation.findUnique({ where: { id: conversation.id }, include: conversationInclude });
    });
    return res.status(201).json({ success: true, conversation: result });
  } catch (error) { return sendError(res, error); }
}

export async function listSellerConversations(req, res) {
  try {
    if (isPlatformAdmin(req)) throw httpError(403, "Private messages require audited moderation access.");
    const conversations = await prisma.shopConversation.findMany({ where: { sellerUserId: userId(req) }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { ...conversationInclude, messages: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true, senderUserId: true, body: true, createdAt: true } } } });
    return res.json({ success: true, conversations });
  } catch (error) { return sendError(res, error); }
}

export async function listShopConversations(req, res) {
  try {
    if (isPlatformAdmin(req)) throw httpError(403, "Private messages require audited moderation access.");
    const scope = await getAccessibleShopScope({ user: req.user, permission: "messages:read" });
    const requestedShopId = cleanId(req.query.shopId);
    if (requestedShopId && !scope.unrestricted && !scope.shopIds.includes(requestedShopId)) throw httpError(403, "You do not have access to this shop.");
    const status = String(req.query.status || "ALL").toUpperCase();
    const where = { shopId: requestedShopId || (scope.unrestricted ? undefined : { in: scope.shopIds }), ...(status === "UNREAD" ? { messages: { some: { senderUserId: { not: userId(req) }, readAt: null } } } : ["OPEN", "CLOSED", "BLOCKED"].includes(status) ? { status } : {}) };
    const conversations = await prisma.shopConversation.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { ...conversationInclude, messages: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true, senderUserId: true, body: true, createdAt: true } } } });
    return res.json({ success: true, conversations });
  } catch (error) { return sendError(res, error); }
}

export async function getConversation(req, res) {
  try { const { conversation, side } = await loadAuthorized(req); return res.json({ success: true, side, conversation }); }
  catch (error) { return sendError(res, error); }
}

export async function postMessage(req, res) {
  try {
    const body = cleanText(req.body.message, "Message", MESSAGE_MAX);
    const idempotencyKey = cleanId(req.get("Idempotency-Key"));
    if (!idempotencyKey || idempotencyKey.length > 100) throw httpError(400, "A valid Idempotency-Key header is required.");
    const { conversation, side } = await loadAuthorized(req, "messages:write");
    if (conversation.status === "BLOCKED") throw httpError(409, "This conversation is blocked.");
    if (conversation.status === "CLOSED") throw httpError(409, "Reopen this conversation before replying.");
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.shopMessage.findUnique({ where: { conversationId_senderUserId_idempotencyKey: { conversationId: conversation.id, senderUserId: userId(req), idempotencyKey } } });
      if (existing) return existing;
      const message = await tx.shopMessage.create({ data: { conversationId: conversation.id, senderUserId: userId(req), body, idempotencyKey } });
      await tx.shopConversation.update({ where: { id: conversation.id }, data: side === "SELLER" ? { sellerLastReadAt: new Date() } : { shopLastReadAt: new Date() } });
      await createNotifications(tx, conversation, side, message.id);
      return message;
    });
    return res.status(201).json({ success: true, message: result });
  } catch (error) { return sendError(res, error); }
}

export async function markRead(req, res) {
  try {
    const { conversation, side } = await loadAuthorized(req);
    const now = new Date();
    await prisma.$transaction([
      prisma.shopMessage.updateMany({ where: { conversationId: conversation.id, senderUserId: { not: userId(req) }, readAt: null }, data: { readAt: now } }),
      prisma.shopConversation.update({ where: { id: conversation.id }, data: side === "SELLER" ? { sellerLastReadAt: now } : { shopLastReadAt: now } }),
    ]);
    return res.json({ success: true, readAt: now });
  } catch (error) { return sendError(res, error); }
}

async function changeStatus(req, res, status, action) {
  try {
    const permission = status === "BLOCKED" ? "messages:write" : "messages:write";
    const { conversation, side } = await loadAuthorized(req, permission);
    if (conversation.status === "BLOCKED" && status !== "BLOCKED") throw httpError(409, "A blocked conversation cannot be changed outside moderation.");
    if (status === "BLOCKED" && side !== "SHOP") throw httpError(403, "Only an authorized shop participant may block a conversation.");
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.shopConversation.update({ where: { id: conversation.id }, data: { status, ...(status === "BLOCKED" ? { blockedByUserId: userId(req), blockedAt: new Date() } : status === "OPEN" ? { blockedByUserId: null, blockedAt: null } : {}) } });
      await tx.shopConversationAuditEvent.create({ data: { conversationId: row.id, actorUserId: userId(req), action, metadata: cleanId(req.body?.reason) ? { reason: String(req.body.reason).trim().slice(0, 500) } : undefined } });
      return row;
    });
    return res.json({ success: true, conversation: updated });
  } catch (error) { return sendError(res, error); }
}
export const closeConversation = (req, res) => changeStatus(req, res, "CLOSED", "CLOSED");
export const reopenConversation = (req, res) => changeStatus(req, res, "OPEN", "REOPENED");
export const blockConversation = (req, res) => changeStatus(req, res, "BLOCKED", "BLOCKED");
export async function reportConversation(req, res) {
  try { const { conversation } = await loadAuthorized(req); const reason = cleanText(req.body.reason, "Report reason", 500); await prisma.shopConversationAuditEvent.create({ data: { conversationId: conversation.id, actorUserId: userId(req), action: "REPORTED", metadata: { reason } } }); return res.status(201).json({ success: true }); }
  catch (error) { return sendError(res, error); }
}
export async function unreadCounts(req, res) {
  try {
    if (isPlatformAdmin(req)) throw httpError(403, "Private messages require audited moderation access.");
    const seller = await prisma.shopMessage.count({ where: { readAt: null, senderUserId: { not: userId(req) }, conversation: { sellerUserId: userId(req) } } });
    const scope = await getAccessibleShopScope({ user: req.user, permission: "messages:read" });
    const shop = scope.shopIds.length ? await prisma.shopMessage.count({ where: { readAt: null, senderUserId: { not: userId(req) }, conversation: { shopId: { in: scope.shopIds } } } }) : 0;
    return res.json({ success: true, seller, shop, total: seller + shop });
  } catch (error) { return sendError(res, error); }
}

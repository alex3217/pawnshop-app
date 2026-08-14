import { prisma } from "../lib/prisma.js";
import { assertShopPermission, getAccessibleShopScope } from "../services/shopAccess.service.js";

const REASONS = new Set(["SELL_ITEM", "PAWN_ITEM", "INVENTORY", "OFFER", "VISIT", "OTHER"]);
const OUTBOUND_CONTEXTS = new Set(["GENERAL_INQUIRY", "MARKETPLACE_LISTING", "TARGETED_OFFER", "EXISTING_OFFER", "ORDER_TRANSACTION", "AUCTION", "SELL_PAWN_SUBMISSION"]);
const SUBJECT_MAX = 120;
const MESSAGE_MAX = 4000;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/i;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;

const conversationInclude = {
  shop: { select: { id: true, name: true, address: true, city: true, state: true, zip: true, logoUrl: true } },
  seller: { select: { id: true, name: true } },
  recipientShop: { select: { id: true, name: true, logoUrl: true } },
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
  if (conversation.recipientShopId) {
    try { await assertShopPermission({ user: req.user, shopId: conversation.shopId, permission }); return { side: "SHOP", viewerShopId: conversation.shopId }; }
    catch { await assertShopPermission({ user: req.user, shopId: conversation.recipientShopId, permission }); return { side: "SHOP", viewerShopId: conversation.recipientShopId }; }
  }
  if (conversation.sellerUserId === userId(req)) return { side: "SELLER", viewerShopId: null };
  await assertShopPermission({ user: req.user, shopId: conversation.shopId, permission });
  return { side: "SHOP", viewerShopId: conversation.shopId };
}

async function loadAuthorized(req, permission = "messages:read") {
  const conversation = await prisma.shopConversation.findUnique({ where: { id: req.params.id }, include: conversationInclude });
  if (!conversation) throw httpError(404, "Conversation not found.");
  const participant = await sideForConversation(req, conversation, permission);
  return { conversation, ...participant };
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

async function recipientIds(tx, conversation, senderSide, senderUserId = null) {
  if (conversation.recipientShopId && conversation.recipientShopId !== conversation.shopId) {
    const recipientSide = await tx.pawnShop.findFirst({ where: { id: conversation.recipientShopId, OR: [{ ownerId: senderUserId || "" }, { staffMembers: { some: { userId: senderUserId || "", status: "ACTIVE" } } }] }, select: { id: true } });
    const targetShopId = recipientSide ? conversation.shopId : conversation.recipientShopId;
    const target = await tx.pawnShop.findUnique({ where: { id: targetShopId }, select: { ownerId: true, staffMembers: { where: { status: "ACTIVE", permissions: { has: "messages:read" } }, select: { userId: true } } } });
    return [...new Set([target?.ownerId, ...(target?.staffMembers || []).map((member) => member.userId)].filter(Boolean))];
  }
  if (senderSide === "SHOP") return [conversation.sellerUserId];
  const shop = await tx.pawnShop.findUnique({ where: { id: conversation.shopId }, select: { ownerId: true, staffMembers: { where: { status: "ACTIVE", permissions: { has: "messages:read" } }, select: { userId: true } } } });
  return [...new Set([shop?.ownerId, ...(shop?.staffMembers || []).map((member) => member.userId)].filter(Boolean))];
}

async function createNotifications(tx, conversation, senderSide, messageId, senderUserId = null) {
  const recipients = await recipientIds(tx, conversation, senderSide, senderUserId);
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
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1); const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || "25"), 10) || 25));
    const where = { sellerUserId: userId(req), recipientShopId: null };
    const [conversations, total] = await prisma.$transaction([prisma.shopConversation.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { ...conversationInclude, messages: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true, senderUserId: true, body: true, readAt: true, systemMetadata: true, createdAt: true } } } }), prisma.shopConversation.count({ where })]);
    return res.json({ success: true, conversations, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error); }
}

export async function listShopConversations(req, res) {
  try {
    if (isPlatformAdmin(req)) throw httpError(403, "Private messages require audited moderation access.");
    const scope = await getAccessibleShopScope({ user: req.user, permission: "messages:read" });
    const requestedShopId = cleanId(req.query.shopId);
    if (requestedShopId && !scope.unrestricted && !scope.shopIds.includes(requestedShopId)) throw httpError(403, "You do not have access to this shop.");
    const status = String(req.query.status || "ALL").toUpperCase();
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1); const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || "25"), 10) || 25));
    const allowedShopIds = requestedShopId ? [requestedShopId] : scope.shopIds;
    const where = { OR: [{ shopId: scope.unrestricted && !requestedShopId ? undefined : { in: allowedShopIds } }, { recipientShopId: scope.unrestricted && !requestedShopId ? { not: null } : { in: allowedShopIds } }], ...(status === "UNREAD" ? { messages: { some: { senderUserId: { not: userId(req) }, readAt: null } } } : ["OPEN", "CLOSED", "BLOCKED"].includes(status) ? { status } : {}) };
    const [conversations, total] = await prisma.$transaction([prisma.shopConversation.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { ...conversationInclude, messages: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true, senderUserId: true, body: true, readAt: true, systemMetadata: true, createdAt: true } } } }), prisma.shopConversation.count({ where })]);
    return res.json({ success: true, conversations, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error); }
}

async function assertActiveSenderShop(req, shopId) {
  await assertShopPermission({ user: req.user, shopId, permission: "messages:write" });
  const shop = await prisma.pawnShop.findFirst({ where: { id: shopId, isDeleted: false, isActive: true }, select: { id: true, name: true, ownerId: true } });
  if (!shop) throw httpError(404, "Sending shop is unavailable.");
  return shop;
}

function relationshipWhere(shopId) {
  return { OR: [
    { shopConversations: { some: { shopId } } },
    { buyerOffers: { some: { item: { pawnShopId: shopId } } } },
    { buyerItemSubmissions: { some: { targets: { some: { shopId } } } } },
    { marketplacePurchases: { some: { OR: [{ sellerShopId: shopId }, { listing: { sellerShopId: shopId } }] } } },
    { marketplaceSales: { some: { buyerShopId: shopId } } },
    { Bid: { some: { auction: { shopId } } } },
    { watchlistEntries: { some: { item: { pawnShopId: shopId } } } },
  ] };
}

async function assertOutboundContext({ contextType, contextReferenceId, shopId, recipientUserId, recipientShopId }) {
  if (contextType === "GENERAL_INQUIRY") return;
  const recipientMatch = recipientShopId ? { OR: [{ buyerShopId: recipientShopId }, { sellerShopId: recipientShopId }] } : { OR: [{ buyerUserId: recipientUserId }, { sellerUserId: recipientUserId }] };
  let row = null;
  if (contextType === "MARKETPLACE_LISTING") row = await prisma.marketplaceListing.findFirst({ where: { id: contextReferenceId, OR: [{ sellerUserId: recipientUserId }, { sellerShopId: recipientShopId || undefined }, { item: { pawnShopId: shopId } }] }, select: { id: true } });
  if (contextType === "EXISTING_OFFER") row = await prisma.offer.findFirst({ where: { id: contextReferenceId, buyerId: recipientUserId, item: { pawnShopId: shopId } }, select: { id: true } });
  if (contextType === "TARGETED_OFFER") row = await prisma.buyerItemSubmissionOffer.findFirst({ where: { id: contextReferenceId, shopId, submission: { buyerId: recipientUserId } }, select: { id: true } });
  if (contextType === "ORDER_TRANSACTION") row = await prisma.marketplaceTransaction.findFirst({ where: { id: contextReferenceId, AND: [{ OR: [{ buyerShopId: shopId }, { sellerShopId: shopId }, { listing: { sellerShopId: shopId } }] }, recipientMatch] }, select: { id: true } });
  if (contextType === "AUCTION") row = await prisma.auction.findFirst({ where: { id: contextReferenceId, shopId, bids: { some: { userId: recipientUserId } } }, select: { id: true } });
  if (contextType === "SELL_PAWN_SUBMISSION") row = await prisma.buyerItemSubmission.findFirst({ where: { id: contextReferenceId, buyerId: recipientUserId, targets: { some: { shopId } } }, select: { id: true } });
  if (!row) throw httpError(403, "The selected context does not authorize this recipient.");
}

export async function searchShopMessageRecipients(req, res) {
  try {
    const shopId = cleanId(req.query.shopId); if (!shopId) throw httpError(400, "Sending shop is required.");
    await assertActiveSenderShop(req, shopId);
    const query = String(req.query.q || "").trim(); if (query.length < 2) return res.json({ success: true, recipients: [] });
    const recipientType = String(req.query.type || "CUSTOMER").toUpperCase();
    if (recipientType === "PAWNSHOP") {
      const rows = await prisma.pawnShop.findMany({ where: { id: { not: shopId }, isDeleted: false, isActive: true, isPublic: true, owner: { isActive: true }, OR: [{ name: { contains: query, mode: "insensitive" } }, { publicMessageIdentifier: { contains: query, mode: "insensitive" } }] }, take: 20, orderBy: { name: "asc" }, select: { publicMessageIdentifier: true, name: true, city: true, state: true } });
      return res.json({ success: true, recipients: rows.map((row) => ({ identifier: row.publicMessageIdentifier, displayName: row.name, detail: [row.city, row.state].filter(Boolean).join(", "), type: "PAWNSHOP" })) });
    }
    const rows = await prisma.user.findMany({ where: { isActive: true, AND: [relationshipWhere(shopId), { OR: [{ name: { contains: query, mode: "insensitive" } }, { publicMessageIdentifier: { contains: query, mode: "insensitive" } }] }] }, take: 20, orderBy: { name: "asc" }, select: { name: true, publicMessageIdentifier: true } });
    return res.json({ success: true, recipients: rows.map((row) => ({ identifier: row.publicMessageIdentifier, displayName: row.name, detail: row.publicMessageIdentifier, type: "CUSTOMER" })) });
  } catch (error) { return sendError(res, error); }
}

export async function createShopOutboundConversation(req, res) {
  try {
    if (isPlatformAdmin(req)) throw httpError(403, "Administrators cannot impersonate a shop.");
    const shopId = cleanId(req.body.shopId); if (!shopId) throw httpError(400, "Sending shop is required.");
    const sendingShop = await assertActiveSenderShop(req, shopId);
    const subject = cleanText(req.body.subject, "Subject", SUBJECT_MAX); const body = cleanText(req.body.message, "Message", MESSAGE_MAX);
    const contextType = String(req.body.contextType || "").trim().toUpperCase(); if (!OUTBOUND_CONTEXTS.has(contextType)) throw httpError(400, "A valid context is required.");
    const contextReferenceId = cleanId(req.body.contextReferenceId);
    if (contextType !== "GENERAL_INQUIRY" && !contextReferenceId) throw httpError(400, "Select the related platform context.");
    const recipientType = String(req.body.recipientType || "CUSTOMER").toUpperCase();
    if (!["CUSTOMER", "PAWNSHOP"].includes(recipientType)) throw httpError(400, "A valid recipient type is required.");
    const recipientIdentifier = cleanId(req.body.recipientIdentifier);
    if (!recipientIdentifier) throw httpError(400, "Recipient is required.");
    let recipient; let recipientShopId = null;
    if (recipientType === "PAWNSHOP") {
      const target = await prisma.pawnShop.findFirst({ where: { publicMessageIdentifier: recipientIdentifier, id: { not: shopId }, isDeleted: false, isActive: true, isPublic: true, owner: { isActive: true } }, select: { id: true, ownerId: true, name: true } });
      if (!target) throw httpError(404, "Recipient pawnshop is unavailable."); recipient = { id: target.ownerId, name: target.name }; recipientShopId = target.id;
    } else {
      recipient = await prisma.user.findFirst({ where: { publicMessageIdentifier: recipientIdentifier, isActive: true, ...relationshipWhere(shopId) }, select: { id: true, name: true } });
      if (!recipient) throw httpError(403, "This recipient is not available to your shop.");
    }
    await assertOutboundContext({ contextType, contextReferenceId, shopId, recipientUserId: recipient.id, recipientShopId });
    const idempotencyKey = cleanId(req.get("Idempotency-Key")); if (!idempotencyKey || idempotencyKey.length > 100) throw httpError(400, "A valid Idempotency-Key header is required.");
    const result = await prisma.$transaction(async (tx) => {
      const prior = await tx.shopMessage.findUnique({ where: { senderUserId_idempotencyKey: { senderUserId: userId(req), idempotencyKey } }, select: { conversationId: true } });
      if (prior) return tx.shopConversation.findUnique({ where: { id: prior.conversationId }, include: conversationInclude });
      let conversation = await tx.shopConversation.findFirst({ where: { shopId, sellerUserId: recipient.id, recipientShopId, contextType, contextReferenceId, status: { not: "BLOCKED" } }, orderBy: { updatedAt: "desc" } });
      if (conversation?.status === "CLOSED") conversation = await tx.shopConversation.update({ where: { id: conversation.id }, data: { status: "OPEN", shopLastReadAt: new Date() } });
      if (!conversation) conversation = await tx.shopConversation.create({ data: { shopId, sellerUserId: recipient.id, recipientShopId, initiatedByShopId: shopId, subject, contactReason: contextType === "SELL_PAWN_SUBMISSION" ? "SELL_ITEM" : contextType.includes("OFFER") ? "OFFER" : "OTHER", contextType, contextReferenceId, shopLastReadAt: new Date() } });
      const message = await tx.shopMessage.create({ data: { conversationId: conversation.id, senderUserId: userId(req), body, idempotencyKey, systemMetadata: { sentByShopId: shopId } } });
      await tx.shopConversationAuditEvent.create({ data: { conversationId: conversation.id, actorUserId: userId(req), action: "SHOP_COMPOSED", metadata: { shopId, recipientType, contextType, contextReferenceId } } });
      await createNotifications(tx, { ...conversation, shop: sendingShop }, "SHOP", message.id, userId(req));
      return tx.shopConversation.findUnique({ where: { id: conversation.id }, include: conversationInclude });
    });
    return res.status(201).json({ success: true, conversation: result });
  } catch (error) { return sendError(res, error); }
}

export async function getConversation(req, res) {
  try { const { conversation, side, viewerShopId } = await loadAuthorized(req); return res.json({ success: true, side, viewerShopId, conversation }); }
  catch (error) { return sendError(res, error); }
}

export async function postMessage(req, res) {
  try {
    const body = cleanText(req.body.message, "Message", MESSAGE_MAX);
    const idempotencyKey = cleanId(req.get("Idempotency-Key"));
    if (!idempotencyKey || idempotencyKey.length > 100) throw httpError(400, "A valid Idempotency-Key header is required.");
    const { conversation, side, viewerShopId } = await loadAuthorized(req, "messages:write");
    if (conversation.status === "BLOCKED") throw httpError(409, "This conversation is blocked.");
    if (conversation.status === "CLOSED") throw httpError(409, "Reopen this conversation before replying.");
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.shopMessage.findUnique({ where: { senderUserId_idempotencyKey: { senderUserId: userId(req), idempotencyKey } } });
      if (existing) {
        if (existing.conversationId !== conversation.id) throw httpError(409, "This request key was already used for another conversation.");
        return existing;
      }
      const message = await tx.shopMessage.create({ data: { conversationId: conversation.id, senderUserId: userId(req), body, idempotencyKey, systemMetadata: side === "SHOP" ? { sentByShopId: viewerShopId } : undefined } });
      await tx.shopConversation.update({ where: { id: conversation.id }, data: side === "SELLER" ? { sellerLastReadAt: new Date() } : { shopLastReadAt: new Date() } });
      await createNotifications(tx, conversation, side, message.id, userId(req));
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

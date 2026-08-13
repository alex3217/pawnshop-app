import { prisma } from "../lib/prisma.js";
import { audit, assertTargetShopAccess, distributeSubmission, expireDistributionIfNeeded, notify, searchDistributionShops, selectedShopLimit } from "../services/submissionDistribution.service.js";

const id = (req) => String(req.user?.id || req.user?.sub || req.user?.userId || "").trim();
const value = (input) => String(input ?? "").trim();
function send(res, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : error?.code === "P2002" ? 409 : 500;
  if (status >= 500) console.error("[submission-distribution]", error);
  return res.status(status).json({ success: false, error: status >= 500 ? "Submission distribution request failed" : error.message, ...(error?.code ? { code: error.code } : {}) });
}

export async function searchShops(req, res) {
  try {
    const [shops, limit] = await Promise.all([searchDistributionShops({ query: req.query?.q, latitude: req.query?.latitude, longitude: req.query?.longitude, maxDistanceMiles: req.query?.distance, take: req.query?.take }), selectedShopLimit()]);
    return res.json({ success: true, shops, selectedShopLimit: limit });
  } catch (error) { return send(res, error); }
}

export async function distribute(req, res) {
  try {
    const submission = await distributeSubmission({ submissionId: value(req.params.id), sellerId: id(req), mode: req.body?.distributionMode, shopIds: req.body?.shopIds, radiusMiles: req.body?.radiusMiles, latitude: req.body?.latitude, longitude: req.body?.longitude, marketplace: req.body?.marketplace, expiresAt: req.body?.expiresAt, idempotencyKey: value(req.headers["idempotency-key"]) || undefined });
    return res.status(201).json({ success: true, submission });
  } catch (error) { return send(res, error); }
}

export async function sellerDashboard(req, res) {
  try {
    const sellerId = id(req); const submissionId = value(req.params.id);
    await expireDistributionIfNeeded(submissionId);
    const submission = await prisma.buyerItemSubmission.findFirst({
      where: { id: submissionId, buyerId: sellerId },
      include: {
        marketplaceListing: true,
        offers: { include: { shop: { select: { id: true, name: true, address: true, city: true, state: true, zip: true } } }, orderBy: { createdAt: "desc" } },
        targets: { include: { shop: { select: { id: true, name: true, address: true, city: true, state: true, zip: true } }, conversation: { include: { messages: { select: { senderUserId: true, readAt: true } } } } }, orderBy: { createdAt: "asc" } },
        auditEvents: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!submission) return res.status(404).json({ success: false, error: "Submission not found" });
    const offers = new Map(submission.offers.map((offer) => [offer.shopId, offer]));
    return res.json({ success: true, submission: { ...submission, estimatedValue: submission.estimatedValue == null ? null : String(submission.estimatedValue), offers: undefined, targets: submission.targets.map((target) => ({ ...target, offer: offers.get(target.shopId) ? { ...offers.get(target.shopId), amount: String(offers.get(target.shopId).amount) } : null, unreadMessageCount: target.conversation?.messages.filter((message) => message.senderUserId !== sellerId && !message.readAt).length || 0, conversation: target.conversation ? { id: target.conversation.id } : null })) } });
  } catch (error) { return send(res, error); }
}

export async function shopOpportunities(req, res) {
  try {
    const shopId = value(req.query?.shopId);
    await assertTargetShopAccessForList(req.user, shopId);
    const expiring = await prisma.buyerItemSubmissionTarget.findMany({ where: { shopId, submission: { distributionExpiresAt: { lte: new Date() }, closedAt: null } }, select: { submissionId: true } });
    for (const row of expiring) await expireDistributionIfNeeded(row.submissionId);
    const targets = await prisma.buyerItemSubmissionTarget.findMany({ where: { shopId }, include: { submission: true, conversation: { select: { id: true, messages: { where: { senderUserId: { not: id(req) }, readAt: null }, select: { id: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return res.json({ success: true, opportunities: targets.map((target) => ({ ...target, submission: { ...target.submission, marketplaceListingId: undefined }, unreadMessageCount: target.conversation?.messages.length || 0 })) });
  } catch (error) { return send(res, error); }
}
async function assertTargetShopAccessForList(user, shopId) {
  const { assertShopPermission } = await import("../services/shopAccess.service.js");
  return assertShopPermission({ user, shopId, permission: "offers:read" });
}

export async function viewOpportunity(req, res) {
  try {
    const submissionId = value(req.params.id); const shopId = value(req.query?.shopId); const actorUserId = id(req);
    const target = await assertTargetShopAccess({ user: req.user, submissionId, shopId });
    const now = new Date();
    if (["PENDING", "DELIVERED"].includes(target.status)) {
      await prisma.$transaction(async (tx) => {
        await tx.buyerItemSubmissionTarget.update({ where: { id: target.id }, data: { status: "VIEWED", viewedAt: target.viewedAt || now } });
        await audit(tx, { submissionId, targetId: target.id, shopId, actorUserId, eventType: "TARGET_VIEWED", idempotencyKey: `target-viewed:${target.id}`, data: {} });
        const submission = await tx.buyerItemSubmission.findUnique({ where: { id: submissionId }, select: { buyerId: true, title: true } });
        await notify(tx, { userId: submission.buyerId, type: "SHOP_VIEWED_ITEM", title: "A shop viewed your item", message: submission.title, actionUrl: `/buyer/sell-item?submissionId=${submissionId}`, dedupeKey: `target-viewed:${target.id}` });
      });
    }
    const opportunity = await prisma.buyerItemSubmissionTarget.findUnique({ where: { id: target.id }, include: { submission: true, conversation: { select: { id: true } } } });
    return res.json({ success: true, opportunity });
  } catch (error) { return send(res, error); }
}

export async function declineOpportunity(req, res) {
  try {
    const submissionId = value(req.params.id); const shopId = value(req.body?.shopId); const actorUserId = id(req);
    const target = await assertTargetShopAccess({ user: req.user, submissionId, shopId, permission: "offers:write" });
    if (["CLOSED", "RESPONDED"].includes(target.status)) return res.status(409).json({ success: false, error: "Opportunity is no longer open" });
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.buyerItemSubmissionTarget.update({ where: { id: target.id }, data: { status: "DECLINED", declinedAt: new Date(), respondedAt: new Date(), closeReason: value(req.body?.reason) || "NOT_INTERESTED" } });
      await audit(tx, { submissionId, targetId: target.id, shopId, actorUserId, eventType: "TARGET_DECLINED", idempotencyKey: `target-declined:${target.id}`, data: { reason: updated.closeReason } });
      const submission = await tx.buyerItemSubmission.findUnique({ where: { id: submissionId }, select: { buyerId: true } });
      await notify(tx, { userId: submission.buyerId, type: "SHOP_DECLINED_ITEM", title: "A shop declined your item", message: "The shop marked this opportunity not interested.", actionUrl: `/buyer/sell-item?submissionId=${submissionId}`, dedupeKey: `target-declined:${target.id}` });
      return updated;
    });
    return res.json({ success: true, target: result });
  } catch (error) { return send(res, error); }
}

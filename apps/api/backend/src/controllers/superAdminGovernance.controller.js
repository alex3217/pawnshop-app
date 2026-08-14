import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { redactSuperAdminAuditMetadata } from "../services/superAdminAudit.service.js";

const ACTIONS = new Set(["SUSPEND_ACCOUNT", "RESTORE_ACCOUNT", "RESTRICT_MESSAGING", "RESTORE_MESSAGING", "DISABLE_SHOP_CONTACT", "RESTORE_SHOP_CONTACT", "RESTRICT_DISCOVERABILITY", "RESTORE_DISCOVERABILITY"]);
const MODERATION_STATES = new Set(["NONE", "REVIEW", "RESTRICTED", "CLOSED"]);
const SETTING_DEFAULTS = Object.freeze({
  "messaging.maxMessageLength": 4000,
  "messaging.messagesPerMinute": 20,
  "messaging.newConversationsPerDay": 25,
  "messaging.searchResultsLimit": 20,
  "messaging.discoverabilityDefault": false,
  "messaging.reportReviewThreshold": 3,
  "messaging.blockAlertThreshold": 5,
});

function error(statusCode, message, code) { return Object.assign(new Error(message), { statusCode, code }); }
function actorId(req) { return String(req.user?.sub || req.user?.id || "").trim(); }
function correlationId(req) { return String(req.requestId || req.get?.("x-correlation-id") || req.get?.("x-request-id") || randomUUID()); }
function reasonFrom(body) {
  const reason = String(body?.reason || "").trim();
  if (reason.length < 5 || reason.length > 1000) throw error(400, "A reason between 5 and 1000 characters is required.", "REASON_REQUIRED");
  if (body?.confirmed !== true && body?.confirmed !== "true") throw error(400, "Explicit confirmation is required.", "CONFIRMATION_REQUIRED");
  return reason;
}
function auditData(req, { action, targetType, targetId, reason, beforeState, afterState, metadata = {} }) {
  return {
    actorId: actorId(req) || null, actorEmail: req.user?.email || null, actorRole: req.user?.role || null,
    action, method: req.method, path: req.originalUrl, routeKey: req.route?.path || null,
    targetType, targetId, statusCode: 200, success: true, requestId: correlationId(req),
    ipAddress: req.ip || null, userAgent: req.get?.("user-agent") || null,
    metadata: redactSuperAdminAuditMetadata({ reason, beforeState, afterState, correlationId: correlationId(req), ...metadata }),
  };
}
function restrictionState(user) {
  const restriction = user.governanceRestriction;
  return {
    accountStatus: user.isActive ? "ACTIVE" : "SUSPENDED",
    messagingRestricted: Boolean(restriction?.messagingRestricted),
    shopInitiatedContactDisabled: Boolean(restriction?.shopInitiatedContactDisabled),
    discoverabilityRestricted: Boolean(restriction?.discoverabilityRestricted),
  };
}
export function resolveEffectiveMessagingPermission({ userActive, userConsent, blocked, administrativeRestriction, contextAuthorized }) {
  const factors = { accountState: Boolean(userActive), userConsent: userConsent === true, blocking: !blocked, administrativeRestriction: !administrativeRestriction, messagingContextAuthorization: Boolean(contextAuthorized) };
  return { allowed: Object.values(factors).every(Boolean), factors, policy: "MOST_RESTRICTIVE" };
}

export async function lookupSuperAdminUsers(req, res) {
  const query = String(req.query.q || "").trim();
  const lookupType = String(req.query.type || "PUBLIC").trim().toUpperCase();
  if (query.length < 2 || query.length > 254) throw error(400, "Lookup query must be 2 to 254 characters.");
  if (!["PUBLIC", "EMAIL", "INTERNAL_ID"].includes(lookupType)) throw error(400, "Invalid lookup type.");
  const where = lookupType === "EMAIL" ? { email: { equals: query, mode: "insensitive" } } : lookupType === "INTERNAL_ID" ? { id: query } : { OR: [{ publicDisplayName: { contains: query, mode: "insensitive" } }, { publicMessageIdentifier: { contains: query, mode: "insensitive" } }] };
  const users = await prisma.user.findMany({ where, take: lookupType === "PUBLIC" ? 25 : 5, orderBy: { createdAt: "desc" }, select: { id: true, publicDisplayName: true, email: true, publicMessageIdentifier: true, isActive: true, role: true } });
  await prisma.superAdminAuditLog.create({ data: auditData(req, { action: "SENSITIVE_USER_LOOKUP", targetType: "USER", targetId: users.length === 1 ? users[0].id : null, reason: String(req.query.reason || "Super Admin user governance lookup"), metadata: { lookupType, queryFingerprint: `${query.length}:${query.slice(0, 1).toLowerCase()}`, resultCount: users.length } }) });
  return res.json({ success: true, users: users.map((user) => ({ publicDisplayName: user.publicDisplayName, pawnLoopIdentifier: user.publicMessageIdentifier, privateEmail: user.email, internalId: user.id, accountStatus: user.isActive ? "ACTIVE" : "SUSPENDED", role: user.role })) });
}

export async function getUserGovernance(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { governanceRestriction: true, blockedMessagingShops: { select: { shopId: true, createdAt: true } }, shops: { select: { id: true, name: true, isActive: true, isDeleted: true } }, staffMemberships: { select: { id: true, role: true, status: true, shop: { select: { id: true, name: true } } } }, shopConversations: { select: { id: true, status: true, blockedAt: true, blockedByUserId: true, moderationState: true, _count: { select: { abuseReports: true } } } } } });
  if (!user) throw error(404, "User not found.");
  const admin = restrictionState(user);
  const blockedCount = user.shopConversations.filter((row) => row.status === "BLOCKED").length + user.blockedMessagingShops.length;
  const effective = resolveEffectiveMessagingPermission({ userActive: user.isActive, userConsent: user.allowTransactionalMessages === true, blocked: blockedCount > 0, administrativeRestriction: admin.messagingRestricted, contextAuthorized: true });
  await prisma.superAdminAuditLog.create({ data: auditData(req, { action: "VIEW_USER_GOVERNANCE", targetType: "USER", targetId: user.id, reason: "Super Admin governance detail access", metadata: { includedPrivateIdentifiers: true } }) });
  return res.json({ success: true, user: { publicDisplayName: user.publicDisplayName, pawnLoopIdentifier: user.publicMessageIdentifier, privateEmail: user.email, internalId: user.id, role: user.role, ...admin, messagingEligibility: effective, publicDiscoverability: { effective: user.isActive && user.messageDiscoverable === true && Boolean(user.publicDisplayName) && Boolean(user.publicMessageIdentifier) && !admin.discoverabilityRestricted, buyerPreference: user.messageDiscoverable === true, administrativeRestriction: admin.discoverabilityRestricted }, firstContactConsent: { state: user.allowShopFirstContact === true ? "ENABLED" : "DISABLED", source: "BUYER_MESSAGING_PROFILE" }, administrativeRestrictions: user.governanceRestriction, shops: user.shops, memberships: user.staffMemberships, blockingAndReports: { blockedConversationCount: blockedCount, buyerShopBlocks: user.blockedMessagingShops, reportCount: user.shopConversations.reduce((sum, row) => sum + row._count.abuseReports, 0), conversations: user.shopConversations } } });
}

export async function mutateUserGovernance(req, res) {
  const action = String(req.body?.action || "").toUpperCase();
  if (!ACTIONS.has(action)) throw error(400, "Invalid governance action.");
  const reason = reasonFrom(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: req.params.id }, include: { governanceRestriction: true } });
    if (!user) throw error(404, "User not found.");
    if (user.id === actorId(req) && action === "SUSPEND_ACCOUNT") throw error(409, "You cannot suspend your own Super Admin account.");
    const beforeState = restrictionState(user); const data = { reason, updatedByUserId: actorId(req) };
    if (action === "RESTRICT_MESSAGING" || action === "RESTORE_MESSAGING") data.messagingRestricted = action === "RESTRICT_MESSAGING";
    if (action === "DISABLE_SHOP_CONTACT" || action === "RESTORE_SHOP_CONTACT") data.shopInitiatedContactDisabled = action === "DISABLE_SHOP_CONTACT";
    if (action === "RESTRICT_DISCOVERABILITY" || action === "RESTORE_DISCOVERABILITY") data.discoverabilityRestricted = action === "RESTRICT_DISCOVERABILITY";
    const materiallyRestricted = ["SUSPEND_ACCOUNT", "RESTRICT_MESSAGING", "DISABLE_SHOP_CONTACT", "RESTRICT_DISCOVERABILITY"].includes(action);
    if (action === "SUSPEND_ACCOUNT" || action === "RESTORE_ACCOUNT") await tx.user.update({ where: { id: user.id }, data: { isActive: action === "RESTORE_ACCOUNT", ...(materiallyRestricted ? { authVersion: { increment: 1 } } : {}) } });
    if (Object.keys(data).length > 2) await tx.userGovernanceRestriction.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    if (materiallyRestricted && action !== "SUSPEND_ACCOUNT") await tx.user.update({ where: { id: user.id }, data: { authVersion: { increment: 1 } } });
    const refreshed = await tx.user.findUnique({ where: { id: user.id }, include: { governanceRestriction: true } }); const afterState = restrictionState(refreshed); const cid = correlationId(req);
    await tx.userGovernanceAction.create({ data: { targetUserId: user.id, actorUserId: actorId(req) || null, action, reason, correlationId: cid, beforeState, afterState } });
    await tx.superAdminAuditLog.create({ data: auditData(req, { action, targetType: "USER", targetId: user.id, reason, beforeState, afterState, metadata: { sessionsInvalidated: materiallyRestricted } }) });
    req.skipPersistedSuperAdminAudit = true; return { afterState, correlationId: cid, sessionsInvalidated: materiallyRestricted };
  });
  return res.json({ success: true, governance: result });
}

export async function listMessagingGovernance(req, res) {
  const rows = await prisma.shopConversation.findMany({ orderBy: { updatedAt: "desc" }, take: Math.min(100, Math.max(1, Number(req.query.limit) || 50)), select: { id: true, subject: true, status: true, moderationState: true, moderationReason: true, moderatedAt: true, shopId: true, sellerUserId: true, recipientShopId: true, initiatedByShopId: true, contextType: true, contextReferenceId: true, blockedByUserId: true, blockedAt: true, createdAt: true, updatedAt: true, _count: { select: { messages: true, abuseReports: true } } } });
  return res.json({ success: true, conversations: rows.map((row) => ({ ...row, messageCount: row._count.messages, reportCount: row._count.abuseReports, participantAuthorization: { seller: true, primaryShop: true, recipientShop: Boolean(row.recipientShopId), contextRequired: row.initiatedByShopId ? Boolean(row.contextType && row.contextReferenceId) : false }, messageBodiesIncluded: false })) });
}
export async function getModerationContent(req, res) {
  const reason = reasonFrom(req.query);
  const messages = await prisma.shopMessage.findMany({ where: { conversationId: req.params.id }, orderBy: { createdAt: "asc" }, select: { id: true, senderUserId: true, body: true, createdAt: true } });
  await prisma.superAdminAuditLog.create({ data: auditData(req, { action: "VIEW_MODERATION_CONTENT", targetType: "CONVERSATION", targetId: req.params.id, reason, metadata: { messageCount: messages.length } }) });
  return res.json({ success: true, messages });
}
export async function moderateConversation(req, res) {
  const reason = reasonFrom(req.body); const moderationState = String(req.body.moderationState || "").toUpperCase();
  if (!MODERATION_STATES.has(moderationState)) throw error(400, "Invalid moderation state.");
  const previous = await prisma.shopConversation.findUnique({ where: { id: req.params.id }, select: { moderationState: true, moderationReason: true, status: true } }); if (!previous) throw error(404, "Conversation not found.");
  const updated = await prisma.shopConversation.update({ where: { id: req.params.id }, data: { moderationState, moderationReason: reason, moderatedAt: new Date(), ...(moderationState === "CLOSED" ? { status: "CLOSED" } : {}) } });
  await prisma.superAdminAuditLog.create({ data: auditData(req, { action: "MODERATE_CONVERSATION", targetType: "CONVERSATION", targetId: updated.id, reason, beforeState: previous, afterState: { moderationState: updated.moderationState, moderationReason: updated.moderationReason, status: updated.status } }) }); req.skipPersistedSuperAdminAudit = true;
  return res.json({ success: true, conversation: updated });
}
export async function listMessagingReports(_req, res) { const reports = await prisma.messagingAbuseReport.findMany({ orderBy: { createdAt: "desc" }, take: 100 }); return res.json({ success: true, reports }); }
export async function getMessagingAnalytics(_req, res) {
  const [conversations, messages, reports, blocks, suspensions, rateLimits, deliveryFailures] = await Promise.all([prisma.shopConversation.count(), prisma.shopMessage.count(), prisma.messagingAbuseReport.count(), prisma.shopConversation.count({ where: { status: "BLOCKED" } }), prisma.user.count({ where: { isActive: false } }), prisma.superAdminAuditLog.count({ where: { action: { contains: "RATE_LIMIT" } } }), prisma.notification.count({ where: { type: { contains: "FAILED" } } })]);
  return res.json({ success: true, analytics: { conversations, messages, reports, blocks, suspensions, rateLimitEvents: rateLimits, deliveryFailures } });
}
export async function getMessagingSettingDefaults(_req, res) { return res.json({ success: true, defaults: SETTING_DEFAULTS }); }

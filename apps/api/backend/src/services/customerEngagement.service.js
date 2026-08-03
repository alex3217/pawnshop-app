import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";

function referralCodeValue() { return crypto.randomBytes(12).toString("base64url"); }

export async function ensureShopReferralCode(shopId) {
  const existing = await prisma.referralCode.findUnique({ where: { shopId_type: { shopId, type: "SHOP_REFERS_BUYER" } } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { return await prisma.referralCode.create({ data: { shopId, type: "SHOP_REFERS_BUYER", code: referralCodeValue() } }); }
    catch (error) { if (error?.code !== "P2002") throw error; }
  }
  throw new Error("Unable to allocate referral code.");
}

export async function recordReferralAttribution({ code, attributedUserId = null, eventType, eventKey, metadata = null }, prismaClient = prisma) {
  const referralCode = await prismaClient.referralCode.findUnique({ where: { code }, select: { id: true, ownerUserId: true, shop: { select: { ownerId: true } }, isActive: true } });
  if (!referralCode || !referralCode.isActive) throw Object.assign(new Error("Referral link not found."), { statusCode: 404 });
  if (attributedUserId && [referralCode.ownerUserId, referralCode.shop?.ownerId].filter(Boolean).includes(attributedUserId)) {
    throw Object.assign(new Error("Self-referral is not permitted."), { statusCode: 409, code: "SELF_REFERRAL" });
  }
  return prismaClient.referralAttribution.upsert({
    where: { eventKey },
    create: { referralCodeId: referralCode.id, attributedUserId, eventType, eventKey, metadata },
    update: {},
  });
}

export async function getShopCustomerGrowth(shopId, since = new Date(Date.now() - 30 * 86_400_000)) {
  const [followers, newFollowers, unfollows, newArrivals, deals, auctions, general, campaigns, scans, messages, offers, referralCodes] = await Promise.all([
    prisma.shopFollow.count({ where: { shopId, status: "FOLLOWING" } }),
    prisma.shopFollow.count({ where: { shopId, status: "FOLLOWING", createdAt: { gte: since } } }),
    prisma.shopFollow.count({ where: { shopId, status: "UNFOLLOWED", unsubscribedAt: { gte: since } } }),
    prisma.shopFollow.count({ where: { shopId, status: "FOLLOWING", pausedAt: null, newArrivalNotifications: true } }),
    prisma.shopFollow.count({ where: { shopId, status: "FOLLOWING", pausedAt: null, dealNotifications: true } }),
    prisma.shopFollow.count({ where: { shopId, status: "FOLLOWING", pausedAt: null, auctionNotifications: true } }),
    prisma.shopFollow.count({ where: { shopId, status: "FOLLOWING", pausedAt: null, generalShopNotifications: true } }),
    prisma.shopMarketingCampaign.count({ where: { shopId } }),
    prisma.shopMarketingCampaignScan.count({ where: { campaign: { shopId }, occurredAt: { gte: since } } }),
    prisma.inquiry.count({ where: { item: { pawnShopId: shopId }, createdAt: { gte: since } } }),
    prisma.offer.count({ where: { item: { pawnShopId: shopId }, createdAt: { gte: since } } }),
    prisma.referralCode.findMany({ where: { shopId }, select: { id: true, _count: { select: { attributions: true } } } }),
  ]);
  const referralVisits = referralCodes.reduce((sum, row) => sum + row._count.attributions, 0);
  const recommendations = [];
  if (campaigns === 0) recommendations.push("Create an active campaign.");
  if (scans === 0) recommendations.push("Download and place a storefront poster.");
  if (followers === 0) recommendations.push("Invite buyers to explicitly follow the shop.");
  if (followers > 0 && newArrivals === 0) recommendations.push("Explain the optional new-arrival alert in your storefront.");
  return { periodStart: since.toISOString(), followers, newFollowers, unfollows, alertPreferences: { newArrivals, deals, auctions, general }, campaigns, qrScans: scans, messages, offers, referrals: { links: referralCodes.length, attributedEvents: referralVisits, rewardsIssued: 0 }, recommendations, privacy: { aggregateOnly: true, buyerContactsIncluded: false } };
}

export async function getShopReferralSummary(shopId, origin) {
  const code = await ensureShopReferralCode(shopId);
  const byEvent = await prisma.referralAttribution.groupBy({ by: ["eventType"], where: { referralCodeId: code.id }, _count: { _all: true } });
  return { code: code.code, link: `${String(origin).replace(/\/$/, "")}/ref/${code.code}`, active: code.isActive, createdAt: code.createdAt, events: Object.fromEntries(byEvent.map((row) => [row.eventType, row._count._all])), rewards: { available: false, issued: 0 } };
}

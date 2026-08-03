import { prisma } from "../lib/prisma.js";
import { marketingAssetTemplates } from "./marketingAssets.service.js";
import { marketingTemplateMinimumPlans } from "./sellerPlan.service.js";

export async function getMarketingAdministration({ query = "", active } = {}) {
  const where = {
    ...(active === undefined ? {} : { isActive: active }),
    ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { shop: { name: { contains: query, mode: "insensitive" } } }] } : {}),
  };
  const [campaigns, campaignCount, activeCampaigns, scans, followerShops, followers, referralLinks, referralConversions, shops, assetDownloads] = await Promise.all([
    prisma.shopMarketingCampaign.findMany({ where, take: 100, orderBy: { createdAt: "desc" }, select: { id: true, name: true, destinationType: true, placementLabel: true, isActive: true, isDefault: true, shop: { select: { id: true, name: true } }, _count: { select: { scans: true } } } }),
    prisma.shopMarketingCampaign.count(), prisma.shopMarketingCampaign.count({ where: { isActive: true } }), prisma.shopMarketingCampaignScan.count(),
    prisma.shopFollow.groupBy({ by: ["shopId"], where: { status: "FOLLOWING" } }), prisma.shopFollow.count({ where: { status: "FOLLOWING" } }),
    prisma.referralCode.count(), prisma.referralAttribution.count({ where: { eventType: { not: "VISIT" } } }),
    prisma.pawnShop.findMany({ where: { isDeleted: false }, select: { id: true, marketingCampaigns: { select: { id: true } } } }),
    Promise.resolve(0),
  ]);
  return {
    metrics: { campaignCount, activeCampaigns, scans, followedShops: followerShops.length, followers, referralLinks, referralConversions, printableAssetDownloads: assetDownloads, shopsWithoutSetup: shops.filter((shop) => shop.marketingCampaigns.length === 0).length },
    campaigns: campaigns.map(({ _count, ...row }) => ({ ...row, scanCount: _count.scans })),
    templates: { codeOwned: true, arbitraryHtmlAllowed: false, downloadTracking: false, items: Object.entries(marketingAssetTemplates).map(([type, detail]) => ({ type, ...detail, minimumPlan: marketingTemplateMinimumPlans[type], active: true, formats: ["PDF"] })) },
    privacy: { aggregateFollowersOnly: true, buyerContactsIncluded: false },
  };
}

export async function disableMarketingCampaign({ campaignId, reason, req }) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.shopMarketingCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw Object.assign(new Error("Campaign not found."), { statusCode: 404 });
    const updated = await tx.shopMarketingCampaign.update({ where: { id: campaignId }, data: { isActive: false } });
    await tx.superAdminAuditLog.create({ data: {
      actorId: String(req.user?.sub || req.user?.id || "") || null, actorEmail: req.user?.email || null, actorRole: req.user?.role || null,
      action: "DISABLE_MARKETING_CAMPAIGN", method: req.method, path: req.originalUrl, routeKey: "PATCH /api/super-admin/marketing-campaigns/:campaignId/status",
      targetType: "MARKETING_CAMPAIGN", targetId: campaignId, statusCode: 200, success: true, requestId: req.requestId || null,
      ipAddress: req.ip || null, userAgent: req.get("user-agent") || null, metadata: { reason, previousActive: campaign.isActive, ownerDataPreserved: true },
    } });
    return updated;
  });
}

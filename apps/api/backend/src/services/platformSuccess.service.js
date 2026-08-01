import { prisma } from "../lib/prisma.js";
import { calculateShopHealth } from "./businessGrowth.service.js";
import { getSellerPlanCatalog } from "./platformPricingCatalog.service.js";

function displayPlan(code) { return String(code || "FREE").toUpperCase() === "PREMIUM" ? "Plus" : String(code || "Free"); }

export async function getPlatformSuccessOverview(now = new Date()) {
  const recentDate = new Date(now.getTime() - 30 * 86_400_000);
  const [shops, sellerCatalog, buyerPlanMix, activeBuyers, savedSearchBuyers, watchlistBuyers, recentTransactions, pendingOffers] = await Promise.all([
    prisma.pawnShop.findMany({
      where: { isDeleted: false },
      select: {
        id: true, name: true, slug: true, address: true, city: true, state: true, zip: true, phone: true,
        description: true, hours: true, onboardingCompletedAt: true, subscriptionPlan: true, subscriptionStatus: true,
        stripeConnectDetailsSubmitted: true, stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true,
        items: { where: { isDeleted: false }, select: { status: true, images: true, description: true, updatedAt: true } },
        marketingCampaigns: { select: { isActive: true, isDefault: true, placementLabel: true, destinationType: true, _count: { select: { scans: true } } } },
        staffMembers: { where: { status: { in: ["INVITED", "ACTIVE"] } }, select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    getSellerPlanCatalog(),
    prisma.buyerSubscription.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.user.count({ where: { role: "CONSUMER", isActive: true } }),
    prisma.savedSearch.groupBy({ by: ["userId"] }),
    prisma.watchlist.groupBy({ by: ["userId"] }),
    prisma.marketplaceTransaction.count({ where: { createdAt: { gte: recentDate } } }),
    prisma.offer.findMany({ where: { status: "PENDING" }, select: { item: { select: { pawnShopId: true } } } }),
  ]);
  const catalog = new Map(sellerCatalog.map((plan) => [String(plan.code).toUpperCase(), plan]));
  const pendingOffersByShop = pendingOffers.reduce((counts, offer) => { const shopId = offer.item.pawnShopId; counts.set(shopId, (counts.get(shopId) || 0) + 1); return counts; }, new Map());
  const rows = shops.map((shop) => {
    const activeItems = shop.items.filter((item) => ["AVAILABLE", "PENDING"].includes(item.status));
    const stale = activeItems.filter((item) => item.updatedAt < new Date(now.getTime() - 90 * 86_400_000)).length;
    const campaigns = shop.marketingCampaigns.filter((campaign) => campaign.isActive);
    const scans = shop.marketingCampaigns.reduce((sum, campaign) => sum + campaign._count.scans, 0);
    const plan = catalog.get(shop.subscriptionPlan) || catalog.get("FREE") || {};
    const limit = plan.maxActiveListings ?? null;
    const nearLimit = limit !== null && limit > 0 && activeItems.length / limit >= 0.8;
    const stripeReady = shop.stripeConnectDetailsSubmitted && shop.stripeConnectChargesEnabled && shop.stripeConnectPayoutsEnabled;
    const health = calculateShopHealth({
      ...shop, addressComplete: Boolean(shop.address && shop.city && shop.state && shop.zip), activeListings: activeItems.length,
      withoutPhotos: activeItems.filter((item) => item.images.length === 0).length,
      shortDescriptions: activeItems.filter((item) => String(item.description || "").trim().length < 40).length,
      staleListings: stale, pendingOffers: pendingOffersByShop.get(shop.id) || 0, defaultCampaign: shop.marketingCampaigns.some((campaign) => campaign.isDefault),
      activeCampaigns: campaigns.length, placementCampaigns: shop.marketingCampaigns.filter((campaign) => campaign.placementLabel).length,
      subscriptionUsable: ["ACTIVE", "TRIALING", "PAST_DUE"].includes(shop.subscriptionStatus), stripeReady,
    });
    const reasons = [];
    if (!shop.onboardingCompletedAt) reasons.push("Onboarding incomplete");
    if (activeItems.length === 0) reasons.push("Zero active inventory");
    if (campaigns.length === 0) reasons.push("No active marketing campaign");
    if (scans === 0) reasons.push("No marketing scans");
    if (!stripeReady) reasons.push("Stripe Connect incomplete");
    if (nearLimit) reasons.push("Near active-listing limit");
    if (health.score < 60) reasons.push("Shop Health below 60");
    return { id: shop.id, name: shop.name, sellerPlan: shop.subscriptionPlan, sellerPlanDisplay: displayPlan(shop.subscriptionPlan), subscriptionStatus: shop.subscriptionStatus, activeListings: activeItems.length, listingLimit: limit, activeCampaigns: campaigns.length, scans, onboardingComplete: Boolean(shop.onboardingCompletedAt), stripeReady, nearListingLimit: nearLimit, shopHealth: { score: health.score, maximum: health.maximum, calculationVersion: health.calculationVersion }, reasons, adminRoute: `/super-admin/shops?shopId=${encodeURIComponent(shop.id)}` };
  });
  const sellerPlanMix = Object.values(rows.reduce((acc, row) => { const key = row.sellerPlan; acc[key] ||= { code: key, displayName: displayPlan(key), count: 0 }; acc[key].count += 1; return acc; }, {}));
  const sum = (predicate) => rows.filter(predicate).length;
  return {
    generatedAt: now.toISOString(),
    metrics: { totalShops: rows.length, liveShops: sum((row) => row.onboardingComplete), shopsWithActiveInventory: sum((row) => row.activeListings > 0), shopsWithZeroActiveInventory: sum((row) => row.activeListings === 0), shopsWithoutActiveQrCampaigns: sum((row) => row.activeCampaigns === 0), shopsWithNoMarketingScans: sum((row) => row.scans === 0), shopsWithIncompleteOnboarding: sum((row) => !row.onboardingComplete), shopsWithIncompleteStripe: sum((row) => !row.stripeReady), shopsNearPlanLimits: sum((row) => row.nearListingLimit), activeBuyers, buyersWithSavedSearches: savedSearchBuyers.length, buyersWithWatchlistItems: watchlistBuyers.length, recentMarketplaceTransactions: recentTransactions },
    marketingAdoption: { shopsWithActiveCampaigns: sum((row) => row.activeCampaigns > 0), activeCampaigns: rows.reduce((total, row) => total + row.activeCampaigns, 0), totalScans: rows.reduce((total, row) => total + row.scans, 0) },
    sellerPlanMix, buyerPlanMix: buyerPlanMix.map((entry) => ({ code: String(entry.plan), displayName: String(entry.plan), count: entry._count._all })),
    actionQueue: rows.filter((row) => row.reasons.length > 0).sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name)),
    privacy: { aggregateOnly: true, growthCenterContactsIncluded: false },
  };
}

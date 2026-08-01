import { prisma } from "../lib/prisma.js";
import { getSellerEntitlementsForShop } from "./sellerPlan.service.js";

export const SHOP_HEALTH_CALCULATION_VERSION = "shop-health-v1.0";
const DAY_MS = 86_400_000;

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function check(id, label, maximum, complete, evidence, action) {
  return { id, label, score: complete ? maximum : 0, maximum, complete, evidence, recommendedAction: complete ? null : action };
}

export function calculateShopHealth(input) {
  const active = asNumber(input.activeListings);
  const checks = {
    storefront: [
      check("description", "Store description", 5, Boolean(input.description), input.description ? "Description added" : "No description", "Add a useful store description."),
      check("address", "Complete address", 5, Boolean(input.address && input.city && input.state && input.zip), input.addressComplete ? "Address complete" : "Address incomplete", "Complete the shop address."),
      check("hours", "Business hours", 5, Boolean(input.hours), input.hours ? "Hours added" : "Hours missing", "Add business hours."),
      check("phone", "Contact phone", 5, Boolean(input.phone), input.phone ? "Phone added" : "Phone missing", "Add a shop phone number."),
      check("storefront", "Published storefront", 5, Boolean(input.slug), input.slug ? "Storefront URL published" : "No storefront slug", "Publish the shop storefront."),
    ],
    inventory: [
      check("active-inventory", "Active inventory", 10, active > 0, `${active} active listings`, "Publish the first active listing."),
      check("photos", "Listing photos", 8, active === 0 || asNumber(input.withoutPhotos) === 0, active === 0 ? "Evaluated after inventory is added" : `${asNumber(input.withoutPhotos)} active listings without photos`, "Add photos to every active listing."),
      check("descriptions", "Useful descriptions", 7, active === 0 || asNumber(input.shortDescriptions) === 0, active === 0 ? "Evaluated after inventory is added" : `${asNumber(input.shortDescriptions)} active listings have short descriptions`, "Expand short listing descriptions to at least 40 characters."),
      check("freshness", "Listing freshness", 5, active === 0 || asNumber(input.staleListings) === 0, active === 0 ? "Evaluated after inventory is added" : `${asNumber(input.staleListings)} active listings are older than 90 days`, "Review or refresh stale active listings."),
    ],
    customerReadiness: [
      check("offers", "Offer response readiness", 8, asNumber(input.pendingOffers) === 0, `${asNumber(input.pendingOffers)} pending offers`, "Respond to pending offers."),
      check("contact", "Customer contact readiness", 7, Boolean(input.phone), input.phone ? "Contact method available" : "No phone available", "Add a customer contact method."),
    ],
    marketing: [
      check("permanent-qr", "Permanent shop QR", 5, Boolean(input.defaultCampaign), input.defaultCampaign ? "Permanent QR exists" : "Permanent QR missing", "Open Marketing Center to create the permanent shop QR."),
      check("active-campaign", "Active marketing campaign", 5, asNumber(input.activeCampaigns) > 0, `${asNumber(input.activeCampaigns)} active campaigns`, "Activate a marketing campaign."),
      check("campaign-setup", "Campaign placement setup", 5, asNumber(input.placementCampaigns) > 0, `${asNumber(input.placementCampaigns)} campaigns have placement labels`, "Add a placement label to a campaign."),
    ],
    operations: [
      check("subscription", "Subscription standing", 5, Boolean(input.subscriptionUsable), input.subscriptionStatus || "Unknown", "Resolve the seller subscription status."),
      check("onboarding", "Shop onboarding", 5, Boolean(input.onboardingCompletedAt), input.onboardingCompletedAt ? "Onboarding complete" : "Onboarding incomplete", "Complete owner onboarding."),
      check("payments", "Payment setup", 5, Boolean(input.stripeReady), input.stripeReady ? "Stripe Connect ready" : "Stripe Connect incomplete", "Complete Stripe Connect onboarding."),
    ],
  };
  const labels = { storefront: "Storefront completeness", inventory: "Inventory quality", customerReadiness: "Customer readiness", marketing: "Marketing setup", operations: "Operations" };
  const components = Object.entries(checks).map(([id, entries]) => ({
    id, label: labels[id], score: entries.reduce((sum, entry) => sum + entry.score, 0),
    maximum: entries.reduce((sum, entry) => sum + entry.maximum, 0), checks: entries,
  }));
  const missingItems = components.flatMap((component) => component.checks.filter((entry) => !entry.complete).map((entry) => ({ component: component.id, check: entry.id, label: entry.label, evidence: entry.evidence })));
  return {
    score: components.reduce((sum, component) => sum + component.score, 0), maximum: 100,
    components, missingItems,
    recommendedActions: components.flatMap((component) => component.checks.filter((entry) => entry.recommendedAction).map((entry) => entry.recommendedAction)),
    calculationVersion: SHOP_HEALTH_CALCULATION_VERSION,
    disclaimer: "Operational guidance only; this is not a credit, compliance, or financial-risk score.",
  };
}

export function calculateResourceUsage(used, limit) {
  return { used, limit, unlimited: limit === null, remaining: limit === null ? null : Math.max(limit - used, 0), atLimit: limit !== null && used >= limit, nearLimit: limit !== null && limit > 0 && used / limit >= 0.8 };
}

export async function getSellerPlanUsage(shopId) {
  const entitlements = await getSellerEntitlementsForShop(shopId);
  const [locations, staff, campaigns] = await Promise.all([
    prisma.pawnShop.count({ where: { ownerId: entitlements.ownerId, isDeleted: false } }),
    prisma.staff.count({ where: { shopId, status: { in: ["INVITED", "ACTIVE"] } } }),
    prisma.shopMarketingCampaign.count({ where: { shopId, isActive: true } }),
  ]);
  return {
    shopId,
    sellerPlan: entitlements.subscription.storedPlan,
    effectivePlan: entitlements.subscription.effectivePlan,
    displayName: entitlements.subscription.label,
    status: entitlements.subscription.status,
    billingPeriod: entitlements.subscription.currentPeriodEnd,
    usage: {
      activeListings: calculateResourceUsage(entitlements.usage.activeListingCount, entitlements.limits.maxActiveListings),
      locations: calculateResourceUsage(locations, entitlements.limits.maxLocations),
      staff: calculateResourceUsage(staff, entitlements.limits.maxStaffUsers),
      activeQrCampaigns: calculateResourceUsage(campaigns, entitlements.limits.qrCampaignLimit),
    },
    limits: entitlements.limits,
    commission: entitlements.billing,
    featureLevels: entitlements.features,
    implementation: entitlements.implementation,
  };
}

export async function getBusinessGrowthOverview(shopId, now = new Date()) {
  const recentDate = new Date(now.getTime() - 30 * DAY_MS);
  const staleDate = new Date(now.getTime() - 90 * DAY_MS);
  const [shop, planUsage] = await Promise.all([
    prisma.pawnShop.findFirst({
      where: { id: shopId, isDeleted: false },
      select: {
        id: true, name: true, slug: true, address: true, city: true, state: true, zip: true,
        phone: true, description: true, hours: true, onboardingCompletedAt: true,
        stripeConnectDetailsSubmitted: true, stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true,
        items: { where: { isDeleted: false }, select: { id: true, status: true, images: true, description: true, category: true, condition: true, createdAt: true, updatedAt: true } },
        marketingCampaigns: { select: { id: true, isActive: true, isDefault: true, placementLabel: true, destinationType: true, _count: { select: { scans: true } } } },
        marketplaceSellerTransactions: { select: { id: true, status: true, subtotal: true, platformFee: true, totalAmount: true, buyerUserId: true, createdAt: true, completedAt: true } },
      },
    }),
    getSellerPlanUsage(shopId),
  ]);
  if (!shop) { const error = new Error("Shop not found."); error.statusCode = 404; throw error; }
  const activeItems = shop.items.filter((item) => ["AVAILABLE", "PENDING"].includes(item.status));
  const soldItems = shop.items.filter((item) => item.status === "SOLD");
  const [pendingOffers, inquiries, auctions] = await Promise.all([
    prisma.offer.count({ where: { item: { pawnShopId: shopId }, status: "PENDING" } }),
    prisma.inquiry.count({ where: { item: { pawnShopId: shopId } } }),
    prisma.auction.count({ where: { shopId } }),
  ]);
  const withoutPhotos = activeItems.filter((item) => item.images.length === 0).length;
  const onePhoto = activeItems.filter((item) => item.images.length === 1).length;
  const shortDescriptions = activeItems.filter((item) => String(item.description || "").trim().length < 40).length;
  const staleListings = activeItems.filter((item) => item.updatedAt < staleDate).length;
  const activeCampaigns = shop.marketingCampaigns.filter((campaign) => campaign.isActive);
  const completedTransactions = shop.marketplaceSellerTransactions.filter((transaction) => transaction.status === "COMPLETED");
  const healthInput = {
    ...shop, addressComplete: Boolean(shop.address && shop.city && shop.state && shop.zip),
    activeListings: activeItems.length, withoutPhotos, shortDescriptions, staleListings, pendingOffers,
    defaultCampaign: shop.marketingCampaigns.some((campaign) => campaign.isDefault), activeCampaigns: activeCampaigns.length,
    placementCampaigns: shop.marketingCampaigns.filter((campaign) => campaign.placementLabel).length,
    subscriptionUsable: ["ACTIVE", "TRIALING", "PAST_DUE"].includes(planUsage.status), subscriptionStatus: planUsage.status,
    stripeReady: shop.stripeConnectDetailsSubmitted && shop.stripeConnectChargesEnabled && shop.stripeConnectPayoutsEnabled,
  };
  const checklist = [
    { id: "storefront", label: "Publish shop storefront", complete: Boolean(shop.slug), route: `/owner/onboarding` },
    { id: "address", label: "Verify shop address", complete: healthInput.addressComplete, route: "/owner/onboarding" },
    { id: "hours", label: "Add store hours", complete: Boolean(shop.hours), route: "/owner/onboarding" },
    { id: "phone", label: "Add a contact method", complete: Boolean(shop.phone), route: "/owner/onboarding" },
    { id: "permanent-qr", label: "Create permanent storefront QR", complete: healthInput.defaultCampaign, route: "/owner/marketing" },
    { id: "campaign", label: "Activate a marketing campaign", complete: activeCampaigns.length > 0, route: "/owner/marketing" },
    { id: "placement", label: "Add a campaign placement label", complete: healthInput.placementCampaigns > 0, route: "/owner/marketing" },
  ];
  const opportunities = [
    { id: "photos", reason: `${withoutPhotos} active listings have no photos.`, action: "Add listing photos", route: "/owner/inventory", priority: "HIGH", complete: withoutPhotos === 0, supportingMetric: withoutPhotos },
    { id: "descriptions", reason: `${shortDescriptions} active listings have descriptions under 40 characters.`, action: "Improve listing descriptions", route: "/owner/inventory", priority: "MEDIUM", complete: shortDescriptions === 0, supportingMetric: shortDescriptions },
    { id: "offers", reason: `${pendingOffers} offers await a response.`, action: "Review pending offers", route: "/offers", priority: "HIGH", complete: pendingOffers === 0, supportingMetric: pendingOffers },
    { id: "marketing", reason: `${activeCampaigns.length} marketing campaigns are active.`, action: "Activate a marketing campaign", route: "/owner/marketing", priority: "MEDIUM", complete: activeCampaigns.length > 0, supportingMetric: activeCampaigns.length },
    { id: "stripe", reason: healthInput.stripeReady ? "Stripe Connect is ready." : "Stripe Connect onboarding is incomplete.", action: "Complete payment onboarding", route: "/owner/finance", priority: "HIGH", complete: healthInput.stripeReady },
    { id: "capacity", reason: planUsage.usage.activeListings.nearLimit ? "Active inventory is at least 80% of the plan limit." : "Listing capacity is available.", action: "Review seller plan", route: "/owner/subscription", priority: "LOW", complete: !planUsage.usage.activeListings.nearLimit, supportingMetric: planUsage.usage.activeListings.used },
  ];
  return {
    generatedAt: now.toISOString(), shop: { id: shop.id, name: shop.name }, planUsage,
    overview: { activeListings: activeItems.length, soldInventory: soldItems.length, inventoryAddedRecently: shop.items.filter((item) => item.createdAt >= recentDate).length, orders: shop.marketplaceSellerTransactions.length, completedSales: completedTransactions.length, pendingOffers, auctions, inquiries, activeQrCampaigns: activeCampaigns.length, qrScans: shop.marketingCampaigns.reduce((sum, campaign) => sum + campaign._count.scans, 0) },
    health: calculateShopHealth(healthInput), marketingChecklist: checklist,
    inventoryInsights: { activeListings: activeItems.length, soldListings: soldItems.length, staleListings, withoutPhotos, onePhoto, shortDescriptions, missingCategory: activeItems.filter((item) => !item.category).length, missingCondition: activeItems.filter((item) => !item.condition).length, recentlyAdded: shop.items.filter((item) => item.createdAt >= recentDate).length },
    customerInsights: { aggregateOnly: true, inquiries, pendingOffers, uniqueCompletedBuyers: new Set(completedTransactions.map((transaction) => transaction.buyerUserId)).size, qrOriginatedVisits: shop.marketingCampaigns.reduce((sum, campaign) => sum + campaign._count.scans, 0), reviews: { available: false, reason: "No authoritative review model is implemented." } },
    revenueSummary: { source: "COMPLETED_MARKETPLACE_TRANSACTIONS", currency: "USD", completedSales: completedTransactions.length, grossSalesCents: Math.round(completedTransactions.reduce((sum, transaction) => sum + asNumber(transaction.subtotal), 0) * 100), platformFeesCents: Math.round(completedTransactions.reduce((sum, transaction) => sum + asNumber(transaction.platformFee), 0) * 100), note: "Settlement and payout balances remain available in the existing Finance Center and are not added here to avoid double counting." },
    opportunities, businessCoach: { mode: "RULE_BASED", calculationVersion: "business-coach-v1.0", recommendations: opportunities.filter((opportunity) => !opportunity.complete).map(({ reason, action, route, priority, supportingMetric }) => ({ statement: reason, action, route, priority, supportingMetric })) },
    unavailable: ["reviews", "followers", "generalPageViews", "conversionAttribution", "benchmarking", "persistentGoals"],
  };
}

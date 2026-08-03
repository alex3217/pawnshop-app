import { prisma } from "../lib/prisma.js";
import { titlesAreComparable } from "./itemPriceComparison.service.js";
import {
  MARKETPLACE_INTELLIGENCE_VERSION, DAY_MS, calculatePlatformHealth, confidenceForSample,
  dateWindow, demandScore, distinctCompletedSales, meanCents, medianCents, normalizeCategory,
  normalizeComparable, normalizeRegion, pricePositionLabel,
} from "./marketplaceIntelligenceMath.js";

const cents = (value) => Math.round(Number(value || 0) * 100);
const publicListingSelect = {
  id: true, itemId: true, title: true, category: true, condition: true, price: true, currency: true,
  images: true, listingType: true, publishedAt: true, createdAt: true,
  sellerShop: { select: { id: true, name: true, slug: true, city: true, state: true, isDeleted: true } },
  seller: { select: { isActive: true } }, item: { select: { status: true, isDeleted: true } },
};

export function isPublicActive(listing) {
  return Number(listing.price) > 0 && listing.seller?.isActive !== false
    && listing.sellerShop?.isDeleted !== true && listing.item?.isDeleted !== true
    && (!listing.item || ["AVAILABLE", "PENDING"].includes(listing.item.status));
}

export function publicListing(row) {
  return {
    id: row.id, itemId: row.itemId, title: row.title, category: row.category, condition: row.condition,
    priceCents: cents(row.price), currency: row.currency, images: row.images, listingType: row.listingType,
    publishedAt: (row.publishedAt ?? row.createdAt)?.toISOString?.() ?? row.publishedAt ?? row.createdAt,
    shop: row.sellerShop ? { id: row.sellerShop.id, name: row.sellerShop.name, slug: row.sellerShop.slug, city: row.sellerShop.city, state: row.sellerShop.state } : null,
  };
}

export function matchComparable(target, candidate) {
  if (candidate.id === target.listingId || candidate.itemId === target.id) return false;
  if (normalizeCategory(candidate.category) !== normalizeCategory(target.category)) return false;
  return titlesAreComparable(target.title, candidate.title);
}

export function saleSummary(rows, listingIds) {
  const allowed = new Set(listingIds);
  const sales = distinctCompletedSales(rows).filter((row) => allowed.has(row.listingId));
  const values = sales.map((row) => cents(row.subtotal)).filter((value) => value > 0);
  const confidence = confidenceForSample(values.length);
  return {
    sampleSize: values.length, confidence, available: confidence.sufficient,
    averageSalePriceCents: meanCents(values), medianSalePriceCents: medianCents(values),
    lowSalePriceCents: values.length ? Math.min(...values) : null, highSalePriceCents: values.length ? Math.max(...values) : null,
    freshestCompletedAt: sales.map((row) => row.completedAt).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] ?? null,
  };
}

export async function getBuyerListingIntelligence(itemId, now = new Date()) {
  const target = await prisma.item.findFirst({
    where: { id: itemId, isDeleted: false, status: { in: ["AVAILABLE", "PENDING"] }, shop: { isDeleted: false } },
    select: { id: true, title: true, category: true, condition: true, price: true, currency: true, pawnShopId: true, createdAt: true, shop: { select: { state: true } }, marketplaceListings: { where: { status: "ACTIVE" }, select: { id: true } } },
  });
  if (!target) { const error = new Error("Eligible public item not found."); error.statusCode = 404; throw error; }
  const window = dateWindow(now, 365);
  const candidates = (await prisma.marketplaceListing.findMany({ where: { status: "ACTIVE", publishedAt: { gte: window.from } }, select: publicListingSelect, take: 500, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] })).filter(isPublicActive);
  const comparableRows = candidates.filter((row) => matchComparable({ ...target, listingId: target.marketplaceListings[0]?.id }, row));
  const completedCandidates = await prisma.marketplaceTransaction.findMany({
    where: { status: "COMPLETED", completedAt: { gte: window.from }, listing: { is: { category: target.category } } },
    select: { id: true, listingId: true, status: true, subtotal: true, completedAt: true, listing: { select: { id: true, itemId: true, title: true, category: true } } },
    take: 500,
  });
  const completedRows = completedCandidates.filter((row) => row.listing && matchComparable({ ...target, listingId: target.marketplaceListings[0]?.id }, row.listing));
  const completedComparableIds = completedRows.map((row) => row.listingId).filter(Boolean);
  const summary = saleSummary(completedRows, completedComparableIds);
  const activeNormalized = comparableRows.map(normalizeComparable);
  const targetRegion = normalizeRegion(target.shop?.state);
  const similar = comparableRows.map((row) => ({ row, normalized: normalizeComparable(row) })).sort((left, right) => {
    const leftRegion = left.normalized.region === targetRegion ? 0 : 1; const rightRegion = right.normalized.region === targetRegion ? 0 : 1;
    const leftCondition = left.normalized.condition === String(target.condition || "").toUpperCase() ? 0 : 1; const rightCondition = right.normalized.condition === String(target.condition || "").toUpperCase() ? 0 : 1;
    return leftRegion - rightRegion || leftCondition - rightCondition || Math.abs(left.normalized.priceCents - cents(target.price)) - Math.abs(right.normalized.priceCents - cents(target.price)) || left.row.id.localeCompare(right.row.id);
  }).slice(0, 12).map(({ row }) => publicListing(row));
  const [watchlists, offers, savedSearches] = await Promise.all([
    prisma.watchlist.count({ where: { item: { category: target.category, isDeleted: false } } }),
    prisma.offer.count({ where: { item: { category: target.category, isDeleted: false }, status: { in: ["PENDING", "ACCEPTED", "COUNTERED"] } } }),
    target.category ? prisma.savedSearch.count({ where: { query: { contains: target.category, mode: "insensitive" } } }) : 0,
  ]);
  const demand = demandScore({ savedSearches, watchlists, offers, completedSales: summary.sampleSize, activeSupply: activeNormalized.length });
  return {
    version: MARKETPLACE_INTELLIGENCE_VERSION, generatedAt: now.toISOString(), calculationPeriod: { from: window.from.toISOString(), to: window.to.toISOString(), days: window.days },
    scope: { itemId: target.id, category: normalizeCategory(target.category), region: targetRegion },
    listingPriceCents: cents(target.price), currency: target.currency, comparableActiveListings: activeNormalized.length,
    completedSales: summary, pricePosition: pricePositionLabel(cents(target.price), completedRows.map((row) => cents(row.subtotal))), demand,
    similarListings: similar, localAvailability: { region: targetRegion, count: activeNormalized.filter((row) => row.region === targetRegion).length },
    priceHistory: { available: false, reason: "PawnLoop does not store authoritative immutable listing-price history." },
    dataSources: ["PUBLIC_ACTIVE_MARKETPLACE_LISTINGS", "COMPLETED_MARKETPLACE_TRANSACTIONS", "AGGREGATE_SAVED_SEARCHES", "AGGREGATE_WATCHLISTS", "AGGREGATE_OFFERS"],
    limitations: ["Brand and model are not authoritative structured fields, so deterministic title compatibility is used.", "No search-event or listing-view history exists.", ...(summary.available ? [] : ["Fewer than three completed comparable sales are available."])],
    disclaimer: "Observed marketplace data only. This is not a guarantee of value, sale likelihood, or investment performance.",
  };
}

export async function getOwnerMarketplaceIntelligence(shopId, level = "basic", now = new Date()) {
  const [items, transactions, offers] = await Promise.all([
    prisma.item.findMany({ where: { pawnShopId: shopId, isDeleted: false }, select: { id: true, title: true, category: true, condition: true, price: true, status: true, images: true, description: true, createdAt: true, updatedAt: true } }),
    prisma.marketplaceTransaction.findMany({ where: { sellerShopId: shopId, status: "COMPLETED" }, select: { id: true, listingId: true, status: true, subtotal: true, completedAt: true, createdAt: true, listing: { select: { category: true, publishedAt: true, createdAt: true } } } }),
    prisma.offer.findMany({ where: { item: { pawnShopId: shopId } }, select: { id: true, status: true, item: { select: { category: true } } } }),
  ]);
  const sales = distinctCompletedSales(transactions); const categories = new Map();
  const ensure = (category) => { const key = normalizeCategory(category); if (!categories.has(key)) categories.set(key, { category: key, activeListings: 0, completedSales: 0, grossSalesCents: 0, salePrices: [], inventoryAges: [], daysToSale: [], offers: 0 }); return categories.get(key); };
  for (const item of items) { const row = ensure(item.category); if (["AVAILABLE", "PENDING"].includes(item.status)) { row.activeListings += 1; row.inventoryAges.push(Math.max(0, Math.floor((now - new Date(item.createdAt)) / DAY_MS))); } }
  for (const sale of sales) { const row = ensure(sale.listing?.category); const value = cents(sale.subtotal); row.completedSales += 1; row.grossSalesCents += value; row.salePrices.push(value); if (sale.completedAt) row.daysToSale.push(Math.max(0, Math.floor((new Date(sale.completedAt) - new Date(sale.listing?.publishedAt ?? sale.listing?.createdAt ?? sale.createdAt)) / DAY_MS))); }
  for (const offer of offers) ensure(offer.item.category).offers += 1;
  const categoryPerformance = [...categories.values()].map((row) => ({
    category: row.category, activeListings: row.activeListings, completedSales: row.completedSales, grossSalesCents: row.grossSalesCents,
    averageSalePriceCents: meanCents(row.salePrices), medianSalePriceCents: medianCents(row.salePrices), averageInventoryAgeDays: meanCents(row.inventoryAges), averageDaysToSale: meanCents(row.daysToSale), offers: row.offers,
    sellThroughPercent: row.activeListings + row.completedSales ? Math.round((row.completedSales * 10_000) / (row.activeListings + row.completedSales)) / 100 : 0,
    confidence: confidenceForSample(row.completedSales), demand: demandScore({ offers: row.offers, completedSales: row.completedSales, activeSupply: row.activeListings }),
  })).sort((a, b) => b.completedSales - a.completedSales || a.category.localeCompare(b.category));
  const active = items.filter((item) => ["AVAILABLE", "PENDING"].includes(item.status));
  const opportunities = categoryPerformance.filter((row) => row.demand.label === "HIGH" && row.activeListings < 3).map((row) => ({ category: row.category, reason: `${row.demand.evidenceCount} aggregate demand signals and ${row.activeListings} active listings.`, confidence: row.confidence.level, suggestedAction: "Review inventory acquisition and pricing for this category.", route: "/owner/inventory" }));
  const advanced = !["basic", "standard"].includes(String(level).toLowerCase());
  return {
    version: MARKETPLACE_INTELLIGENCE_VERSION, generatedAt: now.toISOString(), aggregateOnly: true, shopId,
    access: { level, planLimited: !advanced, limitation: advanced ? null : "Category detail and inventory opportunity cards require an advanced Business Growth entitlement." },
    inventory: { activeListings: active.length, averageAgeDays: meanCents(active.map((item) => Math.floor((now - new Date(item.createdAt)) / DAY_MS))), staleListings: active.filter((item) => now - new Date(item.createdAt) >= 90 * DAY_MS).length },
    sales: { completedSales: sales.length, averageDaysToSale: meanCents(sales.map((sale) => sale.completedAt ? Math.floor((new Date(sale.completedAt) - new Date(sale.listing?.publishedAt ?? sale.createdAt)) / DAY_MS) : 0)), averageSalePriceCents: meanCents(sales.map((sale) => cents(sale.subtotal))), medianSalePriceCents: medianCents(sales.map((sale) => cents(sale.subtotal))) },
    categoryPerformance: advanced ? categoryPerformance : categoryPerformance.map(({ category, activeListings, completedSales }) => ({ category, activeListings, completedSales })),
    fastMovingCategories: categoryPerformance.filter((row) => row.completedSales >= 3).sort((a, b) => (a.averageDaysToSale ?? Infinity) - (b.averageDaysToSale ?? Infinity)).slice(0, 5).map((row) => row.category),
    slowMovingCategories: categoryPerformance.filter((row) => row.activeListings > 0).sort((a, b) => b.averageInventoryAgeDays - a.averageInventoryAgeDays).slice(0, 5).map((row) => row.category),
    inventoryOpportunities: advanced ? opportunities : [],
    limitations: ["No authoritative price-reduction history exists.", "Search events and listing views are unavailable.", "All demand evidence is aggregate; buyer identities and search terms are excluded."],
  };
}

export async function getSuperAdminMarketplaceIntelligence(now = new Date()) {
  const window = dateWindow(now, 90);
  const [listings, transactions, shops, activeBuyers, savedSearchBuyers, watchlistBuyers, savedSearches, watchlists, offers, submissions, campaigns, follows] = await Promise.all([
    prisma.marketplaceListing.findMany({ where: { status: "ACTIVE" }, select: { id: true, category: true, price: true, condition: true, images: true, sellerShopId: true, sellerShop: { select: { id: true, state: true, isDeleted: true } }, seller: { select: { isActive: true } }, item: { select: { isDeleted: true, status: true } } } }),
    prisma.marketplaceTransaction.findMany({
      where: { createdAt: { gte: window.from } },
      select: {
        id: true, listingId: true, status: true, subtotal: true, createdAt: true, completedAt: true, fulfillmentStatus: true,
        listing: { select: { category: true, publishedAt: true, sellerShop: { select: { state: true } } } },
      },
    }),
    prisma.pawnShop.findMany({ where: { isDeleted: false }, select: { id: true, subscriptionStatus: true } }), prisma.user.count({ where: { role: "CONSUMER", isActive: true } }),
    prisma.savedSearch.groupBy({ by: ["userId"] }), prisma.watchlist.groupBy({ by: ["userId"] }), prisma.savedSearch.count(), prisma.watchlist.count(), prisma.offer.count({ where: { createdAt: { gte: window.from } } }),
    prisma.buyerItemSubmission.count({ where: { createdAt: { gte: window.from } } }), prisma.shopMarketingCampaign.groupBy({ by: ["shopId"], where: { isActive: true } }), prisma.shopFollow.count(),
  ]);
  const activeListings = listings.filter(isPublicActive); const sales = distinctCompletedSales(transactions); const activeShopIds = new Set(activeListings.map((row) => row.sellerShopId ?? row.sellerShop?.id).filter(Boolean));
  const categoryMap = new Map(); const category = (value) => { const key = normalizeCategory(value); if (!categoryMap.has(key)) categoryMap.set(key, { category: key, activeListings: 0, completedSales: 0, salePrices: [], grossMerchandiseValueCents: 0 }); return categoryMap.get(key); };
  activeListings.forEach((row) => { category(row.category).activeListings += 1; }); sales.forEach((sale) => { const row = category(sale.listing?.category); const value = cents(sale.subtotal); row.completedSales += 1; row.salePrices.push(value); row.grossMerchandiseValueCents += value; });
  const categories = [...categoryMap.values()].map((row) => ({ ...row, salePrices: undefined, averageSalePriceCents: meanCents(row.salePrices), medianSalePriceCents: medianCents(row.salePrices), sellThroughPercent: row.activeListings + row.completedSales ? Math.round(row.completedSales * 10_000 / (row.activeListings + row.completedSales)) / 100 : 0, confidence: confidenceForSample(row.completedSales), demand: demandScore({ completedSales: row.completedSales, activeSupply: row.activeListings }) })).sort((a, b) => b.completedSales - a.completedSales || a.category.localeCompare(b.category));
  const geographyMap = new Map(); activeListings.forEach((row) => { const region = normalizeRegion(row.sellerShop?.state); geographyMap.set(region, { region, activeListings: (geographyMap.get(region)?.activeListings || 0) + 1, completedSales: geographyMap.get(region)?.completedSales || 0 }); }); sales.forEach((sale) => { const region = normalizeRegion(sale.listing?.sellerShop?.state); geographyMap.set(region, { region, activeListings: geographyMap.get(region)?.activeListings || 0, completedSales: (geographyMap.get(region)?.completedSales || 0) + 1 }); });
  const engagedBuyers = new Set([...savedSearchBuyers.map((row) => row.userId), ...watchlistBuyers.map((row) => row.userId)]).size;
  const health = calculatePlatformHealth({ activeListings: activeListings.length, activeShops: activeShopIds.size, totalShops: shops.length, demandSignals: savedSearches + watchlists + offers + submissions, completedSales: sales.length, activeBuyers, engagedBuyers, shopsWithMarketing: campaigns.length, paidOrLaterTransactions: transactions.filter((row) => ["PAID", "FULFILLING", "COMPLETED"].includes(row.status)).length, usableSubscriptions: shops.filter((shop) => ["ACTIVE", "TRIALING", "PAST_DUE"].includes(shop.subscriptionStatus)).length, completeActiveListings: activeListings.filter((row) => row.category && row.condition && row.images.length && Number(row.price) > 0).length });
  return {
    version: MARKETPLACE_INTELLIGENCE_VERSION, generatedAt: now.toISOString(), calculationPeriod: { from: window.from.toISOString(), to: window.to.toISOString(), days: window.days },
    overview: { activeListings: activeListings.length, completedSales: sales.length, grossMerchandiseValueCents: sales.reduce((sum, row) => sum + cents(row.subtotal), 0), averageOrderValueCents: meanCents(sales.map((row) => cents(row.subtotal))), activeBuyers, activeShops: activeShopIds.size, savedSearches, watchlists, offers, buyerItemSubmissions: submissions, shopFollows: follows },
    categories, geography: [...geographyMap.values()].sort((a, b) => b.activeListings - a.activeListings || a.region.localeCompare(b.region)),
    supplyDemandGaps: categories.filter((row) => row.demand.label !== "INSUFFICIENT_DATA" && row.completedSales > row.activeListings).map((row) => ({ category: row.category, activeListings: row.activeListings, completedSales: row.completedSales, reason: "Recent completed sales exceed current active supply." })),
    pricing: { currency: "USD", averageCompletedSaleCents: meanCents(sales.map((row) => cents(row.subtotal))), medianCompletedSaleCents: medianCents(sales.map((row) => cents(row.subtotal))), sampleSize: sales.length, confidence: confidenceForSample(sales.length) },
    platformHealth: health,
    actionQueue: health.components.filter((row) => row.recommendedAction).map((row) => ({ id: row.id, priority: row.score < row.maximum * 0.4 ? "HIGH" : "MEDIUM", evidence: row.evidence, recommendedAction: row.recommendedAction })),
    privacy: { aggregateOnly: true, buyerIdentitiesIncluded: false, growthCenterContactsIncluded: false, exactCustomerLocationsIncluded: false },
    limitations: ["No authoritative search-event, listing-view, or price-history data exists.", "Geography is aggregated to shop state and does not expose buyer location.", "Auction settlements are not merged into marketplace transaction sales to avoid duplicate counting."],
  };
}

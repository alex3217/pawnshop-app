import { getBuyerListingIntelligence, getSuperAdminMarketplaceIntelligence } from "../services/marketplaceIntelligence.service.js";

export async function getItemMarketplaceIntelligence(req, res) {
  const intelligence = await getBuyerListingIntelligence(req.params.id);
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.json({ success: true, intelligence });
}

export async function getItemSimilarListings(req, res) {
  const intelligence = await getBuyerListingIntelligence(req.params.id);
  return res.json({ success: true, similarListings: intelligence.similarListings, scope: intelligence.scope, generatedAt: intelligence.generatedAt, limitations: intelligence.limitations });
}

export async function getItemComparables(req, res) {
  const intelligence = await getBuyerListingIntelligence(req.params.id);
  return res.json({ success: true, comparables: { activeListingCount: intelligence.comparableActiveListings, completedSales: intelligence.completedSales, pricePosition: intelligence.pricePosition }, generatedAt: intelligence.generatedAt, dataSources: intelligence.dataSources, limitations: intelligence.limitations });
}

export async function getItemPriceHistoryUnavailable(req, res) {
  const intelligence = await getBuyerListingIntelligence(req.params.id);
  return res.json({ success: true, priceHistory: intelligence.priceHistory, generatedAt: intelligence.generatedAt });
}

export async function getSuperAdminMarketplaceIntelligenceController(_req, res) {
  return res.json({ success: true, marketplaceIntelligence: await getSuperAdminMarketplaceIntelligence() });
}

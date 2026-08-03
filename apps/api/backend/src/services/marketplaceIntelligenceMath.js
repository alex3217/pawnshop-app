export const MARKETPLACE_INTELLIGENCE_VERSION = "marketplace-intelligence-v1.0";
export const PLATFORM_HEALTH_VERSION = "platform-health-v1.0";
export const DAY_MS = 86_400_000;

const asFiniteInteger = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function meanCents(values) {
  const cents = values.map(asFiniteInteger);
  return cents.length ? Math.round(cents.reduce((sum, value) => sum + value, 0) / cents.length) : null;
}

export function medianCents(values) {
  if (!values.length) return null;
  const cents = values.map(asFiniteInteger).sort((left, right) => left - right);
  const middle = Math.floor(cents.length / 2);
  return cents.length % 2 ? cents[middle] : Math.round((cents[middle - 1] + cents[middle]) / 2);
}

export function percentChange(previous, current) {
  const base = asFiniteInteger(previous);
  if (base === 0) return null;
  return Math.round(((asFiniteInteger(current) - base) * 10_000) / base) / 100;
}

export function confidenceForSample(sampleSize) {
  const size = Math.max(0, asFiniteInteger(sampleSize));
  if (size < 3) return { level: "INSUFFICIENT", sufficient: false, minimumSampleSize: 3 };
  if (size < 10) return { level: "LOW", sufficient: true, minimumSampleSize: 3 };
  if (size < 30) return { level: "MODERATE", sufficient: true, minimumSampleSize: 3 };
  return { level: "HIGHER", sufficient: true, minimumSampleSize: 3 };
}

export function pricePositionLabel(priceCents, comparableCents) {
  const price = asFiniteInteger(priceCents);
  const values = comparableCents.map(asFiniteInteger).filter((value) => value > 0);
  if (price <= 0 || values.length < 3) return "INSUFFICIENT_COMPARABLE_DATA";
  const low = Math.min(...values);
  const high = Math.max(...values);
  const average = meanCents(values);
  if (price < low) return "BELOW_COMPARABLE_RANGE";
  if (price > high) return "ABOVE_COMPARABLE_RANGE";
  if (Math.abs(price - average) <= Math.max(100, Math.round(average * 0.1))) return "NEAR_COMPARABLE_AVERAGE";
  return price < average ? "BELOW_COMPARABLE_AVERAGE" : "ABOVE_COMPARABLE_AVERAGE";
}

export function normalizeCategory(value) {
  return String(value || "UNCATEGORIZED").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase() || "UNCATEGORIZED";
}

export function normalizeRegion(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  return normalized.length === 2 ? normalized : "UNAVAILABLE";
}

export function dateWindow(now = new Date(), days = 90) {
  const safeDays = clamp(asFiniteInteger(days), 1, 365);
  return { days: safeDays, from: new Date(now.getTime() - safeDays * DAY_MS), to: new Date(now) };
}

export function normalizeComparable(row) {
  const cents = row.priceCents ?? Math.round(Number(row.price || 0) * 100);
  return {
    id: String(row.id), title: String(row.title || ""), category: normalizeCategory(row.category),
    condition: String(row.condition || "").trim().toUpperCase() || "UNAVAILABLE",
    priceCents: asFiniteInteger(cents), region: normalizeRegion(row.state ?? row.sellerShop?.state ?? row.shop?.state),
    createdAt: row.publishedAt ?? row.createdAt ?? null,
  };
}

export function distinctCompletedSales(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (String(row.status) !== "COMPLETED" || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function demandScore({ savedSearches = 0, watchlists = 0, offers = 0, completedSales = 0, submissions = 0, activeSupply = 0 }) {
  const evidenceCount = [savedSearches, watchlists, offers, completedSales, submissions].reduce((sum, value) => sum + Math.max(0, asFiniteInteger(value)), 0);
  if (evidenceCount === 0) return { score: 0, label: "INSUFFICIENT_DATA", evidenceCount };
  const raw = asFiniteInteger(savedSearches) * 2 + asFiniteInteger(watchlists) * 2 + asFiniteInteger(offers) * 3 + asFiniteInteger(completedSales) * 4 + asFiniteInteger(submissions) * 2;
  const score = clamp(Math.round((raw / Math.max(1, asFiniteInteger(activeSupply) + 1)) * 5), 0, 100);
  return { score, label: score >= 65 ? "HIGH" : score >= 30 ? "MODERATE" : "LOW", evidenceCount };
}

function healthComponent(id, label, maximum, numerator, denominator, evidence, action) {
  const ratio = denominator > 0 ? clamp(numerator / denominator, 0, 1) : 0;
  const score = Math.round(maximum * ratio);
  return { id, label, score, maximum, evidence, recommendedAction: score < Math.round(maximum * 0.6) ? action : null };
}

export function calculatePlatformHealth(input) {
  const components = [
    healthComponent("supply", "Marketplace supply", 15, input.activeListings, Math.max(input.activeShops, 1) * 5, `${input.activeListings} active listings across ${input.activeShops} active shops`, "Help active shops publish complete inventory."),
    healthComponent("demand", "Marketplace demand", 15, input.demandSignals, Math.max(input.activeListings, 1), `${input.demandSignals} authoritative aggregate demand signals`, "Improve marketplace discovery and saved-search adoption."),
    healthComponent("transactions", "Transaction activity", 15, input.completedSales, Math.max(input.activeListings, 1) * 0.2, `${input.completedSales} completed marketplace transactions`, "Review categories with supply but no completed sales."),
    healthComponent("shopActivation", "Shop activation", 10, input.activeShops, Math.max(input.totalShops, 1), `${input.activeShops} of ${input.totalShops} shops have active inventory`, "Activate shops with zero inventory."),
    healthComponent("buyerEngagement", "Buyer engagement", 10, input.engagedBuyers, Math.max(input.activeBuyers, 1) * 0.25, `${input.engagedBuyers} buyers use saved searches or watchlists`, "Promote buyer workspace engagement tools."),
    healthComponent("marketing", "Marketing adoption", 10, input.shopsWithMarketing, Math.max(input.totalShops, 1), `${input.shopsWithMarketing} shops have active campaigns`, "Help shops activate measurable campaigns."),
    healthComponent("fulfillment", "Fulfillment health", 10, input.completedSales, Math.max(input.paidOrLaterTransactions, 1), `${input.completedSales} completed of ${input.paidOrLaterTransactions} paid-or-later transactions`, "Review paid transactions awaiting completion."),
    healthComponent("subscription", "Subscription health", 5, input.usableSubscriptions, Math.max(input.totalShops, 1), `${input.usableSubscriptions} shops have usable subscriptions`, "Resolve unusable seller subscriptions."),
    healthComponent("dataQuality", "Data quality", 10, input.completeActiveListings, Math.max(input.activeListings, 1), `${input.completeActiveListings} active listings include category, condition, image, and positive price`, "Improve incomplete active listing data."),
  ];
  return {
    score: components.reduce((sum, component) => sum + component.score, 0), maximum: 100,
    version: PLATFORM_HEALTH_VERSION, components,
    evidence: components.map(({ id, evidence }) => ({ component: id, evidence })),
    recommendedActions: components.filter((component) => component.recommendedAction).map((component) => component.recommendedAction),
    dataLimitations: ["No authoritative search-event or listing-view history exists.", "The score describes observed platform operations; it does not predict valuation, solvency, or future performance."],
  };
}

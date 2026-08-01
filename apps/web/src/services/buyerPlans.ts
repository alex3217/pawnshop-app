import { api } from "./apiClient";

export type BuyerLimitUsage = { used: number; limit: number | null; unlimited: boolean; remaining: number | null; atLimit: boolean };
export type BuyerPlanUsage = {
  success: true;
  subscription: { id: string | null; storedPlan: "FREE" | "PLUS" | "PREMIUM" | "ULTRA"; effectivePlan: "FREE" | "PLUS" | "PREMIUM" | "ULTRA"; displayName: string; status: string; billingInterval: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; isPaid: boolean };
  entitlements: { savedSearchLimit: number | null; wishListLimit: number | null; favoriteLimit: number | null; comparisonLimit: number | null; alertLevel: string; notificationPriority: string; workspaceLevel: string; workspaceCustomizationEnabled: boolean; collectionManagerEnabled: boolean; collectionItemLimit: number | null; marketIntelligenceLevel: string; conciergeEnabled: boolean; supportLevel: string };
  usage: { savedSearches: BuyerLimitUsage; watchlistItems: BuyerLimitUsage; wishLists: BuyerLimitUsage; comparisons: BuyerLimitUsage; collectionItems: BuyerLimitUsage; aiRequests: BuyerLimitUsage; activeAlerts: number; referralRewards: number; loyaltyPoints: number };
  implementation: Record<string, boolean>;
  coreCommerce: Record<string, boolean>;
};
export type BuyerPlanCatalogEntry = { code: string; label: string; monthlyPriceCents: number; yearlyPriceCents: number; maxSavedSearches: number | null; maxWatchlistItems: number | null; features: string[] };

export function getBuyerPlanUsage(signal?: AbortSignal) { return api.get<BuyerPlanUsage>("/buyer-plans/mine/usage", { signal }); }
export function getBuyerPlanCatalog(signal?: AbortSignal) { return api.get<{ success: true; plans: BuyerPlanCatalogEntry[] }>("/buyer-plans", { auth: false, signal }); }
export function formatBuyerLimit(value: number | null) { return value === null ? "Unlimited" : String(value); }

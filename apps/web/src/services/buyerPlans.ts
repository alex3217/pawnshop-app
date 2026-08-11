import { api } from "./apiClient";

export type BuyerLimitUsage = { used: number; limit: number | null; unlimited: boolean; remaining: number | null; atLimit: boolean };
export type BuyerPlanUsage = {
  success: true;
  subscription: { id: string | null; storedPlan: "FREE" | "PLUS" | "PREMIUM" | "ULTRA"; effectivePlan: "FREE" | "PLUS" | "PREMIUM" | "ULTRA"; displayName: string; status: string; billingInterval: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; isPaid: boolean; canManageBilling: boolean; canManageSubscription: boolean };
  entitlements: { savedSearchLimit: number | null; wishListLimit: number | null; favoriteLimit: number | null; comparisonLimit: number | null; alertLevel: string; notificationPriority: string; workspaceLevel: string; workspaceCustomizationEnabled: boolean; collectionManagerEnabled: boolean; collectionItemLimit: number | null; marketIntelligenceLevel: string; conciergeEnabled: boolean; supportLevel: string };
  usage: { savedSearches: BuyerLimitUsage; watchlistItems: BuyerLimitUsage; wishLists: BuyerLimitUsage; comparisons: BuyerLimitUsage; collectionItems: BuyerLimitUsage; aiRequests: BuyerLimitUsage; activeAlerts: number; referralRewards: number; loyaltyPoints: number };
  implementation: Record<string, boolean>;
  coreCommerce: Record<string, boolean>;
};
export type BuyerPlanCatalogEntry = { code: "FREE" | "PLUS" | "PREMIUM" | "ULTRA"; label: string; monthlyPriceCents: number; yearlyPriceCents: number; currency: string; annualSavingsCents: number; buyerFeeBps: number; isPaid: boolean; isFree: boolean; rank: number; monthlyCheckoutConfigured: boolean; yearlyCheckoutConfigured: boolean; unavailableIntervals: ("MONTH" | "YEAR")[]; maxSavedSearches: number | null; maxWatchlistItems: number | null; features: string[] };

export function getBuyerPlanUsage(signal?: AbortSignal) { return api.get<BuyerPlanUsage>("/buyer-plans/mine/usage", { signal }); }
export function getBuyerPlanCatalog(signal?: AbortSignal) { return api.get<{ success: true; plans: BuyerPlanCatalogEntry[] }>("/buyer-plans", { auth: false, signal }); }
export function createBuyerCheckout(planCode: string, billingInterval: "MONTH" | "YEAR") { return api.post<{ success: true; url: string }>("/stripe/checkout/buyer-subscription", { planCode, billingInterval }, { headers: { "Idempotency-Key": crypto.randomUUID() } }); }
export function manageBuyerCancellation(cancel: boolean) { return api.post<{ success: true; pendingWebhookSync: boolean; cancelAtPeriodEnd: boolean }>(cancel ? "/buyer-plans/mine/cancel-at-period-end" : "/buyer-plans/mine/resume", {}); }
export function openBuyerBillingPortal(returnUrl: string) { return api.post<{ success: true; url: string }>("/stripe/billing-portal", { returnUrl }); }
export function formatBuyerLimit(value: number | null) { return value === null ? "Unlimited" : String(value); }

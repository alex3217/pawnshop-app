import { api } from "./apiClient";

export type MetricUsage = { used: number; limit: number | null; unlimited: boolean; remaining: number | null; atLimit: boolean; nearLimit: boolean };
export type GrowthOpportunity = { id: string; reason: string; action: string; route: string; priority: string; complete: boolean; supportingMetric?: number };
export type BusinessGrowth = {
  generatedAt: string;
  shop: { id: string; name: string };
  overview: Record<string, number>;
  health: { score: number; maximum: number; calculationVersion: string; disclaimer: string; components: Array<{ id: string; label: string; score: number; maximum: number; checks: Array<{ id: string; label: string; complete: boolean; evidence: string; recommendedAction: string | null }> }> };
  marketingChecklist: Array<{ id: string; label: string; complete: boolean; route: string }>;
  inventoryInsights: Record<string, number>;
  customerInsights: Record<string, unknown>;
  revenueSummary: { source: string; currency: string; completedSales: number; grossSalesCents: number; platformFeesCents: number; note: string };
  opportunities: GrowthOpportunity[];
  businessCoach: { mode: string; calculationVersion: string; recommendations: Array<{ statement: string; action: string; route: string; priority: string }> };
  planUsage: { displayName: string; sellerPlan: string; status: string; usage: Record<string, MetricUsage>; commission: { commissionBps: number }; featureLevels: Record<string, unknown>; implementation: { implemented: string[]; planned: string[] } };
  marketplaceIntelligence: { version: string; aggregateOnly: boolean; access: { level: string; planLimited: boolean; limitation: string | null }; inventory: Record<string, number | null>; sales: Record<string, number | null>; categoryPerformance: Array<Record<string, unknown>>; fastMovingCategories: string[]; slowMovingCategories: string[]; inventoryOpportunities: Array<{ category: string; reason: string; confidence: string; suggestedAction: string; route: string }>; limitations: string[] };
  unavailable?: string[];
};

export async function getBusinessGrowth(shopId: string, signal?: AbortSignal) {
  const response = await api.get<{ success: true; growth: BusinessGrowth }>(`/shops/${encodeURIComponent(shopId)}/business-growth`, { signal });
  return response.growth;
}

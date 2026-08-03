import { api } from "../../services/apiClient";

export type AdminMarketplaceIntelligence = {
  version: string; generatedAt: string; overview: Record<string, number | null>;
  categories: Array<{ category: string; activeListings: number; completedSales: number; grossMerchandiseValueCents: number; averageSalePriceCents: number | null; medianSalePriceCents: number | null; sellThroughPercent: number; confidence: { level: string }; demand: { label: string } }>;
  geography: Array<{ region: string; activeListings: number; completedSales: number }>;
  supplyDemandGaps: Array<{ category: string; activeListings: number; completedSales: number; reason: string }>;
  pricing: { currency: string; averageCompletedSaleCents: number | null; medianCompletedSaleCents: number | null; sampleSize: number; confidence: { level: string } };
  platformHealth: { score: number; maximum: number; version: string; components: Array<{ id: string; label: string; score: number; maximum: number; evidence: string }>; recommendedActions: string[]; dataLimitations: string[] };
  actionQueue: Array<{ id: string; priority: string; evidence: string; recommendedAction: string }>;
  privacy: Record<string, boolean>; limitations: string[];
};

export async function getAdminMarketplaceIntelligence(signal?: AbortSignal) {
  const response = await api.get<{ success: true; marketplaceIntelligence: AdminMarketplaceIntelligence }>("/super-admin/marketplace-intelligence", { signal });
  return response.marketplaceIntelligence;
}

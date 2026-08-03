import { api } from "../../services/apiClient";

export type PlatformSuccess = {
  generatedAt: string;
  metrics: Record<string, number>;
  marketingAdoption: Record<string, number>;
  sellerPlanMix: Array<{ code: string; displayName: string; count: number }>;
  buyerPlanMix: Array<{ code: string; displayName: string; count: number }>;
  actionQueue: Array<{ id: string; name: string; sellerPlanDisplay: string; subscriptionStatus: string; activeListings: number; listingLimit: number | null; activeCampaigns: number; scans: number; shopHealth: { score: number; maximum: number }; reasons: string[]; adminRoute: string }>;
  privacy: { aggregateOnly: boolean; growthCenterContactsIncluded: boolean };
};

export async function getPlatformSuccess(signal?: AbortSignal) {
  const response = await api.get<{ success: true; platformSuccess: PlatformSuccess }>("/super-admin/platform-success", { signal });
  return response.platformSuccess;
}

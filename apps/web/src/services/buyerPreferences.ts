import { api } from "./apiClient";

export type BuyerPreferences = {
  displayName: string; email: string; phone: string | null; locationLabel: string | null;
  searchRadiusMiles: number; savedSearchNotifications: boolean; priceDropAlerts: boolean;
  auctionAlerts: boolean; followedShopAlerts: boolean; marketingCommunications: boolean;
  recentlyViewedEnabled: boolean; updatedAt: string | null;
};
export type BuyerPreferencePatch = Omit<BuyerPreferences, "email" | "updatedAt">;
export async function getBuyerPreferences(signal?: AbortSignal) { const result = await api.get<{ success: true; preferences: BuyerPreferences }>("/buyer/preferences", { signal }); return result.preferences; }
export async function patchBuyerPreferences(input: BuyerPreferencePatch) { const result = await api.patch<{ success: true; preferences: BuyerPreferences }>("/buyer/preferences", input); return result.preferences; }

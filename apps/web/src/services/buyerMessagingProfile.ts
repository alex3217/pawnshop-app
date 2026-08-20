import { api } from "./apiClient";

export type BuyerMessagingProfile = {
  publicDisplayName: string | null;
  publicMessageIdentifier: string;
  email: string;
  messageDiscoverable: boolean;
  allowShopFirstContact: boolean;
  allowTransactionalMessages: boolean;
  sellerDiscoverable: boolean;
  allowMarketplaceFirstContact: boolean;
  blockedMessagingShops: Array<{ createdAt: string; shop: { id: string; name: string; logoUrl?: string | null; city?: string | null; state?: string | null } }>;
};
export const getBuyerMessagingProfile = (signal?: AbortSignal) => api.get<{ profile: BuyerMessagingProfile }>("/buyer/messaging-profile", { signal });
export const updateBuyerMessagingProfile = (profile: Omit<BuyerMessagingProfile, "email" | "blockedMessagingShops">) => api.patch<{ profile: BuyerMessagingProfile }>("/buyer/messaging-profile", profile);
export const unblockBuyerMessagingShop = (shopId: string) => api.delete(`/buyer/messaging-profile/blocked-shops/${encodeURIComponent(shopId)}`);

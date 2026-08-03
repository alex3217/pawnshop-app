import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";
import { api } from "./apiClient";

export type MarketingDestinationType =
  | "STOREFRONT" | "INVENTORY" | "NEW_ARRIVALS" | "AUCTIONS" | "DEALS"
  | "ITEM" | "CATEGORY" | "SELL_ITEM" | "PAWN_INQUIRY" | "FOLLOW_SHOP"
  | "REVIEW_REQUEST" | "CUSTOMER_REGISTRATION" | "BUYER_REFERRAL" | "PAWNSHOP_REFERRAL";

export type ShopMarketingCampaign = {
  id: string;
  shopId: string;
  name: string;
  shortCode: string;
  destinationType: MarketingDestinationType;
  resourceId: string | null;
  placementLabel: string | null;
  isActive: boolean;
  isDefault: boolean;
  redirectPath: string;
  svgPath: string;
  pngPath: string;
  scanCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CampaignInput = {
  name: string;
  destinationType: MarketingDestinationType;
  resourceId?: string | null;
  placementLabel?: string | null;
  isActive?: boolean;
};

const base = (shopId: string) => `/shops/${encodeURIComponent(shopId)}/marketing/campaigns`;

export function listMarketingCampaigns(shopId: string, signal?: AbortSignal) {
  return api.get<{
    success: true;
    shop: { id: string; name: string; slug: string };
    campaigns: ShopMarketingCampaign[];
  }>(base(shopId), { signal });
}

export function createMarketingCampaign(shopId: string, input: CampaignInput) {
  return api.post<{ success: true; campaign: ShopMarketingCampaign }>(base(shopId), input);
}

export function updateMarketingCampaign(shopId: string, campaignId: string, input: Partial<CampaignInput>) {
  return api.patch<{ success: true; campaign: ShopMarketingCampaign }>(
    `${base(shopId)}/${encodeURIComponent(campaignId)}`,
    input,
  );
}

export function deleteMarketingCampaign(shopId: string, campaignId: string) {
  return api.delete<{ success: true; deleted: true }>(`${base(shopId)}/${encodeURIComponent(campaignId)}`);
}

export async function downloadCampaignQr(path: string, fileName: string) {
  const url = `${API_BASE.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, { headers: getAuthHeaders(false), credentials: "include" });
  if (!response.ok) throw new Error(`QR download failed (${response.status})`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

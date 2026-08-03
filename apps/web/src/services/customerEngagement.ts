import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";
import { api } from "./apiClient";

export type FollowPreferences = { newArrivals: boolean; deals: boolean; auctions: boolean; general: boolean };
export type ShopFollow = { id?: string; following: boolean; paused: boolean; preferences: FollowPreferences; createdAt?: string; updatedAt?: string };
export type FollowedShop = { shop: { id: string; name: string; slug: string | null; city: string | null; state: string | null }; follow: ShopFollow };
export type MarketingTemplate = { type: string; name: string; size: string; cta: string; minimumPlan: string; available: boolean; format: "PDF" };
export type CustomerGrowth = { followers: number; newFollowers: number; unfollows: number; alertPreferences: FollowPreferences; campaigns: number; qrScans: number; messages: number; offers: number; referrals: { links: number; attributedEvents: number; rewardsIssued: number }; recommendations: string[]; privacy: { aggregateOnly: boolean; buyerContactsIncluded: boolean } };

const followBase = (shopId: string) => `/shops/${encodeURIComponent(shopId)}/follow`;
export const getFollowStatus = (shopId: string) => api.get<{ success: true; follow: ShopFollow }>(followBase(shopId));
export const followShop = (shopId: string) => api.post<{ success: true; follow: ShopFollow }>(followBase(shopId));
export const unfollowShop = (shopId: string) => api.delete<{ success: true; follow: ShopFollow }>(followBase(shopId));
export const updateFollowPreferences = (shopId: string, input: Partial<FollowPreferences> & { paused?: boolean }) => api.patch<{ success: true; follow: ShopFollow }>(`${followBase(shopId)}/preferences`, input);
export const getFollowedShops = () => api.get<{ success: true; followedShops: FollowedShop[] }>("/followed-shops");
export const getMarketingTemplates = (shopId: string) => api.get<{ success: true; templates: MarketingTemplate[] }>(`/shops/${encodeURIComponent(shopId)}/marketing/assets/templates`);
export const getCustomerGrowth = (shopId: string) => api.get<{ success: true; growth: CustomerGrowth }>(`/shops/${encodeURIComponent(shopId)}/customer-engagement/growth`);
export const getShopReferrals = (shopId: string) => api.get<{ success: true; referrals: { code: string; link: string; active: boolean; events: Record<string, number>; rewards: { available: false; issued: 0 } } }>(`/shops/${encodeURIComponent(shopId)}/customer-engagement/referrals`);

export async function downloadMarketingAsset(shopId: string, templateType: string, itemId?: string) {
  const query = itemId ? `?itemId=${encodeURIComponent(itemId)}` : "";
  const response = await fetch(`${API_BASE.replace(/\/$/, "")}/shops/${encodeURIComponent(shopId)}/marketing/assets/${encodeURIComponent(templateType)}.pdf${query}`, { credentials: "include", headers: getAuthHeaders(false) });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || `Asset download failed (${response.status})`); }
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `pawnloop-${templateType.toLowerCase()}.pdf`;
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = filename; anchor.click(); URL.revokeObjectURL(objectUrl);
}

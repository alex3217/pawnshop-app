export type RecentlyViewedItem = { itemId: string; title: string; imageUrl: string | null; priceLabel: string | null; shopName: string | null; href: string; viewedAt: string };
export const RECENTLY_VIEWED_KEY: string;
export const RECENTLY_VIEWED_ENABLED_KEY: string;
export const RECENTLY_VIEWED_LIMIT: number;
export function normalizeRecentlyViewedItem(value: unknown): RecentlyViewedItem | null;
export function readRecentlyViewed(storage?: Storage): RecentlyViewedItem[];
export function recentlyViewedEnabled(storage?: Storage): boolean;
export function recordRecentlyViewed(value: unknown, storage?: Storage): RecentlyViewedItem[];
export function clearRecentlyViewed(storage?: Storage): RecentlyViewedItem[];

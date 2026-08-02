export const RECENTLY_VIEWED_KEY = "pawnloop-buyer-recently-viewed-v1";
export const RECENTLY_VIEWED_ENABLED_KEY = "pawnloop-buyer-recently-viewed-enabled-v1";
export const RECENTLY_VIEWED_LIMIT = 12;

const clean = (value, max = 300) => String(value || "").trim().slice(0, max);

export function normalizeRecentlyViewedItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const itemId = clean(value.itemId, 128);
  const title = clean(value.title, 200);
  const href = clean(value.href, 300);
  const viewedAt = clean(value.viewedAt, 40);
  if (!itemId || !title || !href.startsWith("/items/") || Number.isNaN(Date.parse(viewedAt))) return null;
  return {
    itemId, title, href, viewedAt,
    imageUrl: clean(value.imageUrl, 1000) || null,
    priceLabel: clean(value.priceLabel, 80) || null,
    shopName: clean(value.shopName, 160) || null,
  };
}

export function readRecentlyViewed(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(RECENTLY_VIEWED_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRecentlyViewedItem).filter(Boolean).sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt)).slice(0, RECENTLY_VIEWED_LIMIT);
  } catch { return []; }
}

export function recentlyViewedEnabled(storage = globalThis.localStorage) {
  try { return storage.getItem(RECENTLY_VIEWED_ENABLED_KEY) !== "false"; }
  catch { return false; }
}

export function recordRecentlyViewed(value, storage = globalThis.localStorage) {
  if (!recentlyViewedEnabled(storage)) return readRecentlyViewed(storage);
  const item = normalizeRecentlyViewedItem(value);
  if (!item) return readRecentlyViewed(storage);
  const next = [item, ...readRecentlyViewed(storage).filter((entry) => entry.itemId !== item.itemId)].slice(0, RECENTLY_VIEWED_LIMIT);
  try { storage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next)); } catch { /* Browser storage can be unavailable. */ }
  return next;
}

export function clearRecentlyViewed(storage = globalThis.localStorage) {
  try { storage.removeItem(RECENTLY_VIEWED_KEY); } catch { /* Browser storage can be unavailable. */ }
  return [];
}

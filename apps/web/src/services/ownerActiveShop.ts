import { getAuthUser } from "./auth";

const EVENT_NAME = "pawnloop:owner-active-shop-changed";

function storageKey() {
  const userId = getAuthUser()?.id || "anonymous";
  return `pawnloop-owner-active-shop-${userId}`;
}

export function getActiveOwnerShopId() {
  try {
    return window.localStorage.getItem(storageKey()) || "";
  } catch {
    return "";
  }
}

export function setActiveOwnerShopId(shopId: string) {
  const normalized = String(shopId || "").trim();
  try {
    if (normalized) window.localStorage.setItem(storageKey(), normalized);
    else window.localStorage.removeItem(storageKey());
  } catch {
    // The in-page event still synchronizes open owner surfaces.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { shopId: normalized } }));
}

export function selectActiveOwnerShopId(
  shops: Array<{ id: string }>,
  preferredShopId = "",
) {
  const candidates = [preferredShopId, getActiveOwnerShopId()];
  const selected = candidates.find((id) => id && shops.some((shop) => shop.id === id)) || shops[0]?.id || "";
  if (selected !== getActiveOwnerShopId()) setActiveOwnerShopId(selected);
  return selected;
}

export function subscribeToActiveOwnerShop(listener: (shopId: string) => void) {
  const onChange = (event: Event) => listener((event as CustomEvent<{ shopId?: string }>).detail?.shopId || getActiveOwnerShopId());
  window.addEventListener(EVENT_NAME, onChange);
  return () => window.removeEventListener(EVENT_NAME, onChange);
}

export function ownerSetupHref(href: string, shopId: string) {
  if (!shopId) return href;
  const url = new URL(href, window.location.origin);
  url.searchParams.set("shopId", shopId);
  return `${url.pathname}${url.search}${url.hash}`;
}

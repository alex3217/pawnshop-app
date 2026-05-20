import { api } from "./apiClient";

type ApiObject = Record<string, unknown>;

export type BuyerDashboardItem = {
  id: string;
  title: string;
  price: string;
  shop: string;
  distance: string;
  meta: string;
  badge: string;
  action: string;
  href: string;
  x: number;
  y: number;
};

export type BuyerDashboardShop = {
  id: string;
  name: string;
  distance: string;
  inventory: number;
  auctions: number;
  status: string;
  href: string;
};

export type BuyerDashboardAuction = {
  id: string;
  title: string;
  price: string;
  shop: string;
  status: string;
  endsAt: string;
  href: string;
};

export type BuyerDashboardDiscovery = {
  items: BuyerDashboardItem[];
  shops: BuyerDashboardShop[];
  auctions: BuyerDashboardAuction[];
};

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatMoney(value: unknown) {
  const amount = asNumber(value, 0);

  if (!amount) return "Price unavailable";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function normalizeRows(payload: unknown): ApiObject[] {
  if (Array.isArray(payload)) return payload.filter(isObject);

  if (!isObject(payload)) return [];

  const nested = isObject(payload.data) ? payload.data : payload;

  for (const key of ["items", "rows", "data", "shops", "auctions"]) {
    const value = nested[key];
    if (Array.isArray(value)) return value.filter(isObject);
  }

  return [];
}

function itemShopName(item: ApiObject) {
  const shop = isObject(item.shop) ? item.shop : null;
  const pawnShop = isObject(item.pawnShop) ? item.pawnShop : null;

  return asText(shop?.name ?? pawnShop?.name, "Local pawnshop");
}

function itemHref(item: ApiObject) {
  const id = asText(item.id);
  return id ? `/items/${encodeURIComponent(id)}` : "/marketplace";
}

function itemPosition(index: number) {
  const positions = [
    { x: 30, y: 42 },
    { x: 58, y: 34 },
    { x: 68, y: 64 },
    { x: 42, y: 72 },
    { x: 22, y: 63 },
    { x: 75, y: 44 },
    { x: 50, y: 55 },
    { x: 35, y: 28 },
  ];

  return positions[index % positions.length];
}

function mapItem(item: ApiObject, index: number): BuyerDashboardItem {
  const { x, y } = itemPosition(index);
  const title = asText(item.title, "Marketplace item");
  const category = asText(item.category, "General");
  const condition = asText(item.condition, "Condition not listed");
  const status = asText(item.status, "Available");

  return {
    id: asText(item.id, `item-${index}`),
    title,
    price: formatMoney(item.price),
    shop: itemShopName(item),
    distance: "Local",
    meta: `${category} · ${condition}`,
    badge: status,
    action: "View item",
    href: itemHref(item),
    x,
    y,
  };
}

function mapShop(shop: ApiObject, index: number): BuyerDashboardShop {
  const id = asText(shop.id, `shop-${index}`);
  const inventory =
    asNumber(shop.inventoryCount, NaN) ||
    asNumber(shop.itemsCount, NaN) ||
    asNumber(shop.itemCount, NaN) ||
    0;

  const auctions =
    asNumber(shop.auctionsCount, NaN) ||
    asNumber(shop.auctionCount, NaN) ||
    0;

  return {
    id,
    name: asText(shop.name, "Pawnshop"),
    distance: "Local",
    inventory,
    auctions,
    status: asText(shop.status, "Active"),
    href: id ? `/shops/${encodeURIComponent(id)}` : "/shops",
  };
}

function mapAuction(auction: ApiObject, index: number): BuyerDashboardAuction {
  const item = isObject(auction.item) ? auction.item : null;
  const shop = isObject(auction.shop) ? auction.shop : null;
  const id = asText(auction.id, `auction-${index}`);

  return {
    id,
    title: asText(item?.title ?? auction.title, "Auction item"),
    price: formatMoney(auction.currentPrice ?? auction.startingPrice),
    shop: asText(shop?.name, "Local pawnshop"),
    status: asText(auction.status, "LIVE"),
    endsAt: asText(auction.extendedEndsAt ?? auction.endsAt, ""),
    href: id ? `/auctions/${encodeURIComponent(id)}` : "/auctions",
  };
}

export async function getBuyerDashboardDiscovery(
  signal?: AbortSignal,
): Promise<BuyerDashboardDiscovery> {
  const [itemsResult, shopsResult, auctionsResult] = await Promise.allSettled([
    api.get<unknown>("/items?limit=8", { auth: false, signal }),
    api.get<unknown>("/shops?limit=6", { auth: false, signal }),
    api.get<unknown>("/auctions?status=LIVE", { auth: false, signal }),
  ]);

  return {
    items:
      itemsResult.status === "fulfilled"
        ? normalizeRows(itemsResult.value).slice(0, 8).map(mapItem)
        : [],
    shops:
      shopsResult.status === "fulfilled"
        ? normalizeRows(shopsResult.value).slice(0, 6).map(mapShop)
        : [],
    auctions:
      auctionsResult.status === "fulfilled"
        ? normalizeRows(auctionsResult.value).slice(0, 6).map(mapAuction)
        : [],
  };
}

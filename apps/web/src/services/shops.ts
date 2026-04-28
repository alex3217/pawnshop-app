import { api } from "./apiClient";

export type Shop = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
  hours?: string | null;
  ownerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
};

export type ShopItem = {
  id: string;
  pawnShopId: string;
  title: string;
  description?: string | null;
  price: string | number;
  currency?: string;
  images?: string[];
  category?: string | null;
  condition?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
};

export type CreateShopInput = {
  name: string;
  address?: string;
  phone?: string;
  description?: string;
  hours?: string;
};

export function normalizeShops(data: unknown): Shop[] {
  if (Array.isArray(data)) return data as Shop[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.rows)) return record.rows as Shop[];
    if (Array.isArray(record.items)) return record.items as Shop[];
    if (Array.isArray(record.shops)) return record.shops as Shop[];
    if (Array.isArray(record.data)) return record.data as Shop[];

    if (
      record.data &&
      typeof record.data === "object" &&
      Array.isArray((record.data as Record<string, unknown>).shops)
    ) {
      return (record.data as { shops: Shop[] }).shops;
    }
  }

  return [];
}

export async function getAllShops(signal?: AbortSignal): Promise<Shop[]> {
  const data = await api.get<unknown>("/shops", { auth: false, signal });
  return normalizeShops(data);
}

export async function getMarketplaceShops(signal?: AbortSignal): Promise<Shop[]> {
  return getAllShops(signal);
}

export async function getMyShops(signal?: AbortSignal): Promise<Shop[]> {
  const data = await api.get<unknown>("/shops/mine", { signal });
  return normalizeShops(data);
}

export async function createShop(
  input: CreateShopInput,
  signal?: AbortSignal,
): Promise<Shop> {
  return api.post<Shop>(
    "/shops",
    {
      name: input.name,
      address: input.address || undefined,
      phone: input.phone || undefined,
      description: input.description || undefined,
      hours: input.hours || undefined,
    },
    { signal },
  );
}

export async function getShopItems(
  shopId: string,
  signal?: AbortSignal,
): Promise<{ shop: Shop; items: ShopItem[] }> {
  if (!shopId) throw new Error("Missing shop id.");

  const data = await api.get<unknown>(
    `/shops/${encodeURIComponent(shopId)}/items`,
    { auth: false, signal },
  );

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const payload = data as {
      shop?: Shop;
      items?: ShopItem[];
      rows?: ShopItem[];
      data?: ShopItem[];
    };

    return {
      shop: payload.shop as Shop,
      items: Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.rows)
          ? payload.rows
          : Array.isArray(payload.data)
            ? payload.data
            : [],
    };
  }

  return {
    shop: {} as Shop,
    items: Array.isArray(data) ? (data as ShopItem[]) : [],
  };
}

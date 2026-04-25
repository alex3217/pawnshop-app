import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

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

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

function extractError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return fallback;
}

export async function getAllShops(): Promise<Shop[]> {
  const res = await fetch(joinUrl(API_BASE, "/shops"), {
    credentials: "same-origin",
  });

  const data = await parseJson<Shop[] | Record<string, unknown>>(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to load shops (${res.status})`));
  }

  return Array.isArray(data) ? data : [];
}

export async function getMyShops(): Promise<Shop[]> {
  const res = await fetch(joinUrl(API_BASE, "/shops/mine"), {
    headers: getAuthHeaders(),
    credentials: "same-origin",
  });

  const data = await parseJson<Shop[] | Record<string, unknown>>(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to load my shops (${res.status})`));
  }

  return Array.isArray(data) ? data : [];
}

export async function createShop(input: CreateShopInput): Promise<Shop> {
  const res = await fetch(joinUrl(API_BASE, "/shops"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "same-origin",
    body: JSON.stringify({
      name: input.name,
      address: input.address || undefined,
      phone: input.phone || undefined,
      description: input.description || undefined,
      hours: input.hours || undefined,
    }),
  });

  const data = await parseJson<Shop | Record<string, unknown>>(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to create shop (${res.status})`));
  }

  return data as Shop;
}

export async function getShopItems(shopId: string): Promise<{ shop: Shop; items: ShopItem[] }> {
  const res = await fetch(joinUrl(API_BASE, `/shops/${shopId}/items`), {
    credentials: "same-origin",
  });

  const data = await parseJson<{ shop: Shop; items: ShopItem[] } | Record<string, unknown>>(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to load shop items (${res.status})`));
  }

  const payload = data as { shop?: Shop; items?: ShopItem[] };
  return {
    shop: payload.shop as Shop,
    items: Array.isArray(payload.items) ? payload.items : [],
  };
}

export async function getMarketplaceShops(): Promise<Shop[]> {
  return getAllShops();
}

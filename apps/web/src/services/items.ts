import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

export type ItemShop = {
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

export type Item = {
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
  shop?: ItemShop;
};

type PagedItemsResponse = {
  page?: number;
  limit?: number;
  total?: number;
  rows?: Item[];
  items?: Item[];
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

export async function getMarketplaceItems(): Promise<Item[]> {
  const res = await fetch(joinUrl(API_BASE, "/items"), {
    credentials: "same-origin",
  });

  const data = await parseJson<PagedItemsResponse | Item[] | Record<string, unknown>>(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to load marketplace items (${res.status})`));
  }

  if (Array.isArray(data)) return data;
  if (Array.isArray((data as PagedItemsResponse).rows)) return (data as PagedItemsResponse).rows as Item[];
  if (Array.isArray((data as PagedItemsResponse).items)) return (data as PagedItemsResponse).items as Item[];
  return [];
}

export async function getMyItems(): Promise<Item[]> {
  const res = await fetch(joinUrl(API_BASE, "/items/mine"), {
    headers: getAuthHeaders(),
    credentials: "same-origin",
  });

  const data = await parseJson<PagedItemsResponse | Item[] | Record<string, unknown>>(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to load my items (${res.status})`));
  }

  if (Array.isArray(data)) return data;
  if (Array.isArray((data as PagedItemsResponse).rows)) return (data as PagedItemsResponse).rows as Item[];
  if (Array.isArray((data as PagedItemsResponse).items)) return (data as PagedItemsResponse).items as Item[];
  return [];
}

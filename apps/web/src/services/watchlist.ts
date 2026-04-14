import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

export type WatchlistEntry = {
  id: string;
  itemId: string;
  userId?: string;
  createdAt?: string;
  item?: {
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
    shop?: {
      id: string;
      name: string;
      address?: string | null;
      phone?: string | null;
    };
  };
};

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseJson(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function extractError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return fallback;
}

export async function getMyWatchlist(): Promise<WatchlistEntry[]> {
  const res = await fetch(joinUrl(API_BASE, "/watchlist/mine"), {
    headers: getAuthHeaders(),
    credentials: "same-origin",
  });

  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to load watchlist (${res.status})`));
  }

  return Array.isArray(data) ? data : [];
}

export async function addToWatchlist(itemId: string): Promise<WatchlistEntry> {
  const res = await fetch(joinUrl(API_BASE, "/watchlist"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "same-origin",
    body: JSON.stringify({ itemId }),
  });

  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to save item (${res.status})`));
  }

  return data as WatchlistEntry;
}

export async function removeFromWatchlist(itemId: string): Promise<{ success: boolean; itemId: string }> {
  const res = await fetch(joinUrl(API_BASE, `/watchlist/${itemId}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "same-origin",
  });

  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to remove item (${res.status})`));
  }

  return data as { success: boolean; itemId: string };
}

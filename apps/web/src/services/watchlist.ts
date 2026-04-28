import { api } from "./apiClient";

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

function normalizeWatchlist(data: unknown): WatchlistEntry[] {
  if (Array.isArray(data)) return data as WatchlistEntry[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.rows)) return record.rows as WatchlistEntry[];
    if (Array.isArray(record.items)) return record.items as WatchlistEntry[];
    if (Array.isArray(record.watchlist)) return record.watchlist as WatchlistEntry[];
    if (Array.isArray(record.data)) return record.data as WatchlistEntry[];
  }

  return [];
}

export async function getMyWatchlist(): Promise<WatchlistEntry[]> {
  const data = await api.get<unknown>("/watchlist/mine");
  return normalizeWatchlist(data);
}

export async function addToWatchlist(itemId: string): Promise<WatchlistEntry> {
  if (!itemId) throw new Error("Missing item id.");
  return api.post<WatchlistEntry>("/watchlist", { itemId });
}

export async function removeFromWatchlist(
  itemId: string,
): Promise<{ success: boolean; itemId: string }> {
  if (!itemId) throw new Error("Missing item id.");
  return api.delete<{ success: boolean; itemId: string }>(
    `/watchlist/${encodeURIComponent(itemId)}`,
  );
}

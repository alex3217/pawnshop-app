import { api } from "./apiClient";

export type ItemShop = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
};

export type Item = {
  id: string;
  pawnShopId: string;
  title: string;
  description?: string | null;
  price: string | number;
  status: string;

  // REQUIRED FIELDS (fixes your errors)
  category?: string | null;
  condition?: string | null;
  shop?: ItemShop | null;
};

function normalizeItems(data: any): Item[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function getMarketplaceItems(): Promise<Item[]> {
  const data = await api.get("/items", { auth: false });
  return normalizeItems(data);
}

export async function getItemById(id: string): Promise<Item> {
  if (!id) throw new Error("Missing item id.");
  return api.get(`/items/${id}`, { auth: false });
}

export async function getMyItems(): Promise<Item[]> {
  const data = await api.get("/items/mine");
  return normalizeItems(data);
}

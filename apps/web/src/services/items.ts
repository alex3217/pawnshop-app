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
  category?: string | null;
  condition?: string | null;
  images?: string[] | null;
  shop?: ItemShop | null;
};

export type CreateItemInput = {
  pawnShopId: string;
  title: string;
  description?: string;
  price: number;
  images?: string[];
  category: string;
  condition: string;
};

function normalizeItems(data: unknown): Item[] {
  if (Array.isArray(data)) return data as Item[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.rows)) return record.rows as Item[];
    if (Array.isArray(record.items)) return record.items as Item[];
    if (Array.isArray(record.data)) return record.data as Item[];

    if (
      record.data &&
      typeof record.data === "object" &&
      Array.isArray((record.data as Record<string, unknown>).items)
    ) {
      return (record.data as { items: Item[] }).items;
    }
  }

  return [];
}

function unwrapItem(data: unknown): Item {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid item response.");
  }

  const record = data as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object"
    ? (record.data as Record<string, unknown>)
    : null;

  const item =
    record.item ??
    nested?.item ??
    nested ??
    record;

  if (!item || typeof item !== "object") {
    throw new Error("Invalid item response.");
  }

  return item as Item;
}

export async function getMarketplaceItems(signal?: AbortSignal): Promise<Item[]> {
  const data = await api.get<unknown>("/items", { auth: false, signal });
  return normalizeItems(data);
}

export async function getItemById(
  id: string,
  signal?: AbortSignal,
): Promise<Item> {
  if (!id) throw new Error("Missing item id.");
  return api.get<Item>(`/items/${encodeURIComponent(id)}`, {
    auth: false,
    signal,
  });
}

export async function getMyItems(signal?: AbortSignal): Promise<Item[]> {
  const data = await api.get<unknown>("/items/mine", { signal });
  return normalizeItems(data);
}

export async function createItem(
  input: CreateItemInput,
  signal?: AbortSignal,
): Promise<Item> {
  if (!input.pawnShopId) throw new Error("Missing shop id.");
  if (!input.title?.trim()) throw new Error("Missing item title.");
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error("Price must be greater than 0.");
  }

  const data = await api.post<unknown>(
    "/items",
    {
      pawnShopId: input.pawnShopId,
      title: input.title.trim(),
      description: input.description?.trim() || "",
      price: input.price,
      images: input.images || [],
      category: input.category,
      condition: input.condition,
    },
    { signal },
  );

  return unwrapItem(data);
}

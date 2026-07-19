import { api } from "./apiClient";

export type MarketplaceListingType =
  | "CUSTOMER_TO_CUSTOMER"
  | "CUSTOMER_TO_SHOP"
  | "SHOP_TO_CUSTOMER"
  | "SHOP_TO_SHOP";

export type MarketplaceListingStatus =
  | "DRAFT"
  | "ACTIVE"
  | "RESERVED"
  | "SOLD"
  | "PAUSED"
  | "EXPIRED"
  | "CANCELED"
  | "REMOVED";

export type MarketplaceListingUser = {
  id: string;
  name: string;
  role: string;
};

export type MarketplaceListingShop = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  ownerId: string;
};

export type MarketplaceListingItem = {
  id: string;
  title: string;
  status: string;
  pawnShopId: string;
};

export type MarketplaceListing = {
  id: string;
  itemId?: string | null;
  sellerUserId: string;
  sellerShopId?: string | null;
  listingType: MarketplaceListingType;
  status: MarketplaceListingStatus;
  title: string;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  price: number | string;
  currency: string;
  quantity: number;
  images: string[];
  allowOffers: boolean;
  pickupAvailable: boolean;
  shippingAvailable: boolean;
  expiresAt?: string | null;
  featuredUntil?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  seller: MarketplaceListingUser;
  sellerShop?: MarketplaceListingShop | null;
  item?: MarketplaceListingItem | null;
};

export type MarketplaceListingFilters = {
  page?: number;
  limit?: number;
  listingType?: MarketplaceListingType;
  category?: string;
  search?: string;
  sellerShopId?: string;
};

export type MarketplaceListingPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type MarketplaceListingList = {
  rows: MarketplaceListing[];
  pagination: MarketplaceListingPagination;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function numberValue(
  value: unknown,
  fallback: number,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function buildQuery(
  filters: MarketplaceListingFilters = {},
): string {
  const params = new URLSearchParams();

  if (
    Number.isInteger(filters.page) &&
    Number(filters.page) > 0
  ) {
    params.set("page", String(filters.page));
  }

  if (
    Number.isInteger(filters.limit) &&
    Number(filters.limit) > 0
  ) {
    params.set("limit", String(filters.limit));
  }

  if (filters.listingType) {
    params.set("listingType", filters.listingType);
  }

  const category = String(
    filters.category || "",
  ).trim();

  const search = String(
    filters.search || "",
  ).trim();

  const sellerShopId = String(
    filters.sellerShopId || "",
  ).trim();

  if (category) {
    params.set("category", category);
  }

  if (search) {
    params.set("search", search);
  }

  if (sellerShopId) {
    params.set("sellerShopId", sellerShopId);
  }

  const query = params.toString();

  return query
    ? `?${query}`
    : "";
}

function unwrapListingList(
  data: unknown,
): MarketplaceListingList {
  if (!isObject(data)) {
    throw new Error(
      "Invalid marketplace listing response.",
    );
  }

  const nested = isObject(data.data)
    ? data.data
    : null;

  const rows =
    Array.isArray(data.rows)
      ? data.rows
      : nested && Array.isArray(nested.rows)
        ? nested.rows
        : null;

  const paginationValue =
    isObject(data.pagination)
      ? data.pagination
      : nested && isObject(nested.pagination)
        ? nested.pagination
        : {};

  if (!rows) {
    throw new Error(
      "Marketplace listing response is missing rows.",
    );
  }

  return {
    rows:
      rows as MarketplaceListing[],

    pagination: {
      page:
        numberValue(
          paginationValue.page,
          1,
        ),

      limit:
        numberValue(
          paginationValue.limit,
          24,
        ),

      total:
        numberValue(
          paginationValue.total,
          rows.length,
        ),

      totalPages:
        numberValue(
          paginationValue.totalPages,
          0,
        ),
    },
  };
}

function unwrapListing(
  data: unknown,
): MarketplaceListing {
  if (!isObject(data)) {
    throw new Error(
      "Invalid marketplace listing response.",
    );
  }

  const nested = isObject(data.data)
    ? data.data
    : null;

  const listing =
    data.listing ??
    nested?.listing ??
    nested ??
    data;

  if (!isObject(listing)) {
    throw new Error(
      "Marketplace listing response is missing listing data.",
    );
  }

  return listing as MarketplaceListing;
}

export async function getMarketplaceListings(
  filters: MarketplaceListingFilters = {},
): Promise<MarketplaceListingList> {
  const data = await api.get<unknown>(
    `/marketplace-listings${buildQuery(filters)}`,
    {
      auth: false,
    },
  );

  return unwrapListingList(data);
}

export async function getMarketplaceListingById(
  listingId: string,
): Promise<MarketplaceListing> {
  const normalizedId =
    listingId.trim();

  if (!normalizedId) {
    throw new Error(
      "Marketplace listing ID is required.",
    );
  }

  const data = await api.get<unknown>(
    `/marketplace-listings/${encodeURIComponent(normalizedId)}`,
    {
      auth: false,
    },
  );

  return unwrapListing(data);
}

export type MarketplaceSellerListingFilters = {
  status?: MarketplaceListingStatus;
  listingType?: MarketplaceListingType;
};

export type CreateMarketplaceListingInput = {
  listingType: MarketplaceListingType;
  sellerShopId?: string | null;
  itemId?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  price: number;
  currency?: string;
  quantity?: number;
  images?: string[];
  allowOffers?: boolean;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type UpdateMarketplaceListingInput = {
  title?: string;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  price?: number;
  currency?: string;
  quantity?: number;
  images?: string[];
  allowOffers?: boolean;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

function normalizeListingId(
  listingId: string,
): string {
  const normalizedId =
    String(listingId || "").trim();

  if (!normalizedId) {
    throw new Error(
      "Marketplace listing ID is required.",
    );
  }

  return normalizedId;
}

function buildSellerListingQuery(
  filters: MarketplaceSellerListingFilters = {},
): string {
  const params =
    new URLSearchParams();

  if (filters.status) {
    params.set(
      "status",
      filters.status,
    );
  }

  if (filters.listingType) {
    params.set(
      "listingType",
      filters.listingType,
    );
  }

  const query =
    params.toString();

  return query
    ? `?${query}`
    : "";
}

function normalizeCreateListingInput(
  input: CreateMarketplaceListingInput,
): CreateMarketplaceListingInput {
  const title =
    String(input.title || "").trim();

  const price =
    Number(input.price);

  const quantity =
    input.quantity ?? 1;

  if (!title) {
    throw new Error(
      "Marketplace listing title is required.",
    );
  }

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error(
      "Marketplace listing price must be greater than 0.",
    );
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    throw new Error(
      "Marketplace listing quantity must be a positive integer.",
    );
  }

  return {
    ...input,

    title,
    price,
    quantity,

    sellerShopId:
      String(
        input.sellerShopId || "",
      ).trim() || null,

    itemId:
      String(
        input.itemId || "",
      ).trim() || null,

    currency:
      input.currency
        ? input.currency
            .trim()
            .toUpperCase()
        : undefined,
  };
}

function normalizeUpdateListingInput(
  input: UpdateMarketplaceListingInput,
): UpdateMarketplaceListingInput {
  const payload: UpdateMarketplaceListingInput = {
    ...input,
  };

  if (input.title !== undefined) {
    const title =
      input.title.trim();

    if (!title) {
      throw new Error(
        "Marketplace listing title cannot be empty.",
      );
    }

    payload.title =
      title;
  }

  if (input.price !== undefined) {
    const price =
      Number(input.price);

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      throw new Error(
        "Marketplace listing price must be greater than 0.",
      );
    }

    payload.price =
      price;
  }

  if (input.quantity !== undefined) {
    const quantity =
      Number(input.quantity);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error(
        "Marketplace listing quantity must be a positive integer.",
      );
    }

    payload.quantity =
      quantity;
  }

  if (input.currency !== undefined) {
    const currency =
      input.currency
        .trim()
        .toUpperCase();

    if (!currency) {
      throw new Error(
        "Marketplace listing currency cannot be empty.",
      );
    }

    payload.currency =
      currency;
  }

  return payload;
}

async function runMarketplaceListingAction(
  listingId: string,
  action:
    | "publish"
    | "pause"
    | "cancel",
): Promise<MarketplaceListing> {
  const normalizedId =
    normalizeListingId(
      listingId,
    );

  const data =
    await api.post<unknown>(
      `/marketplace-listings/${encodeURIComponent(normalizedId)}/${action}`,
      {},
    );

  return unwrapListing(
    data,
  );
}

export async function getMyMarketplaceListings(
  filters: MarketplaceSellerListingFilters = {},
): Promise<MarketplaceListing[]> {
  const data =
    await api.get<unknown>(
      `/marketplace-listings/mine${buildSellerListingQuery(filters)}`,
    );

  return unwrapListingList(
    data,
  ).rows;
}

export async function createMarketplaceListing(
  input: CreateMarketplaceListingInput,
): Promise<MarketplaceListing> {
  const payload =
    normalizeCreateListingInput(
      input,
    );

  const data =
    await api.post<unknown>(
      "/marketplace-listings",
      payload,
    );

  return unwrapListing(
    data,
  );
}

export async function updateMarketplaceListing(
  listingId: string,
  input: UpdateMarketplaceListingInput,
): Promise<MarketplaceListing> {
  const normalizedId =
    normalizeListingId(
      listingId,
    );

  const payload =
    normalizeUpdateListingInput(
      input,
    );

  const data =
    await api.patch<unknown>(
      `/marketplace-listings/${encodeURIComponent(normalizedId)}`,
      payload,
    );

  return unwrapListing(
    data,
  );
}

export async function publishMarketplaceListing(
  listingId: string,
): Promise<MarketplaceListing> {
  return runMarketplaceListingAction(
    listingId,
    "publish",
  );
}

export async function pauseMarketplaceListing(
  listingId: string,
): Promise<MarketplaceListing> {
  return runMarketplaceListingAction(
    listingId,
    "pause",
  );
}

export async function cancelMarketplaceListing(
  listingId: string,
): Promise<MarketplaceListing> {
  return runMarketplaceListingAction(
    listingId,
    "cancel",
  );
}

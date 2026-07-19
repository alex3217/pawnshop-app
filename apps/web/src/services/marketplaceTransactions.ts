import { api } from "./apiClient";

export type MarketplaceTransactionType =
  | "DIRECT_PURCHASE"
  | "ACCEPTED_OFFER"
  | "DEALER_TRANSFER"
  | "CUSTOMER_SELL_TO_SHOP";

export type MarketplaceTransactionStatus =
  | "PENDING"
  | "PAYMENT_PROCESSING"
  | "PAID"
  | "FULFILLING"
  | "COMPLETED"
  | "CANCELED"
  | "REFUNDED"
  | "DISPUTED";

export type MarketplaceFulfillmentStatus =
  | "PAYMENT_PENDING"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELED";

export type MarketplaceUserSummary = {
  id: string;
  name: string;
  role: string;
};

export type MarketplaceShopSummary = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  ownerId: string;
};

export type MarketplaceListingSummary = {
  id: string;
  itemId?: string | null;
  sellerUserId: string;
  sellerShopId?: string | null;
  listingType: string;
  status: string;
  title: string;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  price: number | string | null;
  currency: string;
  quantity: number;
  images: string[];
  pickupAvailable: boolean;
  shippingAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceTransaction = {
  id: string;
  listingId: string;
  buyerUserId: string;
  buyerShopId?: string | null;
  sellerUserId: string;
  sellerShopId?: string | null;
  type: MarketplaceTransactionType;
  status: MarketplaceTransactionStatus;
  quantity: number;
  subtotal: number | string;
  platformFee: number | string;
  shippingFee: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
  currency: string;
  paymentIntentId?: string | null;
  fulfillmentStatus: MarketplaceFulfillmentStatus;
  completedAt?: string | null;
  canceledAt?: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
  listing: MarketplaceListingSummary;
  buyer: MarketplaceUserSummary;
  buyerShop?: MarketplaceShopSummary | null;
  seller: MarketplaceUserSummary;
  sellerShop?: MarketplaceShopSummary | null;
};

export type MarketplaceTransactionPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type MarketplaceTransactionList = {
  rows: MarketplaceTransaction[];
  pagination: MarketplaceTransactionPagination;
};

export type MarketplaceTransactionFilters = {
  page?: number;
  limit?: number;
  status?: MarketplaceTransactionStatus;
  type?: MarketplaceTransactionType;
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
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function buildQuery(
  filters: MarketplaceTransactionFilters = {},
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

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.type) {
    params.set("type", filters.type);
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

function normalizePagination(
  value: unknown,
): MarketplaceTransactionPagination {
  const pagination = isObject(value)
    ? value
    : {};

  return {
    page: numberValue(pagination.page, 1),
    limit: numberValue(pagination.limit, 25),
    total: numberValue(pagination.total, 0),
    pages: numberValue(pagination.pages, 0),
  };
}

function unwrapTransactionList(
  data: unknown,
): MarketplaceTransactionList {
  if (!isObject(data)) {
    throw new Error(
      "Invalid marketplace transaction list response.",
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

  const pagination =
    isObject(data.pagination)
      ? data.pagination
      : nested && isObject(nested.pagination)
        ? nested.pagination
        : null;

  if (!rows) {
    throw new Error(
      "Marketplace transaction response is missing rows.",
    );
  }

  return {
    rows: rows as MarketplaceTransaction[],
    pagination: normalizePagination(pagination),
  };
}

function unwrapTransaction(
  data: unknown,
): MarketplaceTransaction {
  if (!isObject(data)) {
    throw new Error(
      "Invalid marketplace transaction response.",
    );
  }

  const nested = isObject(data.data)
    ? data.data
    : null;

  const transaction =
    data.transaction ??
    nested?.transaction ??
    nested ??
    data;

  if (!isObject(transaction)) {
    throw new Error(
      "Marketplace transaction response is missing transaction data.",
    );
  }

  return transaction as MarketplaceTransaction;
}

export async function getMyMarketplacePurchases(
  filters: MarketplaceTransactionFilters = {},
): Promise<MarketplaceTransactionList> {
  const data = await api.get<unknown>(
    `/marketplace-transactions/mine/purchases${buildQuery(filters)}`,
  );

  return unwrapTransactionList(data);
}

export async function getMyMarketplaceSales(
  filters: MarketplaceTransactionFilters = {},
): Promise<MarketplaceTransactionList> {
  const data = await api.get<unknown>(
    `/marketplace-transactions/mine/sales${buildQuery(filters)}`,
  );

  return unwrapTransactionList(data);
}

export async function getMarketplaceTransactionById(
  transactionId: string,
): Promise<MarketplaceTransaction> {
  const normalizedId = transactionId.trim();

  if (!normalizedId) {
    throw new Error(
      "Marketplace transaction ID is required.",
    );
  }

  const data = await api.get<unknown>(
    `/marketplace-transactions/${encodeURIComponent(normalizedId)}`,
  );

  return unwrapTransaction(data);
}

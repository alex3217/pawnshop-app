// File: apps/web/src/admin/services/adminApi.ts

import { API_BASE } from "../../config";
import { getAuthHeaders } from "../../services/auth";

type Primitive = string | number | boolean | null | undefined;
type JsonRecord = Record<string, unknown>;
type RequestQueryValue = Primitive | Primitive[];

export type AdminRequestOptions = RequestInit & {
  query?: Record<string, RequestQueryValue>;
  signal?: AbortSignal;
};

export type AdminUserRole =
  | "CONSUMER"
  | "OWNER"
  | "ADMIN"
  | "SUPER_ADMIN"
  | string;

export type AdminAuctionStatus =
  | "SCHEDULED"
  | "LIVE"
  | "ENDED"
  | "CANCELED"
  | string;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type PaginatedResult<T> = {
  rows: T[];
  pagination: PaginationMeta | null;
};

export type AdminUserRow = {
  id: string;
  name?: string | null;
  email: string;
  role: AdminUserRole;
  isBlocked?: boolean;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AdminItemRow = {
  id: string;
  title: string;
  price: string | number;
  currency?: string | null;
  category?: string | null;
  condition?: string | null;
  status?: string | null;
  isDeleted?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  shop?: {
    id?: string;
    name?: string | null;
  } | null;
};

export type AdminShopRow = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
  hours?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  isDeleted?: boolean;
};

export type AdminAuctionRow = {
  id: string;
  itemId?: string | null;
  shopId?: string | null;
  status?: AdminAuctionStatus | null;
  startingPrice?: string | number | null;
  minIncrement?: string | number | null;
  reservePrice?: string | number | null;
  buyItNowPrice?: string | number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  extendedEndsAt?: string | null;
  currentPrice?: string | number | null;
  version?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  item?: {
    id?: string;
    title?: string | null;
    description?: string | null;
    category?: string | null;
    condition?: string | null;
    price?: string | number | null;
    currency?: string | null;
  } | null;
  shop?: {
    id?: string;
    name?: string | null;
  } | null;
};

export type AdminOfferRow = {
  id: string;
  amount?: string | number | null;
  status?: string | null;
  counterAmount?: string | number | null;
  message?: string | null;
  counterMessage?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  item?: {
    id?: string;
    title?: string | null;
    pawnShopId?: string | null;
    shop?: {
      id?: string;
      name?: string | null;
    } | null;
  } | null;
  buyer?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

export type AdminSettlementRow = {
  id: string;
  auctionId?: string | null;
  winnerUserId?: string | null;
  winnerName?: string | null;
  winnerEmail?: string | null;
  finalPrice?: string | number | null;
  finalAmountCents?: number | null;
  currency?: string | null;
  status?: string | null;
  stripePaymentIntent?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  auction?: {
    id?: string | null;
    itemId?: string | null;
    shopId?: string | null;
    status?: string | null;
    endsAt?: string | null;
    item?: {
      id?: string | null;
      title?: string | null;
      category?: string | null;
      condition?: string | null;
    } | null;
    shop?: {
      id?: string | null;
      name?: string | null;
    } | null;
  } | null;
};

export type SellerPlanSummary = {
  code: string;
  label: string;
  rank?: number;
  isPaid?: boolean;
  isFree?: boolean;
  maxActiveListings?: number | null;
  maxLocations?: number | null;
  maxStaffUsers?: number | null;
  canCreateAuctions?: boolean;
  canFeatureListings?: boolean;
  analyticsLevel?: string;
  commissionBps?: number;
  commissionPercent?: number;
  monthlyPriceCents?: number;
  yearlyPriceCents?: number;
  annualSavingsCents?: number;
  features?: string[];
};

export type BuyerPlanSummary = {
  code: string;
  label: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  features: string[];
};

export type BuyerSubscriptionRow = {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  planCode?: string | null;
  status?: string | null;
  billingInterval?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  startedAt?: string | null;
  canceledAt?: string | null;
  trialEndsAt?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  stripeLatestInvoiceId?: string | null;
  stripeCheckoutSessionId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ShopEntitlements = {
  shopId?: string;
  shopName?: string;
  ownerId?: string;
  subscription?: {
    storedPlan?: string;
    effectivePlan?: string;
    status?: string;
    currentPeriodEnd?: string | null;
    isPaid?: boolean;
    isFree?: boolean;
    rank?: number;
    label?: string;
  };
  limits?: {
    maxActiveListings?: number | null;
    maxLocations?: number | null;
    maxStaffUsers?: number | null;
  };
  features?: {
    canCreateAuctions?: boolean;
    canFeatureListings?: boolean;
    analyticsLevel?: string;
  };
  billing?: {
    commissionBps?: number;
    commissionPercent?: number;
    monthlyPriceCents?: number;
    yearlyPriceCents?: number;
    annualSavingsCents?: number;
  };
  usage?: {
    activeListings?: number;
    locations?: number;
    staffUsers?: number;
  };
  plans?: SellerPlanSummary[];
};

export type UpdateShopSubscriptionInput = {
  planCode: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: string | null;
};


export type CreateSuperAdminUserInput = {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "SUPER_ADMIN";
};

export type AdminOverviewData = {
  usersCount: number;
  ownersCount: number;
  consumersCount: number;
  adminsCount: number;
  itemsCount: number;
  shopsCount: number;
  liveAuctionsCount: number;
  endedAuctionsCount: number;
  canceledAuctionsCount: number;
  offersCount: number;
  pendingOffersCount: number;
  acceptedOffersCount: number;
  counteredOffersCount: number;
};

export type SuperAdminOverview = {
  users?: Record<string, number>;
  shops?: Record<string, number>;
  inventory?: Record<string, number>;
  auctions?: Record<string, number>;
  offers?: Record<string, number>;
  settlements?: Record<string, number>;
  subscriptions?: {
    seller?: Record<string, number>;
    buyer?: Record<string, number>;
    projectedTotalMrrCents?: number;
  };
};

export type SuperAdminRevenueSummary = {
  settlements?: {
    totalCount?: number;
    chargedCount?: number;
    chargedGrossCents?: number;
  };
  subscriptions?: {
    projectedSellerMrrCents?: number;
    projectedBuyerMrrCents?: number;
    projectedTotalMrrCents?: number;
  };
};

export type PlatformSettingRow = {
  id?: string;
  key: string;
  value?: string | null;
  updatedByUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PagedListResponse<T> =
  | {
      page?: number;
      limit?: number;
      total?: number;
      pagination?: PaginationMeta;
      rows?: T[];
      items?: T[];
      data?: T[] | { rows?: T[]; items?: T[]; data?: T[] };
      auctions?: T[];
      offers?: T[];
      users?: T[];
      shops?: T[];
      settlements?: T[];
      subscriptions?: T[];
      plans?: T[];
      settings?: T[];
    }
  | T[]
  | null;

function joinUrl(base: string, path: string): string {
  const normalizedBase = String(base || "").replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function appendQuery(
  path: string,
  query?: Record<string, RequestQueryValue>
): string {
  if (!query || Object.keys(query).length === 0) return path;

  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query)) {
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value === null || value === undefined || value === "") continue;
        params.append(key, String(value));
      }
      continue;
    }

    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    params.set(key, String(rawValue));
  }

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: text } as T;
  }
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (!payload || typeof payload !== "object") return payload as T;

  const record = payload as JsonRecord;

  if (record.success === true && "data" in record) return record.data as T;
  if ("payload" in record) return record.payload as T;

  return payload as T;
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;

  const record = data as JsonRecord;

  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }

  if (
    record.data &&
    typeof record.data === "object" &&
    typeof (record.data as JsonRecord).message === "string"
  ) {
    return (record.data as JsonRecord).message as string;
  }

  return fallback;
}

function normalizeRole(role: unknown): string {
  return String(role || "").trim().toUpperCase();
}

function normalizeList<T>(payload: PagedListResponse<T>): T[] {
  const unwrapped = unwrapEnvelope<PagedListResponse<T>>(payload);

  if (!unwrapped) return [];
  if (Array.isArray(unwrapped)) return unwrapped;

  if (Array.isArray(unwrapped.rows)) return unwrapped.rows;
  if (Array.isArray(unwrapped.items)) return unwrapped.items;
  if (Array.isArray(unwrapped.auctions)) return unwrapped.auctions;
  if (Array.isArray(unwrapped.offers)) return unwrapped.offers;
  if (Array.isArray(unwrapped.users)) return unwrapped.users;
  if (Array.isArray(unwrapped.shops)) return unwrapped.shops;
  if (Array.isArray(unwrapped.settlements)) return unwrapped.settlements;
  if (Array.isArray(unwrapped.subscriptions)) return unwrapped.subscriptions;
  if (Array.isArray(unwrapped.plans)) return unwrapped.plans;
  if (Array.isArray(unwrapped.settings)) return unwrapped.settings;
  if (Array.isArray(unwrapped.data)) return unwrapped.data;

  if (unwrapped.data && typeof unwrapped.data === "object") {
    const nested = unwrapped.data as {
      rows?: T[];
      items?: T[];
      data?: T[];
    };

    if (Array.isArray(nested.rows)) return nested.rows;
    if (Array.isArray(nested.items)) return nested.items;
    if (Array.isArray(nested.data)) return nested.data;
  }

  return [];
}

function normalizePaginated<T>(payload: PagedListResponse<T>): PaginatedResult<T> {
  const unwrapped = unwrapEnvelope<PagedListResponse<T>>(payload);

  if (!unwrapped || Array.isArray(unwrapped)) {
    return { rows: Array.isArray(unwrapped) ? unwrapped : [], pagination: null };
  }

  return {
    rows: normalizeList(unwrapped),
    pagination: unwrapped.pagination ?? null,
  };
}

function countByStatus<T extends { status?: string | null }>(
  rows: T[],
  expected: string
): number {
  const target = expected.toUpperCase();
  return rows.filter((row) => String(row.status || "").toUpperCase() === target)
    .length;
}

async function adminRequest<T>(
  path: string,
  options: AdminRequestOptions = {}
): Promise<T> {
  const { query, headers, signal, ...rest } = options;
  const url = joinUrl(API_BASE, appendQuery(path, query));

  const res = await fetch(url, {
    ...rest,
    signal,
    headers: {
      ...getAuthHeaders(),
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    cache: "no-store",
  });

  const parsed = await parseJsonSafe<unknown>(res);

  if (!res.ok) {
    throw new Error(getErrorMessage(parsed, `Admin request failed (${res.status})`));
  }

  return unwrapEnvelope<T>(parsed);
}

function patchJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  return adminRequest<T>(path, {
    method: "PATCH",
    signal,
    body: JSON.stringify(body),
  });
}

export const adminApi = {
  createSuperAdminUser: (
    input: CreateSuperAdminUserInput,
    signal?: AbortSignal
  ) =>
    adminRequest<{ success: boolean; user: AdminUserRow }>(
      "/auth/super-admin/users",
      {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }
    ),

  request: adminRequest,

  getUsers: async (signal?: AbortSignal): Promise<AdminUserRow[]> => {
    const payload = await adminRequest<PagedListResponse<AdminUserRow>>(
      "/admin/users",
      { signal }
    );
    return normalizeList(payload);
  },

  getUsersPaged: async (
    query?: Record<string, RequestQueryValue>,
    signal?: AbortSignal
  ): Promise<PaginatedResult<AdminUserRow>> => {
    const payload = await adminRequest<PagedListResponse<AdminUserRow>>(
      "/super-admin/users",
      { query, signal }
    );
    return normalizePaginated(payload);
  },

  getOwners: async (signal?: AbortSignal): Promise<AdminUserRow[]> => {
    const users = await adminApi.getUsers(signal);
    return users.filter((user) => normalizeRole(user.role) === "OWNER");
  },

  blockUser: (id: string, signal?: AbortSignal) =>
    adminRequest(`/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
    }),

  unblockUser: (id: string, signal?: AbortSignal) =>
    adminRequest(`/admin/users/${encodeURIComponent(id)}/unblock`, {
      method: "PATCH",
      signal,
    }),

  updateSuperAdminUser: (
    id: string,
    input: Partial<Pick<AdminUserRow, "role" | "isActive">>,
    signal?: AbortSignal
  ) =>
    patchJson<{ success: boolean; user: AdminUserRow }>(
      `/super-admin/users/${encodeURIComponent(id)}`,
      input,
      signal
    ),

  getItems: async (signal?: AbortSignal): Promise<AdminItemRow[]> => {
    const payload = await adminRequest<PagedListResponse<AdminItemRow>>(
      "/admin/items",
      { signal }
    );
    return normalizeList(payload);
  },

  softDeleteItem: (id: string, signal?: AbortSignal) =>
    adminRequest(`/admin/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
    }),

  restoreItem: (id: string, signal?: AbortSignal) =>
    adminRequest(`/admin/items/${encodeURIComponent(id)}/restore`, {
      method: "PATCH",
      signal,
    }),

  getShops: async (signal?: AbortSignal): Promise<AdminShopRow[]> => {
    const payload = await adminRequest<PagedListResponse<AdminShopRow>>(
      "/admin/shops",
      { signal }
    );
    return normalizeList(payload);
  },

  getSuperAdminShopsPaged: async (
    query?: Record<string, RequestQueryValue>,
    signal?: AbortSignal
  ): Promise<PaginatedResult<AdminShopRow>> => {
    const payload = await adminRequest<PagedListResponse<AdminShopRow>>(
      "/super-admin/shops",
      { query, signal }
    );
    return normalizePaginated(payload);
  },

  updateSuperAdminShop: (
    id: string,
    input: Partial<AdminShopRow>,
    signal?: AbortSignal
  ) =>
    patchJson<{ success: boolean; shop: AdminShopRow }>(
      `/super-admin/shops/${encodeURIComponent(id)}`,
      input,
      signal
    ),

  softDeleteShop: (id: string, signal?: AbortSignal) =>
    adminRequest(`/admin/shops/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
    }),

  restoreShop: (id: string, signal?: AbortSignal) =>
    adminRequest(`/admin/shops/${encodeURIComponent(id)}/restore`, {
      method: "PATCH",
      signal,
    }),

  getShopEntitlements: (shopId: string, signal?: AbortSignal) =>
    adminRequest<ShopEntitlements>(
      `/shops/${encodeURIComponent(shopId)}/entitlements`,
      { signal }
    ),

  updateShopSubscription: (
    shopId: string,
    input: UpdateShopSubscriptionInput,
    signal?: AbortSignal
  ) =>
    patchJson<ShopEntitlements>(
      `/shops/${encodeURIComponent(shopId)}/subscription`,
      input,
      signal
    ),

  getAuctions: async (
    status?: string,
    signal?: AbortSignal
  ): Promise<AdminAuctionRow[]> => {
    const payload = await adminRequest<PagedListResponse<AdminAuctionRow>>(
      "/auctions",
      {
        query: {
          limit: 50,
          ...(status && status !== "ALL" ? { status } : {}),
        },
        signal,
      }
    );

    return normalizeList(payload);
  },

  getOffers: async (signal?: AbortSignal): Promise<AdminOfferRow[]> => {
    const payload = await adminRequest<PagedListResponse<AdminOfferRow>>(
      "/offers/owner",
      { signal }
    );
    return normalizeList(payload);
  },

  getSettlements: async (
    signal?: AbortSignal
  ): Promise<AdminSettlementRow[]> => {
    const payload = await adminRequest<PagedListResponse<AdminSettlementRow>>(
      "/settlements",
      { signal }
    );
    return normalizeList(payload);
  },

  getSuperAdminSettlementsPaged: async (
    query?: Record<string, RequestQueryValue>,
    signal?: AbortSignal
  ): Promise<PaginatedResult<AdminSettlementRow>> => {
    const payload = await adminRequest<PagedListResponse<AdminSettlementRow>>(
      "/super-admin/settlements",
      { query, signal }
    );
    return normalizePaginated(payload);
  },

  updateSuperAdminSettlement: (
    id: string,
    input: Partial<AdminSettlementRow>,
    signal?: AbortSignal
  ) =>
    patchJson<{ success: boolean; settlement: AdminSettlementRow }>(
      `/super-admin/settlements/${encodeURIComponent(id)}`,
      input,
      signal
    ),

  getSellerPlans: async (signal?: AbortSignal): Promise<SellerPlanSummary[]> => {
    const payload = await adminRequest<PagedListResponse<SellerPlanSummary>>(
      "/super-admin/plans/seller",
      { signal }
    );
    return normalizeList(payload);
  },

  getBuyerPlans: async (signal?: AbortSignal): Promise<BuyerPlanSummary[]> => {
    const payload = await adminRequest<PagedListResponse<BuyerPlanSummary>>(
      "/super-admin/plans/buyer",
      { signal }
    );
    return normalizeList(payload);
  },

  getBuyerSubscriptionsPaged: async (
    query?: Record<string, RequestQueryValue>,
    signal?: AbortSignal
  ): Promise<PaginatedResult<BuyerSubscriptionRow>> => {
    const payload = await adminRequest<PagedListResponse<BuyerSubscriptionRow>>(
      "/super-admin/buyer-subscriptions",
      { query, signal }
    );
    return normalizePaginated(payload);
  },

  updateBuyerSubscription: (
    id: string,
    input: Partial<BuyerSubscriptionRow>,
    signal?: AbortSignal
  ) =>
    patchJson<{ success: boolean; subscription: BuyerSubscriptionRow }>(
      `/super-admin/buyer-subscriptions/${encodeURIComponent(id)}`,
      input,
      signal
    ),

  getSuperAdminOverview: async (
    signal?: AbortSignal
  ): Promise<SuperAdminOverview> => {
    const payload = await adminRequest<{ overview?: SuperAdminOverview }>(
      "/super-admin/overview",
      { signal }
    );
    return payload.overview ?? {};
  },

  getSuperAdminRevenue: async (
    signal?: AbortSignal
  ): Promise<SuperAdminRevenueSummary> => {
    const payload = await adminRequest<{ revenue?: SuperAdminRevenueSummary }>(
      "/super-admin/revenue",
      { signal }
    );
    return payload.revenue ?? {};
  },

  getPlatformSettings: async (
    signal?: AbortSignal
  ): Promise<PlatformSettingRow[]> => {
    const payload = await adminRequest<PagedListResponse<PlatformSettingRow>>(
      "/super-admin/platform-settings",
      { signal }
    );
    return normalizeList(payload);
  },

  updatePlatformSetting: (
    input: { key: string; value: unknown },
    signal?: AbortSignal
  ) =>
    patchJson<{ success: boolean; setting: PlatformSettingRow }>(
      "/super-admin/platform-settings",
      input,
      signal
    ),

  getOverview: async (signal?: AbortSignal): Promise<AdminOverviewData> => {
    const [users, items, shops, auctions, offers] = await Promise.all([
      adminApi.getUsers(signal),
      adminApi.getItems(signal),
      adminApi.getShops(signal),
      adminApi.getAuctions("ALL", signal),
      adminApi.getOffers(signal),
    ]);

    return {
      usersCount: users.length,
      ownersCount: users.filter((user) => normalizeRole(user.role) === "OWNER")
        .length,
      consumersCount: users.filter(
        (user) => normalizeRole(user.role) === "CONSUMER"
      ).length,
      adminsCount: users.filter((user) =>
        ["ADMIN", "SUPER_ADMIN"].includes(normalizeRole(user.role))
      ).length,
      itemsCount: items.length,
      shopsCount: shops.length,
      liveAuctionsCount: countByStatus(auctions, "LIVE"),
      endedAuctionsCount: countByStatus(auctions, "ENDED"),
      canceledAuctionsCount: countByStatus(auctions, "CANCELED"),
      offersCount: offers.length,
      pendingOffersCount: countByStatus(offers, "PENDING"),
      acceptedOffersCount: countByStatus(offers, "ACCEPTED"),
      counteredOffersCount: countByStatus(offers, "COUNTERED"),
    };
  },
};

export default adminApi;
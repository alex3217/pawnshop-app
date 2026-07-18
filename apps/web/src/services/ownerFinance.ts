import { api } from "./apiClient";

export type OwnerFinanceShop = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

export type OwnerFinanceBalance = {
  sellerUserId: string;
  shopId: string;
  currency: string;
  pendingCents: number;
  availableCents: number;
  heldCents: number;
  paidCents: number;
  reversedCents: number;
  totalCents: number;
  entryCount: number;
};

export type OwnerFinanceLedgerEntry = {
  id: string;
  settlementId?: string | null;
  payoutId?: string | null;
  sellerUserId: string;
  shopId: string;
  type:
    | "SETTLEMENT_CREDIT"
    | "PAYOUT_DEBIT"
    | "REFUND_DEBIT"
    | "REVERSAL_CREDIT"
    | "ADJUSTMENT_CREDIT"
    | "ADJUSTMENT_DEBIT";
  status:
    | "PENDING"
    | "AVAILABLE"
    | "HELD"
    | "PAID"
    | "REVERSED";
  amountCents: number;
  currency: string;
  availableAt?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnerFinancePayout = {
  id: string;
  sellerUserId: string;
  shopId: string;
  status:
    | "PENDING"
    | "PROCESSING"
    | "PAID"
    | "FAILED"
    | "CANCELED";
  amountCents: number;
  currency: string;
  provider?: string | null;
  providerPayoutId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  requestedAt: string;
  processingAt?: string | null;
  paidAt?: string | null;
  failedAt?: string | null;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinancePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type FinanceBalanceResponse = {
  success: boolean;
  shop: OwnerFinanceShop & {
    ownerId: string;
  };
  balance: OwnerFinanceBalance;
};

export type FinanceLedgerResponse = {
  success: boolean;
  shop: OwnerFinanceShop & {
    ownerId: string;
  };
  rows: OwnerFinanceLedgerEntry[];
  pagination: FinancePagination;
  filters: {
    type: string | null;
    status: string | null;
    from: string | null;
    to: string | null;
  };
};

export type FinancePayoutResponse = {
  success: boolean;
  shop: OwnerFinanceShop & {
    ownerId: string;
  };
  rows: OwnerFinancePayout[];
  pagination: FinancePagination;
  filters: {
    status: string | null;
    from: string | null;
    to: string | null;
  };
};

export type LedgerQuery = {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  from?: string;
  to?: string;
};

export type PayoutQuery = {
  page?: number;
  limit?: number;
  status?: string;
  from?: string;
  to?: string;
};

function buildQuery(
  params: Record<string, string | number | undefined>,
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

function normalizeFinanceShops(
  payload: unknown,
): OwnerFinanceShop[] {
  if (Array.isArray(payload)) {
    return payload as OwnerFinanceShop[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.shops)) {
    return record.shops as OwnerFinanceShop[];
  }

  if (Array.isArray(record.rows)) {
    return record.rows as OwnerFinanceShop[];
  }

  if (Array.isArray(record.data)) {
    return record.data as OwnerFinanceShop[];
  }

  if (
    record.data &&
    typeof record.data === "object"
  ) {
    const nested = record.data as Record<string, unknown>;

    if (Array.isArray(nested.shops)) {
      return nested.shops as OwnerFinanceShop[];
    }

    if (Array.isArray(nested.rows)) {
      return nested.rows as OwnerFinanceShop[];
    }
  }

  return [];
}

export async function getOwnerFinanceShops(
  signal?: AbortSignal,
) {
  const payload = await api.get<unknown>(
    "/shops/mine",
    { signal },
  );

  return normalizeFinanceShops(payload);
}

export async function getOwnerFinanceBalance(
  shopId: string,
  signal?: AbortSignal,
) {
  if (!shopId) {
    throw new Error("Missing shop id.");
  }

  return api.get<FinanceBalanceResponse>(
    `/shops/${encodeURIComponent(shopId)}/finance/balance`,
    { signal },
  );
}

export async function getOwnerFinanceLedger(
  shopId: string,
  params: LedgerQuery = {},
  signal?: AbortSignal,
) {
  if (!shopId) {
    throw new Error("Missing shop id.");
  }

  const query = buildQuery({
    page: params.page,
    limit: params.limit,
    type: params.type,
    status: params.status,
    from: params.from,
    to: params.to,
  });

  return api.get<FinanceLedgerResponse>(
    `/shops/${encodeURIComponent(shopId)}/finance/ledger${query}`,
    { signal },
  );
}

export async function getOwnerFinancePayouts(
  shopId: string,
  params: PayoutQuery = {},
  signal?: AbortSignal,
) {
  if (!shopId) {
    throw new Error("Missing shop id.");
  }

  const query = buildQuery({
    page: params.page,
    limit: params.limit,
    status: params.status,
    from: params.from,
    to: params.to,
  });

  return api.get<FinancePayoutResponse>(
    `/shops/${encodeURIComponent(shopId)}/finance/payouts${query}`,
    { signal },
  );
}

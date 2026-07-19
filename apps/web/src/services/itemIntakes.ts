import { api } from "./apiClient";

export type ItemIntakeSource =
  | "CAMERA"
  | "HARDWARE_SCANNER"
  | "MANUAL"
  | "FILE_UPLOAD"
  | "API";

export type ItemIntakeDestination =
  | "SHOP_INVENTORY"
  | "CUSTOMER_SELL"
  | "CUSTOMER_PAWN"
  | "CUSTOMER_MARKETPLACE"
  | "DEALER_LISTING"
  | "SHOP_TRANSFER";

export type ItemIntakeStatus =
  | "DRAFT"
  | "SCANNED"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED"
  | "ARCHIVED";

export type ItemIntakeReviewStatus =
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "REJECTED";

export type ItemIntakeCheckStatus =
  | "NOT_CHECKED"
  | "PENDING"
  | "CLEAR"
  | "MATCH_FOUND"
  | "REVIEW_REQUIRED"
  | "FAILED";

export type ItemIntakeOcrStatus =
  | "NOT_REQUESTED"
  | "PENDING"
  | "COMPLETED"
  | "FAILED";

export type ItemIntakeShop = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type ItemIntakeCustomer = {
  id: string;
  name: string;
  email: string;
  role?: string;
  isActive?: boolean;
};

export type ItemIntake = {
  id: string;
  shopId?: string | null;
  capturedByUserId?: string | null;
  customerId?: string | null;

  source: ItemIntakeSource;
  destination: ItemIntakeDestination;
  status: ItemIntakeStatus;

  code?: string | null;
  normalizedCode?: string | null;
  codeType?: string | null;
  barcode?: string | null;
  upc?: string | null;
  ean?: string | null;
  sku?: string | null;
  serialNumber?: string | null;

  title?: string | null;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  estimatedValue?: string | number | null;

  images: string[];
  documentUrls: string[];
  receiptUrls: string[];

  ocrStatus: ItemIntakeOcrStatus;
  ocrText?: string | null;
  ocrData?: unknown;

  duplicateStatus: ItemIntakeCheckStatus;
  duplicateMatches?: unknown;
  screeningStatus: ItemIntakeCheckStatus;
  screeningResult?: unknown;

  reviewMessage?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;

  linkedItemId?: string | null;
  linkedSubmissionId?: string | null;
  linkedMarketplaceListingId?:
    string | null;
  metadata?: unknown;

  createdAt: string;
  updatedAt: string;

  shop?: ItemIntakeShop | null;
  customer?: ItemIntakeCustomer | null;
};

export type ItemIntakeFilters = {
  q?: string;
  shopId?: string;
  status?: ItemIntakeStatus | "ALL";
  destination?: ItemIntakeDestination | "ALL";
  page?: number;
  limit?: number;
};

export type ItemIntakeListResult = {
  rows: ItemIntake[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type ReviewItemIntakeInput = {
  status: ItemIntakeReviewStatus;
  reviewMessage?: string;
};

export type PublishedInventoryItem = {
  id: string;
  pawnShopId: string;
  title: string;
  description?: string | null;
  price: string | number;
  images: string[];
  category?: string | null;
  condition?: string | null;
  status?: string;
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PublishedCustomerSubmission = {
  id: string;
  buyerId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  estimatedValue?: string | number | null;
  images: string[];
  intent: string;
  radiusMiles: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ItemIntakeCustomerSearchResult = {
  rows: ItemIntakeCustomer[];
  total: number;
  query: string;
};

export type PublishItemIntakeResult = {
  intake: ItemIntake;
  item: PublishedInventoryItem | null;
  submission: PublishedCustomerSubmission | null;
  alreadyPublished: boolean;
  reusedExistingItem: boolean;
  reusedExistingSubmission: boolean;
};

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
): number {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }

  return number;
}

function buildItemIntakeQuery(
  filters: ItemIntakeFilters = {},
): string {
  const params = new URLSearchParams();

  const query = String(filters.q || "").trim();
  const shopId = String(filters.shopId || "").trim();

  if (query) {
    params.set("q", query);
  }

  if (shopId) {
    params.set("shopId", shopId);
  }

  if (filters.status && filters.status !== "ALL") {
    params.set("status", filters.status);
  }

  if (
    filters.destination &&
    filters.destination !== "ALL"
  ) {
    params.set("destination", filters.destination);
  }

  if (
    filters.page !== undefined &&
    Number.isInteger(filters.page) &&
    filters.page > 0
  ) {
    params.set("page", String(filters.page));
  }

  if (
    filters.limit !== undefined &&
    Number.isInteger(filters.limit) &&
    filters.limit > 0
  ) {
    params.set("limit", String(filters.limit));
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function unwrapItemIntake(payload: unknown): ItemIntake {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid item intake response.");
  }

  const record = payload as Record<string, unknown>;
  const intake =
    record.data &&
    typeof record.data === "object" &&
    !Array.isArray(record.data)
      ? record.data
      : record;

  if (
    !intake ||
    typeof intake !== "object" ||
    Array.isArray(intake)
  ) {
    throw new Error("Invalid item intake response.");
  }

  return intake as ItemIntake;
}

export async function listItemIntakes(
  filters: ItemIntakeFilters = {},
  signal?: AbortSignal,
): Promise<ItemIntakeListResult> {
  const payload = await api.get<unknown>(
    `/item-intakes${buildItemIntakeQuery(filters)}`,
    { signal },
  );

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return {
      rows: [],
      total: 0,
      page: 1,
      limit: filters.limit || 50,
      pages: 1,
    };
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? (record.rows as ItemIntake[])
    : [];

  return {
    rows,
    total:
      typeof record.total === "number"
        ? record.total
        : rows.length,
    page: normalizePositiveInteger(record.page, 1),
    limit: normalizePositiveInteger(
      record.limit,
      filters.limit || 50,
    ),
    pages: normalizePositiveInteger(record.pages, 1),
  };
}

export async function searchItemIntakeCustomers(
  query: string,
  signal?: AbortSignal,
): Promise<ItemIntakeCustomerSearchResult> {
  const normalizedQuery = String(query || "").trim();

  if (normalizedQuery.length < 2) {
    return {
      rows: [],
      total: 0,
      query: normalizedQuery,
    };
  }

  const payload = await api.get<unknown>(
    `/item-intakes/customers/search?q=${encodeURIComponent(
      normalizedQuery,
    )}`,
    { signal },
  );

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return {
      rows: [],
      total: 0,
      query: normalizedQuery,
    };
  }

  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? (record.rows as ItemIntakeCustomer[])
    : [];

  return {
    rows,
    total:
      typeof record.total === "number"
        ? record.total
        : rows.length,
    query:
      typeof record.query === "string"
        ? record.query
        : normalizedQuery,
  };
}

export async function getItemIntake(
  id: string,
  signal?: AbortSignal,
): Promise<ItemIntake> {
  const intakeId = String(id || "").trim();

  if (!intakeId) {
    throw new Error("Missing item intake ID.");
  }

  const payload = await api.get<unknown>(
    `/item-intakes/${encodeURIComponent(intakeId)}`,
    { signal },
  );

  return unwrapItemIntake(payload);
}

export async function reviewItemIntake(
  id: string,
  input: ReviewItemIntakeInput,
  signal?: AbortSignal,
): Promise<ItemIntake> {
  const intakeId = String(id || "").trim();

  if (!intakeId) {
    throw new Error("Missing item intake ID.");
  }

  const reviewMessage = String(
    input.reviewMessage || "",
  ).trim();

  if (reviewMessage.length > 2000) {
    throw new Error(
      "Review message must be 2000 characters or fewer.",
    );
  }

  const payload = await api.patch<unknown>(
    `/item-intakes/${encodeURIComponent(intakeId)}/review`,
    {
      status: input.status,
      reviewMessage,
    },
    { signal },
  );

  return unwrapItemIntake(payload);
}

export async function archiveItemIntake(
  id: string,
  reviewMessage = "",
  signal?: AbortSignal,
): Promise<ItemIntake> {
  const intakeId = String(id || "").trim();
  const message = String(reviewMessage || "").trim();

  if (!intakeId) {
    throw new Error("Missing item intake ID.");
  }

  if (message.length > 2000) {
    throw new Error(
      "Archive message must be 2000 characters or fewer.",
    );
  }

  const payload = await api.post<unknown>(
    `/item-intakes/${encodeURIComponent(intakeId)}/archive`,
    {
      reviewMessage: message,
    },
    { signal },
  );

  return unwrapItemIntake(payload);
}

export async function publishItemIntake(
  id: string,
  signal?: AbortSignal,
): Promise<PublishItemIntakeResult> {
  const intakeId = String(id || "").trim();

  if (!intakeId) {
    throw new Error("Missing item intake ID.");
  }

  const payload = await api.post<unknown>(
    `/item-intakes/${encodeURIComponent(intakeId)}/publish`,
    {},
    { signal },
  );

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error("Invalid item intake publish response.");
  }

  const record = payload as Record<string, unknown>;
  const item =
    record.item &&
    typeof record.item === "object" &&
    !Array.isArray(record.item)
      ? (record.item as PublishedInventoryItem)
      : null;

  const submission =
    record.submission &&
    typeof record.submission === "object" &&
    !Array.isArray(record.submission)
      ? (record.submission as PublishedCustomerSubmission)
      : null;

  return {
    intake: unwrapItemIntake(payload),
    item,
    submission,
    alreadyPublished: record.alreadyPublished === true,
    reusedExistingItem:
      record.reusedExistingItem === true,
    reusedExistingSubmission:
      record.reusedExistingSubmission === true,
  };
}

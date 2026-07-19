import { api } from "./apiClient";

export type BuyerItemSubmissionIntent =
  | "PAWN_OFFERS"
  | "MARKETPLACE_LISTING"
  | "BOTH"
  | string;

export type BuyerItemSubmissionStatus =
  | "SUBMITTED"
  | "REVIEWING"
  | "OFFERED"
  | "NEEDS_INFO"
  | "ACCEPTED"
  | "REJECTED"
  | "LISTED"
  | "WITHDRAWN"
  | string;

export type BuyerItemSubmission = {
  id: string;
  buyerId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  estimatedValue?: string | number | null;
  images: string[];
  intent: BuyerItemSubmissionIntent;
  radiusMiles: number;
  status: BuyerItemSubmissionStatus;
  reviewMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type BuyerItemSubmissionOffer = {
  id: string;
  submissionId: string;
  shopId: string;
  ownerId: string;
  amount: string | number;
  message?: string | null;
  status: string;
  respondedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  submission?: BuyerItemSubmission;
  shop?: {
    id?: string;
    name?: string;
    address?: string | null;
    phone?: string | null;
  };
};

export type CreateBuyerItemSubmissionInput = {
  title: string;
  description?: string;
  category: string;
  condition: string;
  estimatedValue?: string;
  images: string[];
  intent: BuyerItemSubmissionIntent;
  radiusMiles: number;
};

export type BuyerItemScanDestination =
  | "CUSTOMER_MARKETPLACE"
  | "CUSTOMER_PAWN"
  | "CUSTOMER_SELL";

export type ScanBuyerItemSubmissionInput = {
  code: string;
  destination?: BuyerItemScanDestination;
  intakeSource?:
    | "CAMERA"
    | "HARDWARE_SCANNER"
    | "MANUAL"
    | "FILE_UPLOAD";
  codeType?: string;
  serialNumber?: string;
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  estimatedValue?: string | number;
  price?: string | number;
  images?: string[];
};

export type BuyerItemScanIntake = {
  id: string;
  shopId?: string | null;
  capturedByUserId?: string | null;
  customerId?: string | null;
  source?: string;
  destination?: BuyerItemScanDestination;
  status?: string;
  code?: string | null;
  normalizedCode?: string | null;
  codeType?: string | null;
  barcode?: string | null;
  upc?: string | null;
  ean?: string | null;
  sku?: string | null;
  serialNumber?: string | null;
  duplicateStatus?: string;
  duplicateMatches?: unknown;
  screeningStatus?: string;
  linkedSubmissionId?: string | null;
  createdAt?: string;
};

export type BuyerItemScanResult = {
  success: boolean;
  data: {
    title: string;
    description: string;
    category: string;
    condition: string;
    estimatedValue?: string | null;
    price?: string | null;
    images: string[];
    code: string;
    codeType: string;
    source: "customer-scan";
    destination: BuyerItemScanDestination;
    intakeId: string;
    intakeStatus: string;
    duplicateStatus: string;
    screeningStatus: string;
    reviewRequired: boolean;
  };
  intake: BuyerItemScanIntake;
};

function normalizeSubmissions(data: unknown): BuyerItemSubmission[] {
  if (Array.isArray(data)) return data as BuyerItemSubmission[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    if (Array.isArray(record.submissions)) return record.submissions as BuyerItemSubmission[];
    if (Array.isArray(record.rows)) return record.rows as BuyerItemSubmission[];
    if (Array.isArray(record.items)) return record.items as BuyerItemSubmission[];
    if (Array.isArray(record.data)) return record.data as BuyerItemSubmission[];

    if (
      record.data &&
      typeof record.data === "object" &&
      Array.isArray((record.data as Record<string, unknown>).submissions)
    ) {
      return (record.data as { submissions: BuyerItemSubmission[] }).submissions;
    }
  }

  return [];
}

function normalizeSubmissionOffers(data: unknown): BuyerItemSubmissionOffer[] {
  if (Array.isArray(data)) return data as BuyerItemSubmissionOffer[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    if (Array.isArray(record.offers)) return record.offers as BuyerItemSubmissionOffer[];
    if (Array.isArray(record.rows)) return record.rows as BuyerItemSubmissionOffer[];
    if (Array.isArray(record.items)) return record.items as BuyerItemSubmissionOffer[];
    if (Array.isArray(record.data)) return record.data as BuyerItemSubmissionOffer[];

    if (
      record.data &&
      typeof record.data === "object" &&
      Array.isArray((record.data as Record<string, unknown>).offers)
    ) {
      return (record.data as { offers: BuyerItemSubmissionOffer[] }).offers;
    }
  }

  return [];
}

function unwrapSubmission(data: unknown): BuyerItemSubmission {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid buyer item submission response.");
  }

  const record = data as Record<string, unknown>;
  const nested =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;

  const submission = record.submission ?? nested?.submission ?? nested ?? record;

  if (!submission || typeof submission !== "object") {
    throw new Error("Invalid buyer item submission response.");
  }

  return submission as BuyerItemSubmission;
}

function unwrapSubmissionOffer(data: unknown): BuyerItemSubmissionOffer {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid buyer item submission offer response.");
  }

  const record = data as Record<string, unknown>;
  const nested =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;

  const offer = record.offer ?? nested?.offer ?? nested ?? record;

  if (!offer || typeof offer !== "object") {
    throw new Error("Invalid buyer item submission offer response.");
  }

  return offer as BuyerItemSubmissionOffer;
}

export async function scanBuyerItemSubmission(
  input: ScanBuyerItemSubmissionInput,
  signal?: AbortSignal,
): Promise<BuyerItemScanResult> {
  const code =
    String(
      input.code ||
      "",
    ).trim();

  if (!code) {
    throw new Error(
      "Scan code is required.",
    );
  }

  return api.post<BuyerItemScanResult>(
    "/buyer/item-submissions/scan",
    {
      ...input,
      code,
      destination:
        input.destination ||
        "CUSTOMER_MARKETPLACE",
    },
    {
      signal,
    },
  );
}

export async function createBuyerItemSubmission(
  input: CreateBuyerItemSubmissionInput,
  signal?: AbortSignal,
): Promise<BuyerItemSubmission> {
  if (!input.title.trim()) throw new Error("Title is required.");
  if (!input.category.trim()) throw new Error("Category is required.");
  if (!input.condition.trim()) throw new Error("Condition is required.");
  if (!input.images.length) throw new Error("At least one photo is required.");

  const data = await api.post<unknown>("/buyer/item-submissions", input, {
    signal,
  });

  return unwrapSubmission(data);
}

export async function getMyBuyerItemSubmissions(
  signal?: AbortSignal,
): Promise<BuyerItemSubmission[]> {
  const data = await api.get<unknown>("/buyer/item-submissions/mine", {
    signal,
  });

  return normalizeSubmissions(data);
}

export async function withdrawBuyerItemSubmission(
  id: string,
  signal?: AbortSignal,
): Promise<BuyerItemSubmission> {
  if (!id) throw new Error("Missing submission id.");

  const data = await api.patch<unknown>(
    `/buyer/item-submissions/${encodeURIComponent(id)}/withdraw`,
    {},
    { signal },
  );

  return unwrapSubmission(data);
}

export async function getMyBuyerItemSubmissionOffers(
  signal?: AbortSignal,
): Promise<BuyerItemSubmissionOffer[]> {
  const data = await api.get<unknown>("/buyer/item-submissions/offers/mine", {
    signal,
  });

  return normalizeSubmissionOffers(data);
}

export async function acceptBuyerItemSubmissionOffer(
  offerId: string,
  signal?: AbortSignal,
): Promise<BuyerItemSubmissionOffer> {
  if (!offerId) throw new Error("Missing offer id.");

  const data = await api.patch<unknown>(
    `/buyer/item-submissions/offers/${encodeURIComponent(offerId)}/accept`,
    {},
    { signal },
  );

  return unwrapSubmissionOffer(data);
}

export async function rejectBuyerItemSubmissionOffer(
  offerId: string,
  signal?: AbortSignal,
): Promise<BuyerItemSubmissionOffer> {
  if (!offerId) throw new Error("Missing offer id.");

  const data = await api.patch<unknown>(
    `/buyer/item-submissions/offers/${encodeURIComponent(offerId)}/reject`,
    {},
    { signal },
  );

  return unwrapSubmissionOffer(data);
}

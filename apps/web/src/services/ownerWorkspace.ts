// File: apps/web/src/services/ownerWorkspace.ts

import { api } from "./apiClient";

export type CreateSubscriptionCheckoutInput = {
  shopId: string;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
};

export type UpdateShopSubscriptionInput = {
  plan?: string;
  planCode?: string;
  status?: string;
  subscriptionStatus?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
};

export type CheckoutSessionResponse = {
  success?: boolean;
  url?: string;
  sessionId?: string;
  customerId?: string;
  planCode?: string;
};

export type OwnerBuyerItemSubmission = {
  id: string;
  buyerId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  condition?: string | null;
  estimatedValue?: string | number | null;
  images?: string[];
  intent?: string;
  radiusMiles?: number;
  status: string;
  reviewMessage?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  createdAt?: string;
  updatedAt?: string;
  buyer?: {
    id?: string;
    name?: string;
    email?: string;
  };
};

export type ReviewBuyerItemSubmissionInput = {
  status: "REVIEWING" | "OFFERED" | "REJECTED" | "NEEDS_INFO";
  reviewMessage?: string;
};

export type CreateBuyerItemSubmissionOfferInput = {
  shopId: string;
  amount: string | number;
  message?: string;
};

export type OwnerBuyerItemSubmissionOffer = {
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
};

function normalizeOwnerBuyerItemSubmissions(
  data: unknown,
): OwnerBuyerItemSubmission[] {
  if (Array.isArray(data)) return data as OwnerBuyerItemSubmission[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    if (Array.isArray(record.submissions)) {
      return record.submissions as OwnerBuyerItemSubmission[];
    }

    if (Array.isArray(record.rows)) {
      return record.rows as OwnerBuyerItemSubmission[];
    }

    if (Array.isArray(record.items)) {
      return record.items as OwnerBuyerItemSubmission[];
    }

    if (Array.isArray(record.data)) {
      return record.data as OwnerBuyerItemSubmission[];
    }

    if (
      record.data &&
      typeof record.data === "object" &&
      Array.isArray((record.data as Record<string, unknown>).submissions)
    ) {
      return (record.data as { submissions: OwnerBuyerItemSubmission[] })
        .submissions;
    }
  }

  return [];
}

function unwrapOwnerBuyerItemSubmission(data: unknown): OwnerBuyerItemSubmission {
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

  return submission as OwnerBuyerItemSubmission;
}

function unwrapOwnerBuyerItemSubmissionOffer(
  data: unknown,
): OwnerBuyerItemSubmissionOffer {
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

  return offer as OwnerBuyerItemSubmissionOffer;
}

export async function getSellerPlans(signal?: AbortSignal): Promise<unknown> {
  return api.get<unknown>("/seller-plans", { signal });
}

export async function getOwnerShops(signal?: AbortSignal): Promise<unknown> {
  return api.get<unknown>("/shops/mine", { signal });
}

export async function getOwnerItems(signal?: AbortSignal): Promise<unknown> {
  return api.get<unknown>("/items/mine", { signal });
}

export async function getShopEntitlements(
  shopId: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!shopId) throw new Error("Missing shop id.");

  return api.get<unknown>(`/shops/${encodeURIComponent(shopId)}/entitlements`, {
    signal,
  });
}

export async function createSubscriptionCheckoutSession(
  input: CreateSubscriptionCheckoutInput,
  signal?: AbortSignal,
): Promise<CheckoutSessionResponse> {
  if (!input.shopId) throw new Error("Missing shop id.");
  if (!input.planCode) throw new Error("Missing plan code.");
  if (!input.successUrl) throw new Error("Missing success URL.");
  if (!input.cancelUrl) throw new Error("Missing cancel URL.");

  return api.post<CheckoutSessionResponse>(
    "/stripe/checkout/subscription",
    input,
    { signal },
  );
}

export async function updateShopSubscription(
  shopId: string,
  input: UpdateShopSubscriptionInput,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!shopId) throw new Error("Missing shop id.");

  return api.patch<unknown>(
    `/shops/${encodeURIComponent(shopId)}/subscription`,
    input,
    { signal },
  );
}

export async function getOwnerBuyerItemSubmissions(
  signal?: AbortSignal,
): Promise<OwnerBuyerItemSubmission[]> {
  const data = await api.get<unknown>("/buyer/item-submissions/owner", {
    signal,
  });

  return normalizeOwnerBuyerItemSubmissions(data);
}

export async function reviewBuyerItemSubmission(
  id: string,
  input: ReviewBuyerItemSubmissionInput,
  signal?: AbortSignal,
): Promise<OwnerBuyerItemSubmission> {
  if (!id) throw new Error("Missing submission id.");

  const data = await api.patch<unknown>(
    `/buyer/item-submissions/${encodeURIComponent(id)}/review`,
    input,
    { signal },
  );

  return unwrapOwnerBuyerItemSubmission(data);
}

export async function createOwnerBuyerItemSubmissionOffer(
  submissionId: string,
  input: CreateBuyerItemSubmissionOfferInput,
  signal?: AbortSignal,
): Promise<OwnerBuyerItemSubmissionOffer> {
  if (!submissionId) throw new Error("Missing submission id.");
  if (!input.shopId) throw new Error("Select a shop first.");
  if (!input.amount) throw new Error("Offer amount is required.");

  const data = await api.post<unknown>(
    `/buyer/item-submissions/${encodeURIComponent(submissionId)}/offers`,
    input,
    { signal },
  );

  return unwrapOwnerBuyerItemSubmissionOffer(data);
}

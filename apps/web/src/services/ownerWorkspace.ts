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

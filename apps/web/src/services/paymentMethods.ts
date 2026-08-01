import { api } from "./apiClient";
export type SafePaymentMethod = { id: string; type: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null; funding: string | null; default: boolean; expired: boolean; status: string };
export type PaymentMethodsResponse = { success: boolean; methods: SafePaymentMethod[]; defaultPaymentMethodId: string | null; syncStatus: string };
const query = (shopId?: string | null) => shopId ? `?shopId=${encodeURIComponent(shopId)}` : "";
export const paymentMethodsApi = {
  list: (shopId?: string | null) => api.get<PaymentMethodsResponse>(`/stripe/payment-methods${query(shopId)}`),
  setup: (input: { shopId?: string | null; successUrl: string; cancelUrl: string; consent: { accepted: boolean; termsVersion: string } }) => api.post<{ success: boolean; url: string; sessionId: string }>("/stripe/payment-methods/setup-session", input, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
  setDefault: (id: string, shopId?: string | null) => api.post<PaymentMethodsResponse>(`/stripe/payment-methods/${encodeURIComponent(id)}/default`, { shopId }),
  remove: (id: string, shopId?: string | null) => api.delete<PaymentMethodsResponse>(`/stripe/payment-methods/${encodeURIComponent(id)}${query(shopId)}`),
  portal: (shopId: string | null | undefined, returnUrl: string) => api.post<{ success: boolean; url: string }>("/stripe/billing-portal", { shopId, returnUrl }),
};

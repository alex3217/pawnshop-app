import { api } from "./apiClient";

export type SettlementStatus =
  | "PENDING"
  | "CHARGED"
  | "FAILED"
  | "PAID"
  | "COMPLETED"
  | string;

export type Settlement = {
  id: string;
  settlementId?: string;
  auctionId?: string;
  auctionTitle?: string;
  itemId?: string;
  itemTitle?: string;
  shopId?: string;
  shopName?: string;
  buyerId?: string;
  sellerId?: string;
  winnerId?: string | null;
  winnerName?: string | null;
  winnerEmail?: string | null;
  finalAmountCents?: number;
  amountCents?: number;
  amount?: number | string;
  finalPrice?: number | string;
  currency?: string;
  status: SettlementStatus;
  endedAt?: string | null;
  settledAt?: string | null;
  stripePaymentIntent?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SettlementPaymentIntentResponse = {
  success?: boolean;
  paymentIntentId?: string;
  clientSecret?: string | null;
  amount?: number;
  currency?: string;
  reused?: boolean;
  settlementStatus?: SettlementStatus;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

function normalizeSettlements(data: unknown): Settlement[] {
  if (Array.isArray(data)) return data as Settlement[];

  if (isObject(data)) {
    const nested = isObject(data.data) ? data.data : null;

    if (Array.isArray(data.rows)) return data.rows as Settlement[];
    if (Array.isArray(data.items)) return data.items as Settlement[];
    if (Array.isArray(data.settlements)) return data.settlements as Settlement[];
    if (Array.isArray(data.data)) return data.data as Settlement[];

    if (nested) {
      if (Array.isArray(nested.rows)) return nested.rows as Settlement[];
      if (Array.isArray(nested.items)) return nested.items as Settlement[];
      if (Array.isArray(nested.settlements)) {
        return nested.settlements as Settlement[];
      }
    }
  }

  return [];
}

function unwrapSettlement(data: unknown): Settlement {
  if (!isObject(data)) throw new Error("Invalid settlement response");

  const nested = isObject(data.data) ? data.data : null;

  const settlement = data.settlement ?? nested?.settlement ?? nested ?? data;

  if (!isObject(settlement)) {
    throw new Error("Invalid settlement response");
  }

  return settlement as Settlement;
}

function unwrapPaymentIntent(data: unknown): SettlementPaymentIntentResponse {
  if (!isObject(data)) {
    throw new Error("Invalid payment intent response.");
  }

  const nested = isObject(data.data) ? data.data : null;
  const payload = nested || data;

  if (!isObject(payload)) {
    throw new Error("Invalid payment intent response.");
  }

  return payload as SettlementPaymentIntentResponse;
}

export async function getMySettlements(): Promise<Settlement[]> {
  const data = await api.get<unknown>("/settlements/mine");
  return normalizeSettlements(data);
}

export async function getSettlementById(id: string): Promise<Settlement> {
  if (!id) throw new Error("Missing settlement id.");

  const data = await api.get<unknown>(`/settlements/${encodeURIComponent(id)}`);
  return unwrapSettlement(data);
}

export async function createSettlementPaymentIntent(
  settlementId: string,
): Promise<SettlementPaymentIntentResponse> {
  if (!settlementId) throw new Error("Missing settlement id.");

  const data = await api.post<unknown>(
    `/stripe/payment-intents/settlements/${encodeURIComponent(settlementId)}`,
  );

  return unwrapPaymentIntent(data);
}

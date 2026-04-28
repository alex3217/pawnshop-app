import { api } from "./apiClient";

export type SettlementStatus =
  | "PENDING"
  | "CHARGED"
  | "FAILED"
  | string;

export type Settlement = {
  id: string;
  auctionId?: string;
  itemId?: string;
  buyerId?: string;
  sellerId?: string;
  amount?: number | string;
  currency?: string;
  status: SettlementStatus;
  settledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

function normalizeSettlements(data: unknown): Settlement[] {
  if (Array.isArray(data)) return data as Settlement[];

  if (isObject(data)) {
    if (Array.isArray(data.rows)) return data.rows as Settlement[];
    if (Array.isArray(data.items)) return data.items as Settlement[];
    if (Array.isArray(data.settlements)) return data.settlements as Settlement[];
    if (Array.isArray(data.data)) return data.data as Settlement[];
  }

  return [];
}

function unwrapSettlement(data: unknown): Settlement {
  if (!isObject(data)) throw new Error("Invalid settlement response");

  const nested = isObject(data.data) ? data.data : null;

  const settlement =
    data.settlement ??
    nested?.settlement ??
    nested ??
    data;

  if (!isObject(settlement)) {
    throw new Error("Invalid settlement response");
  }

  return settlement as Settlement;
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
): Promise<{ clientSecret: string }> {
  if (!settlementId) throw new Error("Missing settlement id.");

  return api.post<{ clientSecret: string }>(
    `/stripe/payment-intents/settlements/${encodeURIComponent(settlementId)}`,
  );
}

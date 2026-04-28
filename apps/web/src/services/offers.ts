import { api } from "./apiClient";

export type OfferStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "COUNTERED"
  | "CANCELED"
  | string;

export type OfferItem = {
  id?: string | null;
  title?: string | null;
  shop?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

export type Offer = {
  id: string;
  itemId?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
  ownerId?: string | null;
  amount?: number | string | null;
  counterAmount?: number | string | null;
  message?: string | null;
  counterMessage?: string | null;
  status: OfferStatus;
  createdAt?: string;
  updatedAt?: string;
  item?: OfferItem | null;
  buyer?: unknown;
  seller?: unknown;
};

export type CreateOfferInput = {
  itemId: string;
  amount: number | string;
  message?: string;
};

export type CounterOfferInput = {
  offerId: string;
  counterAmount: number | string;
  message?: string;
  counterMessage?: string;
};

function normalizeOffers(data: unknown): Offer[] {
  if (Array.isArray(data)) return data as Offer[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.rows)) return record.rows as Offer[];
    if (Array.isArray(record.items)) return record.items as Offer[];
    if (Array.isArray(record.offers)) return record.offers as Offer[];
    if (Array.isArray(record.data)) return record.data as Offer[];
  }

  return [];
}

export async function getMyOffers(): Promise<Offer[]> {
  const data = await api.get<unknown>("/offers/mine");
  return normalizeOffers(data);
}

export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  return api.post<Offer>("/offers", input);
}

export async function getOwnerOffers(): Promise<Offer[]> {
  const data = await api.get<unknown>("/offers/owner");
  return normalizeOffers(data);
}

export async function acceptOffer(offerId: string): Promise<Offer> {
  return api.post<Offer>(`/offers/${encodeURIComponent(offerId)}/accept`);
}

export async function rejectOffer(offerId: string): Promise<Offer> {
  return api.post<Offer>(`/offers/${encodeURIComponent(offerId)}/reject`);
}

export async function counterOffer(input: CounterOfferInput): Promise<Offer> {
  return api.post<Offer>(
    `/offers/${encodeURIComponent(input.offerId)}/counter`,
    {
      counterAmount: input.counterAmount,
      message: input.message ?? input.counterMessage,
      counterMessage: input.counterMessage ?? input.message,
    },
  );
}

export async function acceptCounterOffer(offerId: string): Promise<Offer> {
  return api.post<Offer>(`/offers/${encodeURIComponent(offerId)}/accept-counter`);
}

export async function declineCounterOffer(offerId: string): Promise<Offer> {
  return api.post<Offer>(`/offers/${encodeURIComponent(offerId)}/decline-counter`);
}

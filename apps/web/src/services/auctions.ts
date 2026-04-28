import { api } from "./apiClient";

export type AuctionStatus =
  | "SCHEDULED"
  | "LIVE"
  | "ENDED"
  | "CANCELED"
  | string;

export type Auction = {
  id: string;
  itemId: string;
  shopId: string;
  status: AuctionStatus;
  startingPrice: number | string;
  currentPrice: number | string;
  minIncrement: number | string;
  reservePrice?: number | string | null;
  buyItNowPrice?: number | string | null;
  startsAt?: string | null;
  endsAt: string;
  extendedEndsAt?: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  item?: {
    id?: string;
    title?: string | null;
    description?: string | null;
    category?: string | null;
    condition?: string | null;
    images?: string[] | null;
  } | null;
  shop?: {
    id?: string;
    name?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
};

export type AuctionsResponse = {
  auctions: Auction[];
  total?: number;
  page?: number;
  limit?: number;
};

export type CreateAuctionInput = {
  itemId: string;
  startPrice: number;
  minIncrement: number;
  startsAt?: string | null;
  endsAt: string;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

export function extractAuctionApiError(
  payload: unknown,
  fallback = "Auction request failed.",
) {
  if (!isObject(payload)) return fallback;

  const message = String(
    payload.error || payload.message || payload.details || fallback,
  ).trim();

  const minRequired = Number(payload.minRequired);
  if (Number.isFinite(minRequired)) {
    return `${message || "Bid is too low"} minimum $${minRequired.toFixed(2)}`;
  }

  return message || fallback;
}

export function getAuctionPayload(payload: unknown): Auction | null {
  if (!isObject(payload)) return null;

  if (typeof payload.id === "string") return payload as Auction;

  if (isObject(payload.auction) && typeof payload.auction.id === "string") {
    return payload.auction as Auction;
  }

  if (isObject(payload.data)) {
    if (
      isObject(payload.data.auction) &&
      typeof payload.data.auction.id === "string"
    ) {
      return payload.data.auction as Auction;
    }

    if (typeof payload.data.id === "string") {
      return payload.data as Auction;
    }
  }

  return null;
}

function normalizeAuctions(payload: unknown): AuctionsResponse {
  if (Array.isArray(payload)) {
    return {
      auctions: payload as Auction[],
      total: payload.length,
      page: 1,
      limit: payload.length,
    };
  }

  if (!isObject(payload)) {
    return {
      auctions: [],
      total: 0,
      page: 1,
      limit: 0,
    };
  }

  const data = isObject(payload.data) ? payload.data : payload;

  const auctions = Array.isArray(data.auctions)
    ? (data.auctions as Auction[])
    : Array.isArray(data.items)
      ? (data.items as Auction[])
      : Array.isArray(data.rows)
        ? (data.rows as Auction[])
        : Array.isArray(data.data)
          ? (data.data as Auction[])
          : [];

  const total = Number(data.total ?? data.count ?? auctions.length);
  const page = Number(data.page ?? 1);
  const limit = Number(data.limit ?? auctions.length);

  return {
    auctions,
    total: Number.isFinite(total) ? total : auctions.length,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : auctions.length,
  };
}

function unwrapAuction(payload: unknown): Auction {
  const auction = getAuctionPayload(payload);

  if (!auction) {
    throw new Error("Invalid auction response from server.");
  }

  return auction;
}

function buildStatusQuery(status?: string) {
  if (!status || status === "ALL") return "";

  const params = new URLSearchParams();
  params.set("status", status);

  return `?${params.toString()}`;
}

export async function getAuctions(status?: string): Promise<AuctionsResponse> {
  const data = await api.get<unknown>(`/auctions${buildStatusQuery(status)}`);
  return normalizeAuctions(data);
}

export async function getOwnerAuctions(
  status?: string,
): Promise<AuctionsResponse> {
  const query = buildStatusQuery(status);

  const candidatePaths = [
    `/owner/auctions${query}`,
    `/auctions/owner${query}`,
    `/auctions/mine${query}`,
    `/auctions/my${query}`,
  ];

  let lastError: unknown = null;

  for (const path of candidatePaths) {
    try {
      const data = await api.get<unknown>(path);
      return normalizeAuctions(data);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to load owner auctions.");
}

export async function getAuction(id: string): Promise<Auction> {
  if (!id) throw new Error("Missing auction id.");

  const data = await api.get<unknown>(`/auctions/${encodeURIComponent(id)}`);
  return unwrapAuction(data);
}

export async function createAuction(
  input: CreateAuctionInput,
): Promise<Auction> {
  const data = await api.post<unknown>("/auctions", {
    itemId: input.itemId,
    startPrice: input.startPrice,
    minIncrement: input.minIncrement,
    startsAt: input.startsAt || undefined,
    endsAt: input.endsAt,
  });

  return unwrapAuction(data);
}

export async function placeBid(
  auctionId: string,
  amount: number,
): Promise<Auction | null> {
  if (!auctionId) throw new Error("Missing auction id.");

  const data = await api.post<unknown>(
    `/auctions/${encodeURIComponent(auctionId)}/bids`,
    { amount },
  );

  return getAuctionPayload(data);
}

export async function cancelAuction(id: string): Promise<Auction | null> {
  if (!id) throw new Error("Missing auction id.");

  const data = await api.post<unknown>(
    `/auctions/${encodeURIComponent(id)}/cancel`,
  );

  return getAuctionPayload(data);
}

export async function endAuction(id: string): Promise<Auction> {
  if (!id) throw new Error("Missing auction id.");

  const data = await api.post<unknown>(
    `/auctions/${encodeURIComponent(id)}/end`,
  );

  return unwrapAuction(data);
}

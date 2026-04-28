import { api } from "./apiClient";

export type AuctionStatus = "LIVE" | "ENDED" | "CANCELED" | string;

export type Auction = {
  id: string;
  itemId?: string;
  shopId?: string;
  status: AuctionStatus;
  startingPrice: number;
  currentPrice: number;
  minIncrement: number;
  startsAt?: string;
  endsAt?: string;
  extendedEndsAt?: string;
  item?: any;
  shop?: any;
};

type ApiObject = Record<string, unknown>;

function isObject(v: unknown): v is ApiObject {
  return typeof v === "object" && v !== null;
}

function normalizeAuctions(data: unknown): Auction[] {
  if (Array.isArray(data)) return data as Auction[];

  if (isObject(data)) {
    if (Array.isArray(data.rows)) return data.rows as Auction[];
    if (Array.isArray(data.auctions)) return data.auctions as Auction[];
    if (Array.isArray(data.items)) return data.items as Auction[];
    if (Array.isArray(data.data)) return data.data as Auction[];
  }

  return [];
}

function unwrapAuction(data: unknown): Auction {
  if (!isObject(data)) throw new Error("Invalid auction response");

  const nested = isObject(data.data) ? data.data : null;

  return (
    data.auction ??
    nested?.auction ??
    nested ??
    data
  ) as Auction;
}

// =====================
// PUBLIC
// =====================

export async function getAuctions(status?: string) {
  const query = status && status !== "ALL" ? `?status=${status}` : "";
  const data = await api.get<unknown>(`/auctions${query}`);
  return normalizeAuctions(data);
}

export async function getAuction(id: string) {
  if (!id) throw new Error("Missing auction id.");
  const data = await api.get<unknown>(`/auctions/${encodeURIComponent(id)}`);
  return unwrapAuction(data);
}

// =====================
// OWNER
// =====================

export async function createAuction(input: {
  itemId: string;
  startingPrice: number;
  minIncrement: number;
  startsAt?: string;
  endsAt?: string;
}) {
  return api.post<Auction>("/auctions", input);
}

export async function cancelAuction(id: string) {
  return api.post(`/auctions/${id}/cancel`);
}

export async function endAuction(id: string) {
  return api.post(`/auctions/${id}/end`);
}

// =====================
// BIDDING
// =====================

export async function placeBid(auctionId: string, amount: number) {
  return api.post(`/auctions/${auctionId}/bids`, { amount });
}

// File: apps/web/src/services/bids.ts

import { api } from "./apiClient";

export type BidRow = {
  id: string;
  auctionId: string;
  userId: string;
  amount: string | number;
  createdAt: string;
  archived?: boolean;
  archivedAt?: string | null;
  canArchive?: boolean;
  isWinner?: boolean;
  isLeading?: boolean;
  buyerStatus?: BuyerBidStatus;
  settlement?: {
    winnerUserId: string;
    status: string;
    fulfillmentStatus: string;
  } | null;
  auction?: {
    id: string;
    status: string;
    currentPrice: string | number;
    minIncrement: string | number;
    startsAt: string;
    endsAt: string;
    extendedEndsAt?: string | null;
    item?: {
      id?: string;
      title?: string | null;
    } | null;
    shop?: {
      id?: string;
      name?: string | null;
    } | null;
  } | null;
};

export type BuyerBidStatus =
  | "CANCELED"
  | "PAYMENT_DUE"
  | "WON"
  | "LOST"
  | "CLOSED"
  | "LEADING"
  | "OUTBID";

function normalizeBidRows(payload: unknown): BidRow[] {
  if (Array.isArray(payload)) return payload as BidRow[];

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.rows)) return record.rows as BidRow[];
    if (Array.isArray(record.bids)) return record.bids as BidRow[];
    if (Array.isArray(record.items)) return record.items as BidRow[];
    if (Array.isArray(record.data)) return record.data as BidRow[];

    if (
      record.data &&
      typeof record.data === "object" &&
      Array.isArray((record.data as Record<string, unknown>).rows)
    ) {
      return (record.data as { rows: BidRow[] }).rows;
    }

    if (
      record.data &&
      typeof record.data === "object" &&
      Array.isArray((record.data as Record<string, unknown>).bids)
    ) {
      return (record.data as { bids: BidRow[] }).bids;
    }
  }

  return [];
}

export async function getMyBids(
  archived = false,
  signal?: AbortSignal,
): Promise<BidRow[]> {
  const data = await api.get<unknown>(`/bids/mine?archived=${archived}`, { signal });
  return normalizeBidRows(data);
}

export async function archiveBid(bidId: string): Promise<void> {
  await api.put(`/bids/${encodeURIComponent(bidId)}/archive`);
}

export async function restoreBid(bidId: string): Promise<void> {
  await api.delete(`/bids/${encodeURIComponent(bidId)}/archive`);
}

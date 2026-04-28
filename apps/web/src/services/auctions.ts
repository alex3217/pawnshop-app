// File: apps/web/src/services/auctions.ts

import { API_BASE } from "../config";
import { getAuthToken } from "./auth";

export type AuctionStatus = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELED" | string;

export type Auction = {
  id: string;
  status: AuctionStatus;
  currentPrice: string | number;
  minIncrement: string | number;
  startsAt?: string | null;
  endsAt: string;
  extendedEndsAt?: string | null;
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

type ApiEnvelope<T> =
  | T
  | {
      data?: T | { auction?: T };
      auction?: T;
      error?: string;
      message?: string;
      details?: string;
      minRequired?: number;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function extractAuctionApiError(payload: unknown, fallback = "Auction request failed.") {
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
    if (isObject(payload.data.auction) && typeof payload.data.auction.id === "string") {
      return payload.data.auction as Auction;
    }

    if (typeof payload.data.id === "string") {
      return payload.data as Auction;
    }
  }

  return null;
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getAuctions(status?: string): Promise<AuctionsResponse> {
  const params = new URLSearchParams();

  if (status && status !== "ALL") {
    params.set("status", status);
  }

  const query = params.toString();
  const url = `${API_BASE}/auctions${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    credentials: "include",
  });

  const json = await safeJson<unknown>(response);

  if (!response.ok) {
    throw new Error(
      extractAuctionApiError(json, `Failed to load auctions (${response.status})`),
    );
  }

  if (Array.isArray(json)) {
    return { auctions: json as Auction[] };
  }

  if (isObject(json)) {
    const data = isObject(json.data) ? json.data : json;

    const auctions =
      Array.isArray(data.auctions)
        ? (data.auctions as Auction[])
        : Array.isArray(data.items)
          ? (data.items as Auction[])
          : Array.isArray(data.rows)
            ? (data.rows as Auction[])
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

  return { auctions: [] };
}

export async function getAuction(id: string): Promise<Auction> {
  const response = await fetch(`${API_BASE}/auctions/${encodeURIComponent(id)}`, {
    credentials: "include",
  });

  const json = await safeJson<ApiEnvelope<Auction>>(response);

  if (!response.ok) {
    throw new Error(
      extractAuctionApiError(json, `Failed to load auction (${response.status})`),
    );
  }

  const auction = getAuctionPayload(json);

  if (!auction) {
    throw new Error("Invalid auction response from server.");
  }

  return auction;
}

export async function placeBid(auctionId: string, amount: number): Promise<Auction | null> {
  const response = await fetch(
    `${API_BASE}/auctions/${encodeURIComponent(auctionId)}/bids`,
    {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
      body: JSON.stringify({ amount }),
    },
  );

  const json = await safeJson<ApiEnvelope<Auction>>(response);

  if (!response.ok) {
    throw new Error(extractAuctionApiError(json, `Bid failed (${response.status})`));
  }

  return getAuctionPayload(json);
}

export async function createAuction(input: CreateAuctionInput): Promise<Auction> {
  const payload = {
    itemId: input.itemId,
    startPrice: input.startPrice,
    minIncrement: input.minIncrement,
    startsAt: input.startsAt || undefined,
    endsAt: input.endsAt,
  };

  const response = await fetch(`${API_BASE}/auctions`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const json = await safeJson<ApiEnvelope<Auction>>(response);

  if (!response.ok) {
    throw new Error(
      extractAuctionApiError(json, `Failed to create auction (${response.status})`),
    );
  }

  const auction = getAuctionPayload(json);

  if (!auction) {
    throw new Error("Auction was created, but the server returned an invalid response.");
  }

  return auction;
}


export async function getOwnerAuctions(status?: string): Promise<AuctionsResponse> {
  const params = new URLSearchParams();

  if (status && status !== "ALL") {
    params.set("status", status);
  }

  const query = params.toString();

  const candidateUrls = [
    `${API_BASE}/owner/auctions${query ? `?${query}` : ""}`,
    `${API_BASE}/auctions/owner${query ? `?${query}` : ""}`,
    `${API_BASE}/auctions/mine${query ? `?${query}` : ""}`,
    `${API_BASE}/auctions/my${query ? `?${query}` : ""}`,
  ];

  let lastError: Error | null = null;

  for (const url of candidateUrls) {
    const response = await fetch(url, {
      headers: authHeaders(),
      credentials: "include",
    });

    const json = await safeJson<unknown>(response);

    if (!response.ok) {
      lastError = new Error(
        extractAuctionApiError(json, `Failed to load owner auctions (${response.status})`),
      );

      if (response.status === 404) {
        continue;
      }

      throw lastError;
    }

    if (Array.isArray(json)) {
      return { auctions: json as Auction[] };
    }

    if (isObject(json)) {
      const data = isObject(json.data) ? json.data : json;

      const auctions =
        Array.isArray(data.auctions)
          ? (data.auctions as Auction[])
          : Array.isArray(data.items)
            ? (data.items as Auction[])
            : Array.isArray(data.rows)
              ? (data.rows as Auction[])
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

    return { auctions: [] };
  }

  throw lastError ?? new Error("Failed to load owner auctions.");
}

export async function cancelAuction(auctionId: string): Promise<Auction | null> {
  const candidateUrls = [
    `${API_BASE}/owner/auctions/${encodeURIComponent(auctionId)}/cancel`,
    `${API_BASE}/auctions/${encodeURIComponent(auctionId)}/cancel`,
  ];

  let lastError: Error | null = null;

  for (const url of candidateUrls) {
    const response = await fetch(url, {
      method: "PATCH",
      headers: authHeaders(),
      credentials: "include",
    });

    const json = await safeJson<unknown>(response);

    if (!response.ok) {
      lastError = new Error(
        extractAuctionApiError(json, `Failed to cancel auction (${response.status})`),
      );

      if (response.status === 404) {
        continue;
      }

      throw lastError;
    }

    return getAuctionPayload(json);
  }

  throw lastError ?? new Error("Failed to cancel auction.");
}

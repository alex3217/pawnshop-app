import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

export type Offer = {
  id: string;
  itemId: string;
  buyerId: string;
  ownerId: string;
  amount: string | number;
  message?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  item?: {
    id: string;
    title: string;
    price: string | number;
    shop?: {
      id: string;
      name: string;
    };
  };
};

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseJson(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function extractError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return fallback;
}

export async function getMyOffers(): Promise<Offer[]> {
  const res = await fetch(joinUrl(API_BASE, "/offers/mine"), {
    headers: getAuthHeaders(),
    credentials: "same-origin",
  });

  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to load offers (${res.status})`));
  }

  return Array.isArray(data) ? data : [];
}

export async function createOffer(input: {
  itemId: string;
  amount: number;
  message?: string;
}): Promise<Offer> {
  const res = await fetch(joinUrl(API_BASE, "/offers"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });

  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to create offer (${res.status})`));
  }

  return data as Offer;
}

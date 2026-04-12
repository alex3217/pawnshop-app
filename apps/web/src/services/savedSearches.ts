import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

export type SavedSearch = {
  id: string;
  userId?: string;
  query: string;
  createdAt?: string;
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

export async function getMySavedSearches(): Promise<SavedSearch[]> {
  const res = await fetch(joinUrl(API_BASE, "/saved-searches/mine"), {
    headers: getAuthHeaders(),
    credentials: "same-origin",
  });

  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to load saved searches (${res.status})`));
  }

  return Array.isArray(data) ? data : [];
}

export async function addSavedSearch(query: string): Promise<SavedSearch> {
  const res = await fetch(joinUrl(API_BASE, "/saved-searches"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "same-origin",
    body: JSON.stringify({ query }),
  });

  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to save search (${res.status})`));
  }

  return data as SavedSearch;
}

export async function removeSavedSearch(id: string): Promise<{ success: boolean; id: string }> {
  const res = await fetch(joinUrl(API_BASE, `/saved-searches/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "same-origin",
  });

  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(extractError(data, `Failed to delete saved search (${res.status})`));
  }

  return data as { success: boolean; id: string };
}

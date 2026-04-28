import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

export type LocationStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type PawnShopLocation = {
  id: string;
  shopId?: string | null;
  ownerId?: string | null;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: LocationStatus | string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateLocationInput = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
};

export type UpdateLocationInput = Partial<CreateLocationInput> & {
  status?: LocationStatus;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message =
      isObject(data) && typeof data.message === "string"
        ? data.message
        : isObject(data) && typeof data.error === "string"
          ? data.error
          : `Request failed with status ${res.status}`;

    throw new Error(message);
  }

  return data as T;
}

function unwrapList(data: unknown): PawnShopLocation[] {
  if (Array.isArray(data)) return data as PawnShopLocation[];

  if (!isObject(data)) return [];

  if (Array.isArray(data.locations)) return data.locations as PawnShopLocation[];
  if (Array.isArray(data.data)) return data.data as PawnShopLocation[];

  if (isObject(data.data) && Array.isArray(data.data.locations)) {
    return data.data.locations as PawnShopLocation[];
  }

  return [];
}

function unwrapOne(data: unknown): PawnShopLocation {
  if (!isObject(data)) throw new Error("Invalid location response");

  if (isObject(data.location)) return data.location as PawnShopLocation;

  if (isObject(data.data)) {
    if (isObject(data.data.location)) {
      return data.data.location as PawnShopLocation;
    }

    return data.data as PawnShopLocation;
  }

  return data as PawnShopLocation;
}

export async function getLocations(): Promise<PawnShopLocation[]> {
  const res = await fetch(joinUrl(API_BASE, "/locations"), {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  return unwrapList(await parseResponse(res));
}

export async function getMyLocations(): Promise<PawnShopLocation[]> {
  const res = await fetch(joinUrl(API_BASE, "/locations/mine"), {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  return unwrapList(await parseResponse(res));
}

export async function getLocationById(id: string): Promise<PawnShopLocation> {
  const res = await fetch(joinUrl(API_BASE, `/locations/${id}`), {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  return unwrapOne(await parseResponse(res));
}

export async function createLocation(
  input: CreateLocationInput,
): Promise<PawnShopLocation> {
  const res = await fetch(joinUrl(API_BASE, "/locations"), {
    method: "POST",
    headers: getAuthHeaders(true),
    credentials: "include",
    body: JSON.stringify(input),
  });

  return unwrapOne(await parseResponse(res));
}

export async function updateLocation(
  id: string,
  input: UpdateLocationInput,
): Promise<PawnShopLocation> {
  const res = await fetch(joinUrl(API_BASE, `/locations/${id}`), {
    method: "PATCH",
    headers: getAuthHeaders(true),
    credentials: "include",
    body: JSON.stringify(input),
  });

  return unwrapOne(await parseResponse(res));
}

export async function deleteLocation(id: string): Promise<void> {
  const res = await fetch(joinUrl(API_BASE, `/locations/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  await parseResponse(res);
}

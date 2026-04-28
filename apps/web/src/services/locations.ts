import { api } from "./apiClient";

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

function unwrapList(data: unknown): PawnShopLocation[] {
  if (Array.isArray(data)) return data as PawnShopLocation[];
  if (!isObject(data)) return [];

  if (Array.isArray(data.locations)) return data.locations as PawnShopLocation[];
  if (Array.isArray(data.rows)) return data.rows as PawnShopLocation[];
  if (Array.isArray(data.items)) return data.items as PawnShopLocation[];
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
  const data = await api.get<unknown>("/locations");
  return unwrapList(data);
}

export async function getMyLocations(): Promise<PawnShopLocation[]> {
  const data = await api.get<unknown>("/locations/mine");
  return unwrapList(data);
}

export async function getLocationById(id: string): Promise<PawnShopLocation> {
  if (!id) throw new Error("Missing location id.");
  const data = await api.get<unknown>(`/locations/${encodeURIComponent(id)}`);
  return unwrapOne(data);
}

export async function createLocation(
  input: CreateLocationInput,
): Promise<PawnShopLocation> {
  const data = await api.post<unknown>("/locations", input);
  return unwrapOne(data);
}

export async function updateLocation(
  id: string,
  input: UpdateLocationInput,
): Promise<PawnShopLocation> {
  if (!id) throw new Error("Missing location id.");
  const data = await api.patch<unknown>(`/locations/${encodeURIComponent(id)}`, input);
  return unwrapOne(data);
}

export async function deleteLocation(id: string): Promise<void> {
  if (!id) throw new Error("Missing location id.");
  await api.delete<unknown>(`/locations/${encodeURIComponent(id)}`);
}

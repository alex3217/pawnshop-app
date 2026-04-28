import { api } from "./apiClient";

export type LocationStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type PawnShopLocation = {
  id: string;
  shopId?: string | null;
  ownerId?: string | null;
  name: string;
  shopName?: string | null;
  title?: string | null;
  address?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  hours?: string | null;
  staffCount?: number | null;
  inventoryCount?: number | null;
  itemCount?: number | null;
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
  if (Array.isArray(data.shops)) return data.shops as PawnShopLocation[];
  if (Array.isArray(data.rows)) return data.rows as PawnShopLocation[];
  if (Array.isArray(data.items)) return data.items as PawnShopLocation[];
  if (Array.isArray(data.data)) return data.data as PawnShopLocation[];

  if (isObject(data.data)) {
    if (Array.isArray(data.data.locations)) {
      return data.data.locations as PawnShopLocation[];
    }
    if (Array.isArray(data.data.shops)) {
      return data.data.shops as PawnShopLocation[];
    }
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

export async function getLocations(
  signal?: AbortSignal,
): Promise<PawnShopLocation[]> {
  const data = await api.get<unknown>("/locations", { signal });
  return unwrapList(data);
}

export async function getMyLocations(
  signal?: AbortSignal,
): Promise<PawnShopLocation[]> {
  const data = await api.get<unknown>("/locations/mine", { signal });
  return unwrapList(data);
}

export async function getLocationById(
  id: string,
  signal?: AbortSignal,
): Promise<PawnShopLocation> {
  if (!id) throw new Error("Missing location id.");
  const data = await api.get<unknown>(`/locations/${encodeURIComponent(id)}`, {
    signal,
  });
  return unwrapOne(data);
}

export async function createLocation(
  input: CreateLocationInput,
  signal?: AbortSignal,
): Promise<PawnShopLocation> {
  const data = await api.post<unknown>("/locations", input, { signal });
  return unwrapOne(data);
}

export async function updateLocation(
  id: string,
  input: UpdateLocationInput,
  signal?: AbortSignal,
): Promise<PawnShopLocation> {
  if (!id) throw new Error("Missing location id.");
  const data = await api.patch<unknown>(
    `/locations/${encodeURIComponent(id)}`,
    input,
    { signal },
  );
  return unwrapOne(data);
}

export async function deleteLocation(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!id) throw new Error("Missing location id.");
  await api.delete<unknown>(`/locations/${encodeURIComponent(id)}`, { signal });
}

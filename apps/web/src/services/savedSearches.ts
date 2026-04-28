import { api } from "./apiClient";

export type SavedSearch = {
  id: string;
  userId?: string | null;
  query: string;
  createdAt?: string;
  updatedAt?: string;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

function normalizeSavedSearches(data: unknown): SavedSearch[] {
  if (Array.isArray(data)) return data as SavedSearch[];

  if (isObject(data)) {
    if (Array.isArray(data.rows)) return data.rows as SavedSearch[];
    if (Array.isArray(data.items)) return data.items as SavedSearch[];
    if (Array.isArray(data.searches)) return data.searches as SavedSearch[];
    if (Array.isArray(data.savedSearches)) return data.savedSearches as SavedSearch[];
    if (Array.isArray(data.data)) return data.data as SavedSearch[];
  }

  return [];
}

function unwrapSavedSearch(data: unknown): SavedSearch {
  if (!isObject(data)) throw new Error("Invalid saved search response");

  const nested = isObject(data.data) ? data.data : null;

  const savedSearch =
    data.savedSearch ??
    data.search ??
    nested?.savedSearch ??
    nested?.search ??
    nested ??
    data;

  if (!isObject(savedSearch)) {
    throw new Error("Invalid saved search response");
  }

  return savedSearch as SavedSearch;
}

function cleanQuery(query: string) {
  const value = String(query || "").trim();
  if (!value) throw new Error("Missing saved search query.");
  return value;
}

export async function getMySavedSearches(): Promise<SavedSearch[]> {
  const data = await api.get<unknown>("/saved-searches/mine");
  return normalizeSavedSearches(data);
}

export async function addSavedSearch(query: string): Promise<SavedSearch> {
  const data = await api.post<unknown>("/saved-searches", {
    query: cleanQuery(query),
  });

  return unwrapSavedSearch(data);
}

export async function removeSavedSearch(
  id: string,
): Promise<{ success: boolean; id: string }> {
  const safeId = String(id || "").trim();
  if (!safeId) throw new Error("Missing saved search id.");

  const data = await api.delete<unknown>(
    `/saved-searches/${encodeURIComponent(safeId)}`,
  );

  if (isObject(data) && typeof data.success === "boolean") {
    return {
      success: data.success,
      id: typeof data.id === "string" ? data.id : safeId,
    };
  }

  return {
    success: true,
    id: safeId,
  };
}

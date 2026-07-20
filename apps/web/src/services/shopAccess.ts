import { api } from "./apiClient";

export type ShopPermissionCode =
  | "inventory:read"
  | "inventory:write"
  | "auctions:read"
  | "auctions:write"
  | "offers:read"
  | "offers:write"
  | "locations:read"
  | "locations:write"
  | "staff:read"
  | "staff:write"
  | "settlements:read"
  | string;

export type ShopAccessCapabilities = {
  inventoryRead: boolean;
  inventoryWrite: boolean;
  auctionsRead: boolean;
  auctionsWrite: boolean;
  offersRead: boolean;
  offersWrite: boolean;
  locationsRead: boolean;
  locationsWrite: boolean;
  staffRead: boolean;
  staffWrite: boolean;
  settlementsRead: boolean;
};

export type ShopAccessEntry = {
  shopId: string;
  shopName: string;
  source: string;
  staffId: string | null;
  staffRole: string | null;
  permissions: ShopPermissionCode[];
};

export type ShopAccessSnapshot = {
  role: string;
  unrestricted: boolean;
  shopIds: string[];
  permissions: ShopPermissionCode[];
  capabilities: ShopAccessCapabilities;
  shops: ShopAccessEntry[];
};

type UnknownRecord = Record<string, unknown>;

const EMPTY_CAPABILITIES: ShopAccessCapabilities = {
  inventoryRead: false,
  inventoryWrite: false,
  auctionsRead: false,
  auctionsWrite: false,
  offersRead: false,
  offersWrite: false,
  locationsRead: false,
  locationsWrite: false,
  staffRead: false,
  staffWrite: false,
  settlementsRead: false,
};

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function normalizeCapabilities(
  value: unknown,
): ShopAccessCapabilities {
  if (!isRecord(value)) {
    return {
      ...EMPTY_CAPABILITIES,
    };
  }

  return {
    inventoryRead:
      value.inventoryRead === true,
    inventoryWrite:
      value.inventoryWrite === true,
    auctionsRead:
      value.auctionsRead === true,
    auctionsWrite:
      value.auctionsWrite === true,
    offersRead:
      value.offersRead === true,
    offersWrite:
      value.offersWrite === true,
    locationsRead:
      value.locationsRead === true,
    locationsWrite:
      value.locationsWrite === true,
    staffRead:
      value.staffRead === true,
    staffWrite:
      value.staffWrite === true,
    settlementsRead:
      value.settlementsRead === true,
  };
}

function normalizeShopEntry(
  value: unknown,
): ShopAccessEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const shopId =
    String(value.shopId || "").trim();

  if (!shopId) {
    return null;
  }

  return {
    shopId,
    shopName:
      String(
        value.shopName ||
          value.name ||
          "Shop",
      ).trim() || "Shop",
    source:
      String(value.source || "UNKNOWN")
        .trim()
        .toUpperCase(),
    staffId:
      typeof value.staffId === "string" &&
      value.staffId.trim()
        ? value.staffId.trim()
        : null,
    staffRole:
      typeof value.staffRole === "string" &&
      value.staffRole.trim()
        ? value.staffRole
            .trim()
            .toUpperCase()
        : null,
    permissions:
      normalizeStringArray(
        value.permissions,
      ),
  };
}

function unwrapAccess(
  payload: unknown,
): ShopAccessSnapshot {
  if (!isRecord(payload)) {
    throw new Error(
      "Invalid shop access response.",
    );
  }

  const nestedData = isRecord(payload.data)
    ? payload.data
    : payload;

  const access = isRecord(nestedData.access)
    ? nestedData.access
    : nestedData;

  const shops = Array.isArray(access.shops)
    ? access.shops
        .map(normalizeShopEntry)
        .filter(
          (
            entry,
          ): entry is ShopAccessEntry =>
            entry !== null,
        )
    : [];

  return {
    role:
      String(access.role || "")
        .trim()
        .toUpperCase(),
    unrestricted:
      access.unrestricted === true,
    shopIds:
      normalizeStringArray(
        access.shopIds,
      ),
    permissions:
      normalizeStringArray(
        access.permissions,
      ),
    capabilities:
      normalizeCapabilities(
        access.capabilities,
      ),
    shops,
  };
}

export async function getMyShopAccess(
  signal?: AbortSignal,
): Promise<ShopAccessSnapshot> {
  const payload = await api.get<unknown>(
    "/auth/shop-access",
    {
      signal,
    },
  );

  return unwrapAccess(payload);
}

export function shopHasPermission(
  access: ShopAccessSnapshot | null,
  shopId: string | null | undefined,
  permission: ShopPermissionCode,
) {
  if (!access) {
    return false;
  }

  if (access.unrestricted) {
    return true;
  }

  const normalizedShopId =
    String(shopId || "").trim();

  if (!normalizedShopId) {
    return false;
  }

  const shop = access.shops.find(
    (entry) =>
      entry.shopId === normalizedShopId,
  );

  if (!shop) {
    return false;
  }

  return (
    shop.permissions.includes("*") ||
    shop.permissions.includes(permission)
  );
}

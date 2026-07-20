import { prisma } from "../lib/prisma.js";
import {
  SHOP_PERMISSION_CODES,
} from "../config/shopPermissions.js";

const ROLE_ALIASES = new Map([
  ["SUPERADMIN", "SUPER_ADMIN"],
  ["SUPER-ADMIN", "SUPER_ADMIN"],
  ["SUPER ADMIN", "SUPER_ADMIN"],
  ["SHOP_OWNER", "OWNER"],
  ["SELLER", "OWNER"],
]);

function normalizeString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeRole(value) {
  const raw = normalizeString(value).toUpperCase();
  return ROLE_ALIASES.get(raw) || raw;
}

function getUserId(user) {
  return normalizeString(
    user?.sub ||
      user?.id ||
      user?.userId ||
      user?.user_id,
  );
}

function getUserEmail(user) {
  return normalizeEmail(user?.email);
}

function createHttpError(
  statusCode,
  message,
  details = undefined,
) {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (details !== undefined) {
    error.details = details;
  }

  return error;
}

function assertKnownPermission(permission) {
  const normalized = normalizeString(
    permission,
  ).toLowerCase();

  if (!SHOP_PERMISSION_CODES.includes(normalized)) {
    throw createHttpError(
      500,
      `Unknown shop permission: ${normalized || "empty"}.`,
    );
  }

  return normalized;
}

function isPlatformAdministrator(role) {
  const normalized = normalizeRole(role);

  return (
    normalized === "ADMIN" ||
    normalized === "SUPER_ADMIN"
  );
}

function buildIdentityConditions(user) {
  const userId = getUserId(user);
  const email = getUserEmail(user);
  const conditions = [];

  if (userId) {
    conditions.push({ userId });
  }

  if (email) {
    conditions.push({ email });
  }

  return conditions;
}

async function loadShop(
  prismaClient,
  shopId,
) {
  const id = normalizeString(shopId);

  if (!id) {
    throw createHttpError(
      400,
      "Shop id is required.",
    );
  }

  const shop = await prismaClient.pawnShop.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      name: true,
      isDeleted: true,
    },
  });

  if (!shop || shop.isDeleted) {
    throw createHttpError(
      404,
      "Shop not found.",
    );
  }

  return shop;
}

async function loadActiveMembership({
  prismaClient,
  user,
  shopId,
}) {
  const identityConditions =
    buildIdentityConditions(user);

  if (identityConditions.length === 0) {
    return null;
  }

  return prismaClient.staff.findFirst({
    where: {
      shopId,
      status: "ACTIVE",
      OR: identityConditions,
    },
    select: {
      id: true,
      shopId: true,
      userId: true,
      email: true,
      role: true,
      status: true,
      permissions: true,
    },
  });
}

export async function resolveShopAccess({
  user,
  shopId,
  prismaClient = prisma,
}) {
  if (!user) {
    throw createHttpError(
      401,
      "Unauthorized",
    );
  }

  const shop = await loadShop(
    prismaClient,
    shopId,
  );

  const userId = getUserId(user);
  const role = normalizeRole(user.role);

  if (isPlatformAdministrator(role)) {
    return {
      authorized: true,
      source:
        role === "SUPER_ADMIN"
          ? "SUPER_ADMIN"
          : "ADMIN",
      shop,
      membership: null,
      permissions: ["*"],
    };
  }

  if (
    userId &&
    normalizeString(shop.ownerId) === userId
  ) {
    return {
      authorized: true,
      source: "SHOP_OWNER",
      shop,
      membership: null,
      permissions: ["*"],
    };
  }

  const membership =
    await loadActiveMembership({
      prismaClient,
      user,
      shopId: shop.id,
    });

  if (!membership) {
    return {
      authorized: false,
      source: "NONE",
      shop,
      membership: null,
      permissions: [],
    };
  }

  const permissions = Array.isArray(
    membership.permissions,
  )
    ? membership.permissions
        .map((permission) =>
          normalizeString(permission).toLowerCase(),
        )
        .filter(Boolean)
    : [];

  return {
    authorized: true,
    source: "STAFF",
    shop,
    membership,
    permissions,
  };
}

export async function assertShopPermission({
  user,
  shopId,
  permission,
  prismaClient = prisma,
}) {
  const normalizedPermission =
    assertKnownPermission(permission);

  const access = await resolveShopAccess({
    user,
    shopId,
    prismaClient,
  });

  if (!access.authorized) {
    throw createHttpError(
      403,
      "You do not have access to this shop.",
    );
  }

  if (
    access.source === "SHOP_OWNER" ||
    access.source === "ADMIN" ||
    access.source === "SUPER_ADMIN"
  ) {
    return {
      ...access,
      requiredPermission:
        normalizedPermission,
    };
  }

  if (
    !access.permissions.includes(
      normalizedPermission,
    )
  ) {
    throw createHttpError(
      403,
      `Missing required shop permission: ${normalizedPermission}.`,
    );
  }

  return {
    ...access,
    requiredPermission:
      normalizedPermission,
  };
}

export async function getAccessibleShopScope({
  user,
  permission,
  prismaClient = prisma,
}) {
  if (!user) {
    throw createHttpError(
      401,
      "Unauthorized",
    );
  }

  const normalizedPermission =
    assertKnownPermission(permission);

  if (isPlatformAdministrator(user.role)) {
    return {
      unrestricted: true,
      shopIds: [],
      requiredPermission:
        normalizedPermission,
    };
  }

  const userId = getUserId(user);
  const identityConditions =
    buildIdentityConditions(user);

  let memberships = [];

  if (identityConditions.length > 0) {
    memberships =
      await prismaClient.staff.findMany({
        where: {
          status: "ACTIVE",
          OR: identityConditions,
        },
        select: {
          shopId: true,
          permissions: true,
        },
      });
  }

  const membershipShopIds = memberships
    .filter((membership) =>
      Array.isArray(membership.permissions) &&
      membership.permissions
        .map((value) =>
          normalizeString(value).toLowerCase(),
        )
        .includes(normalizedPermission),
    )
    .map((membership) =>
      normalizeString(membership.shopId),
    )
    .filter(Boolean);

  const shopConditions = [];

  if (userId) {
    shopConditions.push({
      ownerId: userId,
    });
  }

  if (membershipShopIds.length > 0) {
    shopConditions.push({
      id: {
        in: membershipShopIds,
      },
    });
  }

  if (shopConditions.length === 0) {
    return {
      unrestricted: false,
      shopIds: [],
      requiredPermission:
        normalizedPermission,
    };
  }

  const shops =
    await prismaClient.pawnShop.findMany({
      where: {
        isDeleted: false,
        OR: shopConditions,
      },
      select: {
        id: true,
      },
    });

  return {
    unrestricted: false,
    shopIds: Array.from(
      new Set(
        shops
          .map((shop) =>
            normalizeString(shop.id),
          )
          .filter(Boolean),
      ),
    ),
    requiredPermission:
      normalizedPermission,
  };
}

function normalizePermissionList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((permission) =>
          normalizeString(permission).toLowerCase(),
        )
        .filter((permission) =>
          SHOP_PERMISSION_CODES.includes(permission),
        ),
    ),
  );
}

function buildShopCapabilities(
  permissions,
  fullAccess = false,
) {
  const permissionSet = new Set(permissions);

  const has = (permission) =>
    fullAccess ||
    permissionSet.has("*") ||
    permissionSet.has(permission);

  return {
    inventoryRead: has("inventory:read"),
    inventoryWrite: has("inventory:write"),
    auctionsRead: has("auctions:read"),
    auctionsWrite: has("auctions:write"),
    offersRead: has("offers:read"),
    offersWrite: has("offers:write"),
    locationsRead: has("locations:read"),
    locationsWrite: has("locations:write"),
    staffRead: has("staff:read"),
    staffWrite: has("staff:write"),
    settlementsRead: has("settlements:read"),
  };
}

export async function getMyShopAccess({
  user,
  prismaClient = prisma,
}) {
  if (!user) {
    throw createHttpError(
      401,
      "Unauthorized",
    );
  }

  const role = normalizeRole(user.role);

  if (isPlatformAdministrator(role)) {
    return {
      role,
      unrestricted: true,
      shopIds: [],
      permissions: ["*"],
      capabilities:
        buildShopCapabilities([], true),
      shops: [],
    };
  }

  const userId = getUserId(user);
  const identityConditions =
    buildIdentityConditions(user);

  const [ownedShops, memberships] =
    await Promise.all([
      userId
        ? prismaClient.pawnShop.findMany({
            where: {
              ownerId: userId,
              isDeleted: false,
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [],
      identityConditions.length > 0
        ? prismaClient.staff.findMany({
            where: {
              status: "ACTIVE",
              OR: identityConditions,
            },
            select: {
              id: true,
              shopId: true,
              userId: true,
              email: true,
              role: true,
              status: true,
              permissions: true,
              shop: {
                select: {
                  id: true,
                  name: true,
                  isDeleted: true,
                },
              },
            },
          })
        : [],
    ]);

  const shopAccessById = new Map();

  for (const shop of ownedShops) {
    const shopId = normalizeString(shop?.id);

    if (!shopId) {
      continue;
    }

    shopAccessById.set(shopId, {
      shopId,
      shopName:
        normalizeString(
          shop?.name,
          "Shop",
        ),
      source: "SHOP_OWNER",
      staffId: null,
      staffRole: null,
      permissions: ["*"],
    });
  }

  for (const membership of memberships) {
    const shop = membership?.shop;
    const shopId = normalizeString(
      shop?.id || membership?.shopId,
    );

    if (
      !shopId ||
      !shop ||
      shop.isDeleted === true
    ) {
      continue;
    }

    const existing =
      shopAccessById.get(shopId);

    if (existing?.source === "SHOP_OWNER") {
      continue;
    }

    shopAccessById.set(shopId, {
      shopId,
      shopName:
        normalizeString(
          shop.name,
          "Shop",
        ),
      source: "STAFF",
      staffId:
        normalizeString(
          membership.id,
        ) || null,
      staffRole:
        normalizeString(
          membership.role,
        ).toUpperCase() || null,
      permissions:
        normalizePermissionList(
          membership.permissions,
        ),
    });
  }

  const shops = Array.from(
    shopAccessById.values(),
  ).sort((left, right) =>
    left.shopName.localeCompare(
      right.shopName,
    ),
  );

  const hasFullShopAccess = shops.some(
    (shop) =>
      shop.permissions.includes("*"),
  );

  const permissionSet = new Set();

  for (const shop of shops) {
    for (const permission of shop.permissions) {
      permissionSet.add(permission);
    }
  }

  const permissions = hasFullShopAccess
    ? ["*"]
    : Array.from(permissionSet).sort();

  return {
    role,
    unrestricted: false,
    shopIds: shops.map(
      (shop) => shop.shopId,
    ),
    permissions,
    capabilities:
      buildShopCapabilities(
        permissions,
        hasFullShopAccess,
      ),
    shops,
  };
}


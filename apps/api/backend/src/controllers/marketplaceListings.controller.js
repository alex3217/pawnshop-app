import { prisma } from "../lib/prisma.js";

const LISTING_TYPES = new Set([
  "CUSTOMER_TO_CUSTOMER",
  "CUSTOMER_TO_SHOP",
  "SHOP_TO_CUSTOMER",
  "SHOP_TO_SHOP",
]);

const LISTING_STATUSES = new Set([
  "DRAFT",
  "ACTIVE",
  "RESERVED",
  "SOLD",
  "PAUSED",
  "EXPIRED",
  "CANCELED",
  "REMOVED",
]);

const CUSTOMER_LISTING_TYPES = new Set([
  "CUSTOMER_TO_CUSTOMER",
  "CUSTOMER_TO_SHOP",
]);

const SHOP_LISTING_TYPES = new Set([
  "SHOP_TO_CUSTOMER",
  "SHOP_TO_SHOP",
]);

const LISTING_INCLUDE = {
  seller: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  sellerShop: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      phone: true,
      ownerId: true,
    },
  },
  item: {
    select: {
      id: true,
      title: true,
      status: true,
      pawnShopId: true,
    },
  },
};

function sendError(res, error, fallback = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallback,
  });
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function normalizeEnum(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return fallback;
}

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }

  return number;
}

function normalizePrice(value) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeString)
    .filter(Boolean)
    .slice(0, 20);
}

function normalizePagination(query = {}) {
  const requestedPage = Number(query.page);
  const requestedLimit = Number(query.limit);

  const page =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 24;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function isAdminRole(role) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

async function assertSellerShopAccess({
  sellerShopId,
  userId,
  role,
}) {
  if (!sellerShopId) {
    const error = new Error("sellerShopId is required for shop listings");
    error.statusCode = 400;
    throw error;
  }

  const shop = await prisma.pawnShop.findUnique({
    where: {
      id: sellerShopId,
    },
    select: {
      id: true,
      ownerId: true,
      isDeleted: true,
    },
  });

  if (!shop || shop.isDeleted) {
    const error = new Error("Seller shop not found");
    error.statusCode = 404;
    throw error;
  }

  if (!isAdminRole(role) && shop.ownerId !== userId) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  return shop;
}

async function assertLinkedItemAccess({
  itemId,
  userId,
  role,
  sellerShopId,
}) {
  if (!itemId) return null;

  const item = await prisma.item.findUnique({
    where: {
      id: itemId,
    },
    select: {
      id: true,
      pawnShopId: true,
      isDeleted: true,
      shop: {
        select: {
          id: true,
          ownerId: true,
        },
      },
    },
  });

  if (!item || item.isDeleted) {
    const error = new Error("Linked item not found");
    error.statusCode = 404;
    throw error;
  }

  if (sellerShopId && item.pawnShopId !== sellerShopId) {
    const error = new Error("Linked item does not belong to the selected shop");
    error.statusCode = 400;
    throw error;
  }

  if (!isAdminRole(role) && item.shop?.ownerId !== userId) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  return item;
}

async function getOwnedListingOrThrow({
  listingId,
  userId,
  role,
}) {
  const listing = await prisma.marketplaceListing.findUnique({
    where: {
      id: listingId,
    },
    include: LISTING_INCLUDE,
  });

  if (!listing) {
    const error = new Error("Marketplace listing not found");
    error.statusCode = 404;
    throw error;
  }

  if (!isAdminRole(role) && listing.sellerUserId !== userId) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  return listing;
}

function validateListingActor({
  listingType,
  role,
  sellerShopId,
}) {
  if (!LISTING_TYPES.has(listingType)) {
    const error = new Error("Invalid marketplace listing type");
    error.statusCode = 400;
    throw error;
  }

  if (
    CUSTOMER_LISTING_TYPES.has(listingType) &&
    !["CONSUMER", "ADMIN", "SUPER_ADMIN"].includes(role)
  ) {
    const error = new Error(
      "Customer marketplace listings require a consumer account",
    );
    error.statusCode = 403;
    throw error;
  }

  if (
    SHOP_LISTING_TYPES.has(listingType) &&
    !["OWNER", "ADMIN", "SUPER_ADMIN"].includes(role)
  ) {
    const error = new Error(
      "Shop marketplace listings require an owner account",
    );
    error.statusCode = 403;
    throw error;
  }

  if (CUSTOMER_LISTING_TYPES.has(listingType) && sellerShopId) {
    const error = new Error(
      "Customer marketplace listings cannot include sellerShopId",
    );
    error.statusCode = 400;
    throw error;
  }
}

function buildListingWriteData(body = {}, existing = null) {
  const data = {};

  if (body.title !== undefined) {
    data.title = normalizeString(body.title);
  }

  if (body.description !== undefined) {
    data.description = normalizeString(body.description);
  }

  if (body.category !== undefined) {
    data.category = normalizeString(body.category);
  }

  if (body.condition !== undefined) {
    data.condition = normalizeString(body.condition);
  }

  if (body.price !== undefined) {
    data.price = normalizePrice(body.price);
  }

  if (body.currency !== undefined) {
    data.currency =
      normalizeEnum(body.currency) || existing?.currency || "USD";
  }

  if (body.quantity !== undefined) {
    data.quantity = normalizePositiveInteger(
      body.quantity,
      existing?.quantity || 1,
    );
  }

  if (body.images !== undefined) {
    data.images = normalizeImages(body.images);
  }

  if (body.allowOffers !== undefined) {
    data.allowOffers = normalizeBoolean(
      body.allowOffers,
      existing?.allowOffers ?? true,
    );
  }

  if (body.pickupAvailable !== undefined) {
    data.pickupAvailable = normalizeBoolean(
      body.pickupAvailable,
      existing?.pickupAvailable ?? true,
    );
  }

  if (body.shippingAvailable !== undefined) {
    data.shippingAvailable = normalizeBoolean(
      body.shippingAvailable,
      existing?.shippingAvailable ?? false,
    );
  }

  if (body.expiresAt !== undefined) {
    const expiresAt = normalizeString(body.expiresAt);

    if (!expiresAt) {
      data.expiresAt = null;
    } else {
      const date = new Date(expiresAt);

      if (Number.isNaN(date.getTime())) {
        const error = new Error("expiresAt must be a valid date");
        error.statusCode = 400;
        throw error;
      }

      data.expiresAt = date;
    }
  }

  if (body.metadata !== undefined) {
    data.metadata =
      body.metadata &&
      typeof body.metadata === "object" &&
      !Array.isArray(body.metadata)
        ? body.metadata
        : null;
  }

  return data;
}

function assertRequiredListingData(data, existing = null) {
  const title = data.title ?? existing?.title;
  const price = data.price ?? existing?.price;

  if (!title) {
    const error = new Error("title is required");
    error.statusCode = 400;
    throw error;
  }

  if (price === null || price === undefined || Number(price) <= 0) {
    const error = new Error("A valid price is required");
    error.statusCode = 400;
    throw error;
  }

  const pickupAvailable =
    data.pickupAvailable ?? existing?.pickupAvailable ?? true;

  const shippingAvailable =
    data.shippingAvailable ?? existing?.shippingAvailable ?? false;

  if (!pickupAvailable && !shippingAvailable) {
    const error = new Error(
      "At least one fulfillment method must be available",
    );
    error.statusCode = 400;
    throw error;
  }
}

export async function createMarketplaceListing(req, res) {
  try {
    const sellerUserId = req?.user?.sub;
    const role = req?.user?.role;

    if (!sellerUserId || !role) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const listingType = normalizeEnum(req.body?.listingType);
    const sellerShopId = normalizeString(req.body?.sellerShopId);
    const itemId = normalizeString(req.body?.itemId);

    validateListingActor({
      listingType,
      role,
      sellerShopId,
    });

    if (SHOP_LISTING_TYPES.has(listingType)) {
      await assertSellerShopAccess({
        sellerShopId,
        userId: sellerUserId,
        role,
      });
    }

    if (itemId) {
      if (!SHOP_LISTING_TYPES.has(listingType)) {
        return res.status(400).json({
          success: false,
          error: "Only shop listings may link existing inventory items",
        });
      }

      await assertLinkedItemAccess({
        itemId,
        userId: sellerUserId,
        role,
        sellerShopId,
      });
    }

    const data = buildListingWriteData(req.body);
    assertRequiredListingData(data);

    const listing = await prisma.marketplaceListing.create({
      data: {
        ...data,
        itemId,
        sellerUserId,
        sellerShopId:
          SHOP_LISTING_TYPES.has(listingType)
            ? sellerShopId
            : null,
        listingType,
        status: "DRAFT",
      },
      include: LISTING_INCLUDE,
    });

    return res.status(201).json({
      success: true,
      listing,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to create marketplace listing",
    );
  }
}

export async function listMarketplaceListings(req, res) {
  try {
    const { page, limit, skip } = normalizePagination(req.query);

    const listingType = normalizeEnum(req.query?.listingType);
    const category = normalizeString(req.query?.category);
    const search = normalizeString(req.query?.search);
    const sellerShopId = normalizeString(req.query?.sellerShopId);

    if (listingType && !LISTING_TYPES.has(listingType)) {
      return res.status(400).json({
        success: false,
        error: "Invalid marketplace listing type",
      });
    }

    const where = {
      status: "ACTIVE",
      ...(listingType ? { listingType } : {}),
      ...(category
        ? {
            category: {
              equals: category,
              mode: "insensitive",
            },
          }
        : {}),
      ...(sellerShopId ? { sellerShopId } : {}),
      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                description: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                category: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.marketplaceListing.findMany({
        where,
        orderBy: [
          {
            featuredUntil: "desc",
          },
          {
            publishedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip,
        take: limit,
        include: LISTING_INCLUDE,
      }),
      prisma.marketplaceListing.count({
        where,
      }),
    ]);

    return res.json({
      success: true,
      rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load marketplace listings",
    );
  }
}

export async function getMarketplaceListing(req, res) {
  try {
    const listingId = normalizeString(req.params?.id);

    if (!listingId) {
      return res.status(400).json({
        success: false,
        error: "Marketplace listing id is required",
      });
    }

    const listing = await prisma.marketplaceListing.findFirst({
      where: {
        id: listingId,
        status: "ACTIVE",
      },
      include: LISTING_INCLUDE,
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: "Marketplace listing not found",
      });
    }

    return res.json({
      success: true,
      listing,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load marketplace listing",
    );
  }
}

export async function listMyMarketplaceListings(req, res) {
  try {
    const sellerUserId = req?.user?.sub;

    if (!sellerUserId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const status = normalizeEnum(req.query?.status);
    const listingType = normalizeEnum(req.query?.listingType);

    if (status && !LISTING_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid marketplace listing status",
      });
    }

    if (listingType && !LISTING_TYPES.has(listingType)) {
      return res.status(400).json({
        success: false,
        error: "Invalid marketplace listing type",
      });
    }

    const rows = await prisma.marketplaceListing.findMany({
      where: {
        sellerUserId,
        ...(status ? { status } : {}),
        ...(listingType ? { listingType } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      include: LISTING_INCLUDE,
    });

    return res.json({
      success: true,
      rows,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load your marketplace listings",
    );
  }
}

export async function updateMarketplaceListing(req, res) {
  try {
    const userId = req?.user?.sub;
    const role = req?.user?.role;
    const listingId = normalizeString(req.params?.id);

    if (!userId || !role) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    if (!listingId) {
      return res.status(400).json({
        success: false,
        error: "Marketplace listing id is required",
      });
    }

    const existing = await getOwnedListingOrThrow({
      listingId,
      userId,
      role,
    });

    if (!["DRAFT", "PAUSED"].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        error: "Only draft or paused listings can be edited",
      });
    }

    const data = buildListingWriteData(req.body, existing);
    assertRequiredListingData(data, existing);

    const listing = await prisma.marketplaceListing.update({
      where: {
        id: listingId,
      },
      data,
      include: LISTING_INCLUDE,
    });

    return res.json({
      success: true,
      listing,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to update marketplace listing",
    );
  }
}

export async function publishMarketplaceListing(req, res) {
  try {
    const userId = req?.user?.sub;
    const role = req?.user?.role;
    const listingId = normalizeString(req.params?.id);

    if (!userId || !role) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const existing = await getOwnedListingOrThrow({
      listingId,
      userId,
      role,
    });

    if (!["DRAFT", "PAUSED"].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        error: "Only draft or paused listings can be published",
      });
    }

    assertRequiredListingData({}, existing);

    const listing = await prisma.marketplaceListing.update({
      where: {
        id: listingId,
      },
      data: {
        status: "ACTIVE",
        publishedAt: existing.publishedAt || new Date(),
      },
      include: LISTING_INCLUDE,
    });

    return res.json({
      success: true,
      listing,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to publish marketplace listing",
    );
  }
}

export async function pauseMarketplaceListing(req, res) {
  try {
    const userId = req?.user?.sub;
    const role = req?.user?.role;
    const listingId = normalizeString(req.params?.id);

    if (!userId || !role) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const existing = await getOwnedListingOrThrow({
      listingId,
      userId,
      role,
    });

    if (existing.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        error: "Only active listings can be paused",
      });
    }

    const listing = await prisma.marketplaceListing.update({
      where: {
        id: listingId,
      },
      data: {
        status: "PAUSED",
      },
      include: LISTING_INCLUDE,
    });

    return res.json({
      success: true,
      listing,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to pause marketplace listing",
    );
  }
}

export async function cancelMarketplaceListing(req, res) {
  try {
    const userId = req?.user?.sub;
    const role = req?.user?.role;
    const listingId = normalizeString(req.params?.id);

    if (!userId || !role) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const existing = await getOwnedListingOrThrow({
      listingId,
      userId,
      role,
    });

    if (
      ["SOLD", "CANCELED", "REMOVED"].includes(existing.status)
    ) {
      return res.status(400).json({
        success: false,
        error: "This listing can no longer be canceled",
      });
    }

    const listing = await prisma.marketplaceListing.update({
      where: {
        id: listingId,
      },
      data: {
        status: "CANCELED",
      },
      include: LISTING_INCLUDE,
    });

    return res.json({
      success: true,
      listing,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to cancel marketplace listing",
    );
  }
}

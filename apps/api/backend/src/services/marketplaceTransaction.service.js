import { prisma } from "../lib/prisma.js";

const TRANSACTION_TYPES = new Set([
  "DIRECT_PURCHASE",
  "ACCEPTED_OFFER",
  "DEALER_TRANSFER",
  "CUSTOMER_SELL_TO_SHOP",
]);

const TRANSACTION_STATUSES = new Set([
  "PENDING",
  "PAYMENT_PROCESSING",
  "PAID",
  "FULFILLING",
  "COMPLETED",
  "CANCELED",
  "REFUNDED",
  "DISPUTED",
]);

const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  role: true,
};

const SHOP_SUMMARY_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  phone: true,
  ownerId: true,
};

const LISTING_SUMMARY_SELECT = {
  id: true,
  itemId: true,
  sellerUserId: true,
  sellerShopId: true,
  listingType: true,
  status: true,
  title: true,
  description: true,
  category: true,
  condition: true,
  price: true,
  currency: true,
  quantity: true,
  images: true,
  pickupAvailable: true,
  shippingAvailable: true,
  createdAt: true,
  updatedAt: true,
};

const TRANSACTION_INCLUDE = {
  listing: {
    select: LISTING_SUMMARY_SELECT,
  },
  buyer: {
    select: USER_SUMMARY_SELECT,
  },
  buyerShop: {
    select: SHOP_SUMMARY_SELECT,
  },
  seller: {
    select: USER_SUMMARY_SELECT,
  },
  sellerShop: {
    select: SHOP_SUMMARY_SELECT,
  },
};

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeEnum(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  return normalized || null;
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
      : 25;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function isAdminRole(role) {
  const normalizedRole = normalizeEnum(role);

  return (
    normalizedRole === "ADMIN" ||
    normalizedRole === "SUPER_ADMIN"
  );
}

function validateFilters(query = {}) {
  const status = normalizeEnum(query.status);
  const type = normalizeEnum(query.type);

  if (status && !TRANSACTION_STATUSES.has(status)) {
    throw httpError(
      "Invalid marketplace transaction status",
      400,
    );
  }

  if (type && !TRANSACTION_TYPES.has(type)) {
    throw httpError(
      "Invalid marketplace transaction type",
      400,
    );
  }

  return {
    status,
    type,
  };
}

async function listTransactions({
  userId,
  participantField,
  query = {},
}) {
  if (!userId) {
    throw httpError("Unauthorized", 401);
  }

  const { page, limit, skip } =
    normalizePagination(query);

  const { status, type } = validateFilters(query);

  const where = {
    [participantField]: userId,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.marketplaceTransaction.findMany({
      where,
      include: TRANSACTION_INCLUDE,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),

    prisma.marketplaceTransaction.count({
      where,
    }),
  ]);

  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      pages:
        total === 0
          ? 0
          : Math.ceil(total / limit),
    },
  };
}

export async function listMarketplacePurchases({
  userId,
  query = {},
}) {
  return listTransactions({
    userId,
    participantField: "buyerUserId",
    query,
  });
}

export async function listMarketplaceSales({
  userId,
  query = {},
}) {
  return listTransactions({
    userId,
    participantField: "sellerUserId",
    query,
  });
}

export async function getMarketplaceTransaction({
  transactionId,
  userId,
  role,
}) {
  if (!userId) {
    throw httpError("Unauthorized", 401);
  }

  const id = String(transactionId || "").trim();

  if (!id) {
    throw httpError(
      "Marketplace transaction ID is required",
      400,
    );
  }

  const transaction =
    await prisma.marketplaceTransaction.findUnique({
      where: {
        id,
      },
      include: TRANSACTION_INCLUDE,
    });

  if (!transaction) {
    throw httpError(
      "Marketplace transaction not found",
      404,
    );
  }

  const mayAccess =
    isAdminRole(role) ||
    transaction.buyerUserId === userId ||
    transaction.sellerUserId === userId ||
    transaction.buyerShop?.ownerId === userId ||
    transaction.sellerShop?.ownerId === userId;

  if (!mayAccess) {
    throw httpError("Forbidden", 403);
  }

  return transaction;
}

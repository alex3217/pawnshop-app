import { prisma } from "../../lib/prisma.js";

const VALID_STATUSES = new Set([
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELED",
]);

function normalizeRequiredId(value, fieldName) {
  const id = String(value || "").trim();

  if (!id) {
    throw new Error(`${fieldName} is required`);
  }

  return id;
}

function normalizePositiveInteger(
  value,
  fallback,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

function normalizeStatus(value) {
  const status = String(value || "")
    .trim()
    .toUpperCase();

  if (!status) {
    return null;
  }

  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Unsupported payout status: ${status}`);
  }

  return status;
}

function normalizeDate(value, fieldName) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }

  return date;
}

export function buildSellerPayoutHistoryQuery({
  sellerUserId,
  shopId,
  page = 1,
  limit = 25,
  status,
  from,
  to,
} = {}) {
  const safeSellerUserId = normalizeRequiredId(
    sellerUserId,
    "sellerUserId",
  );

  const safeShopId = normalizeRequiredId(
    shopId,
    "shopId",
  );

  const safePage = normalizePositiveInteger(page, 1);
  const safeLimit = normalizePositiveInteger(limit, 25, 100);
  const safeStatus = normalizeStatus(status);
  const safeFrom = normalizeDate(from, "from");
  const safeTo = normalizeDate(to, "to");

  if (safeFrom && safeTo && safeFrom > safeTo) {
    throw new Error("from must be before or equal to to");
  }

  const where = {
    sellerUserId: safeSellerUserId,
    shopId: safeShopId,
  };

  if (safeStatus) {
    where.status = safeStatus;
  }

  if (safeFrom || safeTo) {
    where.requestedAt = {};

    if (safeFrom) {
      where.requestedAt.gte = safeFrom;
    }

    if (safeTo) {
      where.requestedAt.lte = safeTo;
    }
  }

  return {
    sellerUserId: safeSellerUserId,
    shopId: safeShopId,
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    where,
  };
}

export async function getSellerPayoutHistory({
  sellerUserId,
  shopId,
  page,
  limit,
  status,
  from,
  to,
  prismaClient = prisma,
} = {}) {
  const query = buildSellerPayoutHistoryQuery({
    sellerUserId,
    shopId,
    page,
    limit,
    status,
    from,
    to,
  });

  const [rows, total] = await Promise.all([
    prismaClient.sellerPayout.findMany({
      where: query.where,
      select: {
        id: true,
        sellerUserId: true,
        shopId: true,
        status: true,
        amountCents: true,
        currency: true,
        provider: true,
        providerPayoutId: true,
        idempotencyKey: true,
        failureCode: true,
        failureMessage: true,
        requestedAt: true,
        processingAt: true,
        paidAt: true,
        failedAt: true,
        canceledAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        {
          requestedAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      skip: query.skip,
      take: query.limit,
    }),

    prismaClient.sellerPayout.count({
      where: query.where,
    }),
  ]);

  return {
    rows,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(total / query.limit),
    },
    filters: {
      status: query.where.status || null,
      from: query.where.requestedAt?.gte || null,
      to: query.where.requestedAt?.lte || null,
    },
  };
}

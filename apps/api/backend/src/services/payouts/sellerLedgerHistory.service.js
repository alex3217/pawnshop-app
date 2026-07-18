import { prisma } from "../../lib/prisma.js";

const VALID_TYPES = new Set([
  "SETTLEMENT_CREDIT",
  "PAYOUT_DEBIT",
  "REFUND_DEBIT",
  "REVERSAL_CREDIT",
  "ADJUSTMENT_CREDIT",
  "ADJUSTMENT_DEBIT",
]);

const VALID_STATUSES = new Set([
  "PENDING",
  "AVAILABLE",
  "HELD",
  "PAID",
  "REVERSED",
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

function normalizeEnum(value, validValues, fieldName) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (!normalized) {
    return null;
  }

  if (!validValues.has(normalized)) {
    throw new Error(`Unsupported ${fieldName}: ${normalized}`);
  }

  return normalized;
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

export function buildSellerLedgerHistoryQuery({
  sellerUserId,
  shopId,
  page = 1,
  limit = 25,
  type,
  status,
  from,
  to,
} = {}) {
  const safeSellerUserId = normalizeRequiredId(
    sellerUserId,
    "sellerUserId",
  );

  const safeShopId = normalizeRequiredId(shopId, "shopId");
  const safePage = normalizePositiveInteger(page, 1);
  const safeLimit = normalizePositiveInteger(limit, 25, 100);

  const safeType = normalizeEnum(
    type,
    VALID_TYPES,
    "ledger type",
  );

  const safeStatus = normalizeEnum(
    status,
    VALID_STATUSES,
    "ledger status",
  );

  const safeFrom = normalizeDate(from, "from");
  const safeTo = normalizeDate(to, "to");

  if (safeFrom && safeTo && safeFrom > safeTo) {
    throw new Error("from must be before or equal to to");
  }

  const where = {
    sellerUserId: safeSellerUserId,
    shopId: safeShopId,
  };

  if (safeType) {
    where.type = safeType;
  }

  if (safeStatus) {
    where.status = safeStatus;
  }

  if (safeFrom || safeTo) {
    where.createdAt = {};

    if (safeFrom) {
      where.createdAt.gte = safeFrom;
    }

    if (safeTo) {
      where.createdAt.lte = safeTo;
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

export async function getSellerLedgerHistory({
  sellerUserId,
  shopId,
  page,
  limit,
  type,
  status,
  from,
  to,
  prismaClient = prisma,
} = {}) {
  const query = buildSellerLedgerHistoryQuery({
    sellerUserId,
    shopId,
    page,
    limit,
    type,
    status,
    from,
    to,
  });

  const [rows, total] = await Promise.all([
    prismaClient.sellerBalanceLedger.findMany({
      where: query.where,
      select: {
        id: true,
        settlementId: true,
        payoutId: true,
        sellerUserId: true,
        shopId: true,
        type: true,
        status: true,
        amountCents: true,
        currency: true,
        availableAt: true,
        description: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      skip: query.skip,
      take: query.limit,
    }),

    prismaClient.sellerBalanceLedger.count({
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
      type: query.where.type || null,
      status: query.where.status || null,
      from: query.where.createdAt?.gte || null,
      to: query.where.createdAt?.lte || null,
    },
  };
}

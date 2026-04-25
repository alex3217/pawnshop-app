// File: apps/api/backend/src/controllers/auctions.controller.js

import { prisma } from "../lib/prisma.js";

const AUCTION_SAFE_FIELDS = [
  "id",
  "itemId",
  "shopId",
  "status",
  "startingPrice",
  "minIncrement",
  "reservePrice",
  "buyItNowPrice",
  "startsAt",
  "endsAt",
  "antiSnipeWindowSec",
  "extendedEndsAt",
  "currentPrice",
  "version",
  "createdAt",
  "updatedAt",
];

const ITEM_SAFE_FIELDS = [
  "id",
  "pawnShopId",
  "title",
  "description",
  "price",
  "currency",
  "images",
  "category",
  "condition",
  "status",
  "createdAt",
  "updatedAt",
  "isDeleted",
];

const PAWNSHOP_SAFE_FIELDS = [
  "id",
  "name",
  "address",
  "phone",
  "description",
  "hours",
  "ownerId",
  "createdAt",
  "updatedAt",
  "isDeleted",
];

const VALID_AUCTION_STATUSES = new Set([
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "CANCELED",
]);

const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const rows = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;

  const columns = new Set(
    Array.isArray(rows) ? rows.map((row) => row.column_name) : []
  );

  tableColumnsCache.set(tableName, columns);
  return columns;
}

async function buildScalarSelect(tableName, requestedFields) {
  const actualColumns = await getTableColumns(tableName);
  const select = {};

  for (const field of requestedFields) {
    if (actualColumns.has(field)) {
      select[field] = true;
    }
  }

  if (!select.id) {
    throw new Error(`${tableName} schema is invalid: missing required "id" column`);
  }

  return select;
}

async function buildPawnShopSelect(extraFields = []) {
  return buildScalarSelect("PawnShop", [...PAWNSHOP_SAFE_FIELDS, ...extraFields]);
}

async function buildItemSelect({ includeShop = false, extraFields = [] } = {}) {
  const select = await buildScalarSelect("Item", [...ITEM_SAFE_FIELDS, ...extraFields]);

  if (includeShop) {
    select.shop = { select: await buildPawnShopSelect() };
  }

  return select;
}

async function buildAuctionSelect({
  includeItem = false,
  includeShop = false,
  extraFields = [],
} = {}) {
  const select = await buildScalarSelect("Auction", [...AUCTION_SAFE_FIELDS, ...extraFields]);

  if (includeItem) {
    select.item = { select: await buildItemSelect({ includeShop: true }) };
  }

  if (includeShop) {
    select.shop = { select: await buildPawnShopSelect() };
  }

  return select;
}

function toPositivePage(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeString(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeStringOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeAuctionStatusInput(value) {
  const normalized = normalizeStringOrNull(value);
  if (normalized === undefined || normalized === null) return normalized;

  const upper = String(normalized).trim().toUpperCase();
  const canonical = upper === "CANCELLED" ? "CANCELED" : upper;
  return VALID_AUCTION_STATUSES.has(canonical) ? canonical : null;
}

function toDecimalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toNullableDate(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveAuctionStatus(body = {}) {
  return normalizeAuctionStatusInput(body.status);
}

function getEffectiveAuctionEnd(auction) {
  return auction?.extendedEndsAt || auction?.endsAt || null;
}

function hasStarted(auction, now = new Date()) {
  if (!auction?.startsAt) return true;
  return now >= new Date(auction.startsAt);
}

function hasEnded(auction, now = new Date()) {
  const end = getEffectiveAuctionEnd(auction);
  if (!end) return false;
  return now >= new Date(end);
}

function getEffectiveAuctionStatus(auction, now = new Date()) {
  if (!auction) return "ENDED";
  if (auction.status === "CANCELED") return "CANCELED";

  if (!hasStarted(auction, now)) {
    return "SCHEDULED";
  }

  if (hasEnded(auction, now)) {
    return "ENDED";
  }

  return "LIVE";
}

function normalizeAuctionForResponse(auction, now = new Date()) {
  if (!auction) return auction;

  return {
    ...auction,
    status: getEffectiveAuctionStatus(auction, now),
  };
}

function resolveCreateStatus({ requestedStatus, startsAt, endsAt, now = new Date() }) {
  if (requestedStatus) {
    return requestedStatus;
  }

  const syntheticAuction = {
    status: "LIVE",
    startsAt,
    endsAt,
    extendedEndsAt: null,
  };

  return getEffectiveAuctionStatus(syntheticAuction, now);
}

function mergeWhere(...parts) {
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0];
  return { AND: filtered };
}

function buildEffectiveStatusWhere(status, now, auctionColumns) {
  if (!status || !auctionColumns.has("status")) {
    return null;
  }

  const normalized = normalizeAuctionStatusInput(status);
  if (!normalized) {
    return null;
  }

  const hasStartsAt = auctionColumns.has("startsAt");
  const hasEndsAt = auctionColumns.has("endsAt");
  const hasExtendedEndsAt = auctionColumns.has("extendedEndsAt");

  if (!hasStartsAt || !hasEndsAt) {
    return { status: normalized };
  }

  if (normalized === "CANCELED") {
    return { status: "CANCELED" };
  }

  if (normalized === "SCHEDULED") {
    return {
      AND: [
        { status: { notIn: ["CANCELED", "ENDED"] } },
        { startsAt: { gt: now } },
      ],
    };
  }

  if (normalized === "LIVE") {
    const liveEndClauses = hasExtendedEndsAt
      ? [
          { extendedEndsAt: { gt: now } },
          {
            AND: [
              { extendedEndsAt: null },
              { endsAt: { gt: now } },
            ],
          },
        ]
      : [{ endsAt: { gt: now } }];

    return {
      AND: [
        { status: { notIn: ["CANCELED", "ENDED"] } },
        { startsAt: { lte: now } },
        { OR: liveEndClauses },
      ],
    };
  }

  const endedClauses = hasExtendedEndsAt
    ? [
        { extendedEndsAt: { lte: now } },
        {
          AND: [
            { extendedEndsAt: null },
            { endsAt: { lte: now } },
          ],
        },
      ]
    : [{ endsAt: { lte: now } }];

  return {
    OR: [
      { status: "ENDED" },
      {
        AND: [
          { status: { not: "CANCELED" } },
          { OR: endedClauses },
        ],
      },
    ],
  };
}

function getStaleExpiredAuctionIds(rows, now = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows
    .filter((row) => row && row.id)
    .filter((row) => row.status !== "CANCELED" && row.status !== "ENDED")
    .filter((row) => getEffectiveAuctionStatus(row, now) === "ENDED")
    .map((row) => row.id);
}

async function reconcileExpiredAuctions(ids, auctionColumns) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (!auctionColumns.has("status")) return;

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;

  try {
    await prisma.auction.updateMany({
      where: {
        id: { in: uniqueIds },
        status: { notIn: ["ENDED", "CANCELED"] },
      },
      data: { status: "ENDED" },
    });
  } catch (_err) {
    // Non-fatal. Read responses still return effective status.
  }
}

async function reconcileExpiredAuction(auction, auctionColumns, now = new Date()) {
  if (!auction) return auction;
  if (!auctionColumns.has("status")) return auction;

  const effectiveStatus = getEffectiveAuctionStatus(auction, now);
  if (effectiveStatus !== "ENDED" || auction.status === "ENDED") {
    return auction;
  }

  try {
    await prisma.auction.update({
      where: { id: auction.id },
      data: { status: "ENDED" },
    });
  } catch (_err) {
    // Non-fatal. Response will still return ENDED.
  }

  return {
    ...auction,
    status: "ENDED",
  };
}

function handleControllerError(res, err, fallback = "Internal Server Error") {
  const statusCode =
    Number.isInteger(err?.statusCode) && err.statusCode >= 400
      ? err.statusCode
      : 500;

  const message = err?.message || fallback;
  return res.status(statusCode).json({ error: message });
}

async function upsertSettlementForEndedAuction(auctionId) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      item: {
        include: {
          shop: true,
        },
      },
      shop: true,
      bids: {
        orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
        take: 1,
        include: {
          user: true,
        },
      },
    },
  });

  if (!auction) {
    return { settlement: null, reason: "AUCTION_NOT_FOUND" };
  }

  const topBid = auction.bids?.[0] || null;
  if (!topBid?.userId) {
    return { settlement: null, reason: "NO_BIDS" };
  }

  const finalPrice = Number(topBid.amount);
  if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
    return { settlement: null, reason: "INVALID_TOP_BID" };
  }

  const settlement = await prisma.settlement.upsert({
    where: { auctionId },
    update: {
      winnerUserId: topBid.userId,
      finalPrice,
      currency: "USD",
      status: "CHARGED",
      stripePaymentIntent: null,
    },
    create: {
      auctionId,
      winnerUserId: topBid.userId,
      finalPrice,
      currency: "USD",
      status: "CHARGED",
      stripePaymentIntent: null,
    },
    include: {
      auction: {
        include: {
          item: true,
          shop: true,
        },
      },
      winner: true,
    },
  });

  return { settlement, reason: "CREATED_OR_UPDATED" };
}

export async function listAuctions(req, res) {
  try {
    const {
      page = "1",
      limit = "20",
      status,
      shopId,
      itemId,
    } = req.query;

    const pageNum = toPositivePage(page, 1);
    const pageSize = Math.min(100, toPositivePage(limit, 20));
    const now = new Date();

    const auctionColumns = await getTableColumns("Auction");

    if (status !== undefined) {
      const normalizedStatus = normalizeAuctionStatusInput(status);
      if (!normalizedStatus) {
        return res.status(400).json({ error: "Invalid status" });
      }
    }

    const baseWhere = {
      ...(shopId && auctionColumns.has("shopId") ? { shopId: String(shopId) } : {}),
      ...(itemId && auctionColumns.has("itemId") ? { itemId: String(itemId) } : {}),
    };

    const effectiveStatusWhere = buildEffectiveStatusWhere(status, now, auctionColumns);
    const where = mergeWhere(baseWhere, effectiveStatusWhere);

    const select = await buildAuctionSelect({
      includeItem: true,
      includeShop: true,
    });

    const [total, rows] = await Promise.all([
      prisma.auction.count({ where }),
      prisma.auction.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select,
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const staleExpiredIds = getStaleExpiredAuctionIds(rows, now);
    await reconcileExpiredAuctions(staleExpiredIds, auctionColumns);

    return res.json({
      page: pageNum,
      limit: pageSize,
      total,
      rows: rows.map((row) => normalizeAuctionForResponse(row, now)),
    });
  } catch (err) {
    return handleControllerError(res, err, "Failed to list auctions");
  }
}

export async function getAuction(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing auction id" });
    }

    const auctionColumns = await getTableColumns("Auction");
    let auction = await prisma.auction.findUnique({
      where: { id },
      select: await buildAuctionSelect({
        includeItem: true,
        includeShop: true,
      }),
    });

    if (!auction) {
      return res.status(404).json({ error: "Auction not found" });
    }

    auction = await reconcileExpiredAuction(auction, auctionColumns, new Date());

    return res.json(normalizeAuctionForResponse(auction, new Date()));
  } catch (err) {
    return handleControllerError(res, err, "Failed to get auction");
  }
}

export async function createAuction(req, res) {
  try {
    const rawBody = req.body || {};

    const itemId = normalizeString(rawBody.itemId);
    const shopId = normalizeString(rawBody.shopId);
    const requestedStatus = resolveAuctionStatus(rawBody);

    if (rawBody.status !== undefined && requestedStatus === null) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const startingPrice = toDecimalNumber(rawBody.startingPrice ?? rawBody.startingPriceCents);
    const minIncrement = toDecimalNumber(rawBody.minIncrement ?? rawBody.minIncrementCents);
    const reservePrice = toDecimalNumber(rawBody.reservePrice ?? rawBody.reservePriceCents);
    const buyItNowPrice = toDecimalNumber(rawBody.buyItNowPrice ?? rawBody.buyItNowPriceCents);
    const currentPrice = toDecimalNumber(rawBody.currentPrice ?? rawBody.currentPriceCents);

    const startsAt = toNullableDate(rawBody.startsAt);
    const endsAt = toNullableDate(rawBody.endsAt);
    const antiSnipeWindowSec = rawBody.antiSnipeWindowSec === undefined
      ? undefined
      : Number.parseInt(String(rawBody.antiSnipeWindowSec), 10);

    if (
      !itemId ||
      !shopId ||
      startsAt === undefined ||
      endsAt === undefined ||
      startingPrice === undefined
    ) {
      return res.status(400).json({
        error: "Missing fields",
        required: ["itemId", "shopId", "startingPrice", "startsAt", "endsAt"],
      });
    }

    if (startsAt === null || endsAt === null) {
      return res.status(400).json({ error: "Invalid startsAt or endsAt" });
    }

    if (endsAt <= startsAt) {
      return res.status(400).json({ error: "endsAt must be after startsAt" });
    }

    if (!Number.isFinite(startingPrice) || startingPrice < 0) {
      return res.status(400).json({ error: "Invalid startingPrice" });
    }

    if (minIncrement !== undefined && (!Number.isFinite(minIncrement) || minIncrement < 0)) {
      return res.status(400).json({ error: "Invalid minIncrement" });
    }

    if (reservePrice !== undefined && (!Number.isFinite(reservePrice) || reservePrice < 0)) {
      return res.status(400).json({ error: "Invalid reservePrice" });
    }

    if (buyItNowPrice !== undefined && (!Number.isFinite(buyItNowPrice) || buyItNowPrice < 0)) {
      return res.status(400).json({ error: "Invalid buyItNowPrice" });
    }

    if (currentPrice !== undefined && (!Number.isFinite(currentPrice) || currentPrice < 0)) {
      return res.status(400).json({ error: "Invalid currentPrice" });
    }

    if (
      antiSnipeWindowSec !== undefined &&
      (!Number.isInteger(antiSnipeWindowSec) || antiSnipeWindowSec < 0)
    ) {
      return res.status(400).json({ error: "Invalid antiSnipeWindowSec" });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: await buildItemSelect({ includeShop: true }),
    });

    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (!item.shop || item.shop.isDeleted) {
      return res.status(404).json({ error: "Shop not found" });
    }

    if (item.pawnShopId !== shopId) {
      return res.status(400).json({ error: "itemId and shopId do not match" });
    }

    if (!req.user?.sub || !req.user?.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.role !== "ADMIN" && item.shop.ownerId !== req.user.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const existing = await prisma.auction.findFirst({
      where: { itemId },
      select: { id: true, status: true },
    });

    if (existing) {
      return res.status(409).json({
        error: "Auction already exists for this item",
        auctionId: existing.id,
        status: existing.status,
      });
    }

    const auctionColumns = await getTableColumns("Auction");
    const resolvedStatus = resolveCreateStatus({
      requestedStatus,
      startsAt,
      endsAt,
      now: new Date(),
    });

    const data = {
      ...(auctionColumns.has("itemId") ? { itemId } : {}),
      ...(auctionColumns.has("shopId") ? { shopId } : {}),
      ...(auctionColumns.has("status") ? { status: resolvedStatus } : {}),
      ...(auctionColumns.has("startingPrice") ? { startingPrice } : {}),
      ...(auctionColumns.has("minIncrement") ? { minIncrement: minIncrement ?? 1 } : {}),
      ...(auctionColumns.has("reservePrice") && reservePrice !== undefined
        ? { reservePrice }
        : {}),
      ...(auctionColumns.has("buyItNowPrice") && buyItNowPrice !== undefined
        ? { buyItNowPrice }
        : {}),
      ...(auctionColumns.has("startsAt") ? { startsAt } : {}),
      ...(auctionColumns.has("endsAt") ? { endsAt } : {}),
      ...(auctionColumns.has("antiSnipeWindowSec")
        ? { antiSnipeWindowSec: antiSnipeWindowSec ?? 120 }
        : {}),
      ...(auctionColumns.has("currentPrice")
        ? { currentPrice: currentPrice ?? startingPrice }
        : {}),
    };

    const auction = await prisma.auction.create({
      data,
      select: await buildAuctionSelect({
        includeItem: true,
        includeShop: true,
      }),
    });

    return res.status(201).json(normalizeAuctionForResponse(auction, new Date()));
  } catch (err) {
    return handleControllerError(res, err, "Failed to create auction");
  }
}

export async function cancelAuction(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing auction id" });
    }

    const auction = await prisma.auction.findUnique({
      where: { id },
      select: await buildAuctionSelect({
        includeItem: true,
        includeShop: true,
      }),
    });

    if (!auction) {
      return res.status(404).json({ error: "Auction not found" });
    }

    if (!auction.item || !auction.item.shop) {
      return res.status(404).json({ error: "Auction ownership context missing" });
    }

    if (!req.user?.sub || !req.user?.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.role !== "ADMIN" && auction.item.shop.ownerId !== req.user.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { status: "CANCELED" },
      select: await buildAuctionSelect({
        includeItem: true,
        includeShop: true,
      }),
    });

    return res.json(normalizeAuctionForResponse(updated, new Date()));
  } catch (err) {
    return handleControllerError(res, err, "Failed to cancel auction");
  }
}

export async function endAuction(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing auction id" });
    }

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        item: {
          include: {
            shop: true,
          },
        },
        shop: true,
        bids: {
          orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
          take: 1,
          include: {
            user: true,
          },
        },
      },
    });

    if (!auction) {
      return res.status(404).json({ error: "Auction not found" });
    }

    if (!auction.item || !auction.item.shop) {
      return res.status(404).json({ error: "Auction ownership context missing" });
    }

    if (!req.user?.sub || !req.user?.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.role !== "ADMIN" && auction.item.shop.ownerId !== req.user.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const auctionColumns = await getTableColumns("Auction");
    const updated = await prisma.auction.update({
      where: { id },
      data: {
        ...(auctionColumns.has("status") ? { status: "ENDED" } : {}),
        ...(auctionColumns.has("endsAt") ? { endsAt: new Date() } : {}),
      },
      select: await buildAuctionSelect({
        includeItem: true,
        includeShop: true,
      }),
    });

    const settlementResult = await upsertSettlementForEndedAuction(id);

    return res.json({
      success: true,
      auction: normalizeAuctionForResponse(updated, new Date()),
      settlement:
        settlementResult.settlement
          ? {
              id: settlementResult.settlement.id,
              auctionId: settlementResult.settlement.auctionId,
              winnerUserId: settlementResult.settlement.winnerUserId,
              winnerName: settlementResult.settlement.winner?.name || null,
              winnerEmail: settlementResult.settlement.winner?.email || null,
              finalAmountCents: Math.round(
                Number(settlementResult.settlement.finalPrice || 0) * 100,
              ),
              currency: settlementResult.settlement.currency || "USD",
              status: settlementResult.settlement.status || "UNKNOWN",
              settledAt:
                settlementResult.settlement.updatedAt ||
                settlementResult.settlement.createdAt ||
                null,
            }
          : null,
      settlementReason: settlementResult.reason,
    });
  } catch (err) {
    return handleControllerError(res, err, "Failed to end auction");
  }
}
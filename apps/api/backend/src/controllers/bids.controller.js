// File: apps/api/backend/src/controllers/bids.controller.js

import { prisma } from "../lib/prisma.js";
import {
  getEffectiveAuctionEnd,
  getEffectiveAuctionStatus,
  normalizeAuctionForResponse,
  normalizeBidRowForResponse,
} from "../lib/auctionStatus.js";
import { getIo } from "../realtime/socket.js";

const BID_SAFE_FIELDS = ["id", "auctionId", "userId", "amount", "createdAt"];

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

const USER_SAFE_FIELDS = [
  "id",
  "name",
  "email",
  "role",
  "isActive",
  "createdAt",
  "updatedAt",
];

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
    Array.isArray(rows) ? rows.map((row) => row.column_name) : [],
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
  const select = await buildScalarSelect("Auction", [
    ...AUCTION_SAFE_FIELDS,
    ...extraFields,
  ]);

  if (includeItem) {
    select.item = { select: await buildItemSelect({ includeShop: true }) };
  }

  if (includeShop) {
    select.shop = { select: await buildPawnShopSelect() };
  }

  return select;
}

async function buildUserSelect(extraFields = []) {
  return buildScalarSelect("User", [...USER_SAFE_FIELDS, ...extraFields]);
}

async function buildBidSelect({
  includeAuction = false,
  includeUser = false,
  extraFields = [],
} = {}) {
  const select = await buildScalarSelect("Bid", [...BID_SAFE_FIELDS, ...extraFields]);

  if (includeAuction) {
    select.auction = {
      select: await buildAuctionSelect({ includeItem: true, includeShop: true }),
    };
  }

  if (includeUser) {
    select.user = { select: await buildUserSelect() };
  }

  return select;
}

function toBidAmount(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toSerializableDate(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function sendError(res, error, fallback = "Internal Server Error") {
  const statusCode =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  const payload = {
    success: false,
    error: error?.message || fallback,
  };

  if (Number.isFinite(error?.minRequired)) {
    payload.minRequired = error.minRequired;
  }

  return res.status(statusCode).json(payload);
}

function makeAuctionNotLiveError() {
  const err = new Error("Auction not live");
  err.statusCode = 400;
  return err;
}

function makeInsufficientBidError(minRequired) {
  const err = new Error(`Bid must be >= ${minRequired}`);
  err.statusCode = 400;
  err.minRequired = minRequired;
  return err;
}

async function reconcileExpiredAuctionStatus(
  db,
  auction,
  now = new Date(),
  auctionColumns = null,
) {
  if (!auction) return auction;

  const effectiveStatus = getEffectiveAuctionStatus(auction, now);
  if (effectiveStatus !== "ENDED" || auction.status === "ENDED") {
    return auction;
  }

  const columns = auctionColumns ?? (await getTableColumns("Auction"));

  if (!columns.has("status")) {
    return {
      ...auction,
      status: "ENDED",
    };
  }

  try {
    await db.auction.update({
      where: { id: auction.id },
      data: { status: "ENDED" },
    });
  } catch (_error) {
    // Non-fatal. API output still reflects effective status even if
    // persistence races with another request.
  }

  return {
    ...auction,
    status: "ENDED",
  };
}

async function runAutoBidEngine(tx, auctionId, options = {}) {
  const maxRounds = Number(options.maxRounds || 20);
  const now = options.now instanceof Date ? options.now : new Date();
  const generatedBids = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        currentPrice: true,
        minIncrement: true,
        status: true,
        startsAt: true,
        endsAt: true,
        extendedEndsAt: true,
        antiSnipeWindowSec: true,
      },
    });

    if (!auction) return generatedBids;

    const effectiveStatus = getEffectiveAuctionStatus(auction, now);
    if (effectiveStatus !== "LIVE") return generatedBids;

    const currentPrice = Number(auction.currentPrice ?? 0);
    const minIncrement = Number(auction.minIncrement ?? 0);
    const minRequired = currentPrice + minIncrement;

    if (
      !Number.isFinite(currentPrice) ||
      !Number.isFinite(minIncrement) ||
      !Number.isFinite(minRequired) ||
      minIncrement <= 0
    ) {
      return generatedBids;
    }

    const topBid = await tx.bid.findFirst({
      where: { auctionId },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        userId: true,
        amount: true,
        createdAt: true,
      },
    });

    const autoBids = await tx.autoBid.findMany({
      where: {
        auctionId,
        maxAmount: { gte: minRequired },
      },
      orderBy: [{ maxAmount: "desc" }, { updatedAt: "asc" }],
      take: 5,
    });

    const challenger = autoBids.find((row) => row.userId !== topBid?.userId);
    if (!challenger) return generatedBids;

    const challengerMax = Number(challenger.maxAmount);
    if (!Number.isFinite(challengerMax)) return generatedBids;

    const nextAmount = Math.min(challengerMax, minRequired);

    if (!Number.isFinite(nextAmount) || nextAmount <= currentPrice) {
      return generatedBids;
    }

    const autoBid = await tx.bid.create({
      data: {
        auctionId,
        userId: challenger.userId,
        amount: nextAmount,
      },
      select: await buildBidSelect({ includeUser: true }),
    });

    await tx.auction.update({
      where: { id: auctionId },
      data: {
        currentPrice: nextAmount,
        version: { increment: 1 },
      },
    });

    generatedBids.push(autoBid);
  }

  return generatedBids;
}

export async function placeBid(req, res) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const auctionId = String(req.params.id || "").trim();
    if (!auctionId) {
      return res.status(400).json({ success: false, error: "Missing auction id" });
    }

    const bidAmount = toBidAmount(req.body?.amount);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }

    const now = new Date();
    const auctionColumns = await getTableColumns("Auction");

    let auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: await buildAuctionSelect({ includeItem: true, includeShop: true }),
    });

    if (!auction) {
      return res.status(404).json({ success: false, error: "Auction not found" });
    }

    if (!auction.item || auction.item.isDeleted) {
      return res.status(404).json({ success: false, error: "Auction item not found" });
    }

    if (!auction.item.shop || auction.item.shop.isDeleted) {
      return res.status(404).json({ success: false, error: "Auction shop not found" });
    }

    if (auction.item.shop.ownerId === req.user.sub) {
      return res.status(403).json({ success: false, error: "Owner cannot bid" });
    }

    auction = await reconcileExpiredAuctionStatus(prisma, auction, now, auctionColumns);

    const effectiveStatus = getEffectiveAuctionStatus(auction, now);
    if (effectiveStatus !== "LIVE") {
      return res.status(400).json({ success: false, error: "Auction not live" });
    }

    const current = Number(auction.currentPrice ?? auction.startingPrice ?? 0);
    const minInc = Number(auction.minIncrement ?? 0);
    const minRequired = current + minInc;

    if (!Number.isFinite(minRequired)) {
      return res.status(500).json({ success: false, error: "Auction pricing invalid" });
    }

    if (bidAmount < minRequired) {
      return res.status(400).json({
        success: false,
        error: `Bid must be >= ${minRequired}`,
        minRequired,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      let freshAuction = await tx.auction.findUnique({
        where: { id: auctionId },
        select: await buildAuctionSelect({ includeItem: true, includeShop: true }),
      });

      if (!freshAuction) {
        const err = new Error("Auction not found");
        err.statusCode = 404;
        throw err;
      }

      if (!freshAuction.item || freshAuction.item.isDeleted) {
        const err = new Error("Auction item not found");
        err.statusCode = 404;
        throw err;
      }

      if (!freshAuction.item.shop || freshAuction.item.shop.isDeleted) {
        const err = new Error("Auction shop not found");
        err.statusCode = 404;
        throw err;
      }

      if (freshAuction.item.shop.ownerId === req.user.sub) {
        const err = new Error("Owner cannot bid");
        err.statusCode = 403;
        throw err;
      }

      freshAuction = await reconcileExpiredAuctionStatus(
        tx,
        freshAuction,
        now,
        auctionColumns,
      );

      const freshEffectiveStatus = getEffectiveAuctionStatus(freshAuction, now);
      if (freshEffectiveStatus !== "LIVE") {
        throw makeAuctionNotLiveError();
      }

      const liveCurrent = Number(
        freshAuction.currentPrice ?? freshAuction.startingPrice ?? 0,
      );
      const liveMinInc = Number(freshAuction.minIncrement ?? 0);
      const liveMinRequired = liveCurrent + liveMinInc;

      if (!Number.isFinite(liveMinRequired)) {
        const err = new Error("Auction pricing invalid");
        err.statusCode = 500;
        throw err;
      }

      if (bidAmount < liveMinRequired) {
        throw makeInsufficientBidError(liveMinRequired);
      }

      const updateManyResult = await tx.auction.updateMany({
        where: {
          id: freshAuction.id,
          ...(auctionColumns.has("version") ? { version: freshAuction.version } : {}),
        },
        data: {
          ...(auctionColumns.has("currentPrice") ? { currentPrice: bidAmount } : {}),
          ...(auctionColumns.has("version") ? { version: { increment: 1 } } : {}),
          ...(auctionColumns.has("status") && freshAuction.status === "SCHEDULED"
            ? { status: "LIVE" }
            : {}),
        },
      });

      if (updateManyResult.count !== 1) {
        const err = new Error("Race condition, retry");
        err.statusCode = 409;
        throw err;
      }

      const bid = await tx.bid.create({
        data: {
          auctionId: freshAuction.id,
          userId: req.user.sub,
          amount: bidAmount,
        },
        select: await buildBidSelect({ includeUser: true }),
      });

      const autoBids = await runAutoBidEngine(tx, freshAuction.id, { now });

      const currentEnd = getEffectiveAuctionEnd(freshAuction)
        ? new Date(getEffectiveAuctionEnd(freshAuction))
        : null;

      const antiSnipeWindowSec = Number(freshAuction.antiSnipeWindowSec ?? 0);
      const cutoff =
        currentEnd && antiSnipeWindowSec > 0
          ? new Date(currentEnd.getTime() - antiSnipeWindowSec * 1000)
          : null;

      let extendedEndsAt = null;

      if (
        currentEnd &&
        cutoff &&
        now >= cutoff &&
        auctionColumns.has("extendedEndsAt")
      ) {
        extendedEndsAt = new Date(currentEnd.getTime() + antiSnipeWindowSec * 1000);

        await tx.auction.update({
          where: { id: freshAuction.id },
          data: { extendedEndsAt },
        });
      }

      const latestAuction = await tx.auction.findUnique({
        where: { id: freshAuction.id },
        select: await buildAuctionSelect({ includeItem: true, includeShop: true }),
      });

      return {
        bid,
        autoBids,
        auction: normalizeAuctionForResponse(latestAuction, new Date()),
        extendedEndsAt:
          latestAuction?.extendedEndsAt ?? extendedEndsAt ?? freshAuction.extendedEndsAt ?? null,
      };
    });

    const responseAuction = normalizeAuctionForResponse(result.auction, new Date());
    const responseExtendedEndsAt =
      responseAuction?.extendedEndsAt ?? result.extendedEndsAt ?? null;

    const finalPrice =
      responseAuction?.currentPrice ??
      result.autoBids?.[result.autoBids.length - 1]?.amount ??
      result.bid.amount ??
      bidAmount;

    const io = getIo();
    if (io) {
      io.to(`auction:${auctionId}`).emit("auction:bid", {
        auctionId,
        amount: String(bidAmount),
        bidId: result.bid.id,
        userId: req.user.sub,
        createdAt: result.bid.createdAt,
        auto: false,
        extendedEndsAt: toSerializableDate(responseExtendedEndsAt),
      });

      for (const autoBid of result.autoBids || []) {
        io.to(`auction:${auctionId}`).emit("auction:bid", {
          auctionId,
          amount: String(autoBid.amount),
          bidId: autoBid.id,
          userId: autoBid.userId,
          createdAt: autoBid.createdAt,
          auto: true,
          extendedEndsAt: toSerializableDate(responseExtendedEndsAt),
        });
      }

      io.to(`auction:${auctionId}`).emit("auction:updated", {
        auctionId,
        currentPrice: String(finalPrice),
        status: responseAuction?.status ?? "LIVE",
        extendedEndsAt: toSerializableDate(responseExtendedEndsAt),
      });
    }

    return res.status(201).json({
      ok: true,
      success: true,
      bid: result.bid,
      autoBids: result.autoBids || [],
      extendedEndsAt: responseExtendedEndsAt,
      auction: responseAuction,
    });
  } catch (error) {
    return sendError(res, error, "Failed to place bid");
  }
}

export async function myBids(req, res) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const bids = await prisma.bid.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      select: await buildBidSelect({ includeAuction: true }),
    });

    const now = new Date();

    return res.json({
      success: true,
      rows: bids.map((row) => normalizeBidRowForResponse(row, now)),
    });
  } catch (error) {
    return sendError(res, error, "Failed to list bids");
  }
}

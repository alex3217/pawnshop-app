// File: apps/api/backend/src/controllers/settlements.controller.js

import { prisma } from "../lib/prisma.js";

function sendError(res, error, fallbackMessage = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallbackMessage,
  });
}

function badRequest(message, details = undefined) {
  const error = new Error(message);
  error.statusCode = 400;
  if (details) error.details = details;
  return error;
}

function forbidden(message = "Forbidden") {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function notFound(message = "Not found") {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

function normalizeCurrency(value, fallback = "USD") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeStatus(value, fallback = "UNKNOWN") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeSettlementStatus(value, fallback = "CHARGED") {
  const normalized = normalizeString(value, fallback).toUpperCase();

  const aliasMap = {
    COMPLETED: "CHARGED",
    COMPLETE: "CHARGED",
    PAID: "CHARGED",
    SUCCEEDED: "CHARGED",
    SUCCESS: "CHARGED",
    CHARGED: "CHARGED",
    FAILED: "FAILED",
    ERROR: "FAILED",
    PENDING: "PENDING",
  };

  return aliasMap[normalized] || normalized;
}

const FULFILLMENT_STATUSES = new Set([
  "PAYMENT_PENDING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "SHIPPED",
  "COMPLETED",
  "CANCELED",
]);

function normalizeFulfillmentStatus(value) {
  const normalized = normalizeString(value).toUpperCase();

  const aliasMap = {
    READY: "READY_FOR_PICKUP",
    READY_FOR_PICK_UP: "READY_FOR_PICKUP",
    PICKUP_READY: "READY_FOR_PICKUP",
    PICKED: "PICKED_UP",
    PICKEDUP: "PICKED_UP",
    COMPLETE: "COMPLETED",
    DONE: "COMPLETED",
    SHIP: "SHIPPED",
    CANCELLED: "CANCELED",
  };

  return aliasMap[normalized] || normalized;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toCents(value) {
  if (value === undefined || value === null || value === "") return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric);
}

function toDecimalPrice(cents) {
  const normalized = toCents(cents);
  return normalized / 100;
}

function mapSettlementRow(row) {
  return {
    id: normalizeString(row.id),
    auctionId: normalizeString(row.auctionId),
    offerId: normalizeString(row.offerId),
    auctionTitle: normalizeString(
      row.auctionTitle || row.itemTitle || row.title,
      "Won auction",
    ),
    shopName: normalizeString(row.shopName, "Unknown shop"),
    finalAmountCents: toCents(
      row.finalAmountCents ??
        row.amountCents ??
        row.highestBidAmountCents ??
        row.highestBidAmount,
    ),
    currency: normalizeCurrency(row.currency),
    status: normalizeStatus(row.status),
    endedAt: toIsoOrNull(row.endedAt),
    settledAt: toIsoOrNull(row.settledAt || row.updatedAt || row.createdAt),
    stripePaymentIntent: row.stripePaymentIntent || null,
    fulfillmentStatus: normalizeStatus(row.fulfillmentStatus || "PAYMENT_PENDING"),
    fulfillmentNote: row.fulfillmentNote || null,
    fulfilledAt: toIsoOrNull(row.fulfilledAt),
    winnerId: row.winnerUserId || null,
    winnerName: row.winnerName || null,
    winnerEmail: row.winnerEmail || null,
  };
}

async function getOwnedAuctionIdsForOwner(userId) {
  const auctions = await prisma.auction.findMany({
    where: {
      shop: {
        ownerId: userId,
        isDeleted: false,
      },
    },
    select: { id: true },
  });

  return auctions.map((item) => item.id);
}

function settlementInclude() {
  return {
    auction: {
      include: {
        item: true,
        shop: true,
      },
    },
    offer: {
      include: {
        item: {
          include: {
            shop: true,
          },
        },
        buyer: true,
        owner: true,
      },
    },
    winner: true,
  };
}

async function getSettlementWithRelations(where) {
  return prisma.settlement.findFirst({
    where,
    include: settlementInclude(),
  });
}

async function getAllSettlementsWithRelations(where = {}) {
  return prisma.settlement.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: settlementInclude(),
  });
}

function toResponseSettlement(settlement) {
  const auction = settlement.auction || {};
  const offer = settlement.offer || {};
  const item = auction.item || offer.item || {};
  const shop = auction.shop || offer.item?.shop || {};
  const winner = settlement.winner || offer.buyer || {};
  const sourceTitle = settlement.offerId ? "Accepted offer" : "Won auction";

  return mapSettlementRow({
    id: settlement.id,
    auctionId: settlement.auctionId || null,
    offerId: settlement.offerId || null,
    auctionTitle: item.title || auction.title || sourceTitle,
    itemId: item.id || offer.itemId || null,
    itemTitle: item.title || null,
    shopId: shop.id || item.pawnShopId || null,
    shopName: shop.name || null,
    finalAmountCents:
      settlement.finalPrice != null
        ? Math.round(Number(settlement.finalPrice) * 100)
        : 0,
    currency: settlement.currency || "USD",
    status: settlement.status || "UNKNOWN",
    endedAt: auction.endsAt || auction.endedAt || offer.respondedAt || null,
    settledAt: settlement.updatedAt || settlement.createdAt || null,
    stripePaymentIntent: settlement.stripePaymentIntent || null,
    fulfillmentStatus: settlement.fulfillmentStatus || "PAYMENT_PENDING",
    fulfillmentNote: settlement.fulfillmentNote || null,
    fulfilledAt: settlement.fulfilledAt || null,
    winnerUserId: settlement.winnerUserId || null,
    winnerName: winner.name || null,
    winnerEmail: winner.email || null,
    createdAt: settlement.createdAt || null,
    updatedAt: settlement.updatedAt || null,
  });
}

async function assertSettlementReadableByUser(settlement, req) {
  const role = req?.user?.role;
  const userId = req?.user?.sub;

  if (!settlement) {
    throw notFound("Settlement not found.");
  }

  if (role === "ADMIN") return;

  if (role === "CONSUMER") {
    if (settlement.winnerUserId !== userId) {
      throw forbidden("You do not have access to this settlement.");
    }
    return;
  }

  if (role === "OWNER") {
    const ownerId =
      settlement.auction?.shop?.ownerId ||
      settlement.offer?.ownerId ||
      settlement.offer?.item?.shop?.ownerId;

    if (ownerId !== userId) {
      throw forbidden("You do not have access to this settlement.");
    }
    return;
  }

  throw forbidden();
}

export async function listMySettlements(req, res) {
  try {
    const role = req?.user?.role;
    const userId = req?.user?.sub;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    let settlements = [];

    if (role === "ADMIN") {
      settlements = await getAllSettlementsWithRelations();
    } else if (role === "CONSUMER") {
      settlements = await getAllSettlementsWithRelations({
        winnerUserId: userId,
      });
    } else if (role === "OWNER") {
      const auctionIds = await getOwnedAuctionIdsForOwner(userId);
      const ownerSettlementWhere = {
        OR: [
          ...(auctionIds.length ? [{ auctionId: { in: auctionIds } }] : []),
          { offer: { ownerId: userId } },
        ],
      };

      settlements = await getAllSettlementsWithRelations(ownerSettlementWhere);
    } else {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    return res.json(settlements.map(toResponseSettlement));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getSettlementById(req, res) {
  try {
    const id = normalizeString(req.params.id);
    if (!id) {
      throw badRequest("Settlement id is required.");
    }

    const settlement = await getSettlementWithRelations({ id });
    await assertSettlementReadableByUser(settlement, req);

    return res.json(toResponseSettlement(settlement));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getSettlementByAuctionId(req, res) {
  try {
    const auctionId = normalizeString(req.params.auctionId);
    if (!auctionId) {
      throw badRequest("Auction id is required.");
    }

    const settlement = await getSettlementWithRelations({ auctionId });
    await assertSettlementReadableByUser(settlement, req);

    return res.json(toResponseSettlement(settlement));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listAllSettlementsForAdmin(req, res) {
  try {
    if (req?.user?.role !== "ADMIN") {
      throw forbidden();
    }

    const settlements = await getAllSettlementsWithRelations();
    return res.json(settlements.map(toResponseSettlement));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createOrFinalizeSettlement(req, res) {
  try {
    if (req?.user?.role !== "ADMIN") {
      throw forbidden();
    }

    const auctionId = normalizeString(req.body?.auctionId);
    if (!auctionId) {
      throw badRequest("auctionId is required.");
    }

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        item: true,
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
      throw notFound("Auction not found.");
    }

    const topBid = auction.bids?.[0] || null;
    const winnerId =
      normalizeString(req.body?.winnerId) || topBid?.userId || null;

    if (!winnerId) {
      throw badRequest(
        "winnerId is required when the auction has no bids to infer a winner.",
      );
    }

    const finalAmountCents =
      toCents(req.body?.finalAmountCents) || toCents(topBid?.amount) || 0;

    if (!finalAmountCents) {
      throw badRequest(
        "finalAmountCents is required when it cannot be inferred from the top bid.",
      );
    }

    const data = {
      winnerUserId: winnerId,
      finalPrice: toDecimalPrice(finalAmountCents),
      currency: normalizeCurrency(req.body?.currency || "USD"),
      status: normalizeSettlementStatus(req.body?.status || "CHARGED"),
      stripePaymentIntent:
        normalizeString(req.body?.stripePaymentIntent) || null,
    };

    const settlement = await prisma.settlement.upsert({
      where: { auctionId },
      update: data,
      create: {
        auctionId,
        ...data,
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

    return res.status(201).json({
      success: true,
      settlement: toResponseSettlement(settlement),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSettlementFulfillment(req, res) {
  try {
    const role = req?.user?.role;
    const userId = req?.user?.sub;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (role !== "OWNER" && role !== "ADMIN") {
      throw forbidden("Only owners or admins can update fulfillment.");
    }

    const id = normalizeString(req.params?.id);
    if (!id) {
      throw badRequest("Settlement id is required.");
    }

    const settlement = await getSettlementWithRelations({ id });
    await assertSettlementReadableByUser(settlement, req);

    if (normalizeStatus(settlement.status) !== "CHARGED") {
      throw badRequest("Only charged settlements can be fulfilled.");
    }

    const fulfillmentStatus = normalizeFulfillmentStatus(req.body?.fulfillmentStatus || req.body?.status);
    if (!FULFILLMENT_STATUSES.has(fulfillmentStatus)) {
      throw badRequest("Invalid fulfillment status.", {
        allowed: Array.from(FULFILLMENT_STATUSES),
      });
    }

    const fulfillmentNote =
      req.body?.fulfillmentNote !== undefined
        ? normalizeString(req.body.fulfillmentNote, null)
        : undefined;

    const shouldSetFulfilledAt = ["PICKED_UP", "SHIPPED", "COMPLETED"].includes(
      fulfillmentStatus,
    );

    const updated = await prisma.settlement.update({
      where: { id },
      data: {
        fulfillmentStatus,
        ...(fulfillmentNote !== undefined ? { fulfillmentNote } : {}),
        fulfilledAt: shouldSetFulfilledAt ? new Date() : null,
      },
      include: settlementInclude(),
    });

    return res.json({
      success: true,
      settlement: toResponseSettlement(updated),
    });
  } catch (error) {
    return sendError(res, error, "Failed to update settlement fulfillment.");
  }
}

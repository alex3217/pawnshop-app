import { getEffectiveAuctionStatus } from "../lib/auctionStatus.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getBidArchiveEligibility(bid, now = new Date()) {
  const auction = bid?.auction;
  if (!auction) {
    return { eligible: false, reason: "Auction details are unavailable." };
  }

  const status = getEffectiveAuctionStatus(auction, now);
  if (!["ENDED", "CANCELED"].includes(status)) {
    return { eligible: false, reason: "Only finished bids can be archived." };
  }

  const winnerUserId =
    auction.settlement?.winnerUserId || auction.bids?.[0]?.userId || null;

  if (winnerUserId === bid.userId) {
    return {
      eligible: false,
      reason: "Won bids must remain visible while payment or fulfillment may require action.",
    };
  }

  return { eligible: true, reason: null };
}

export function buildMyBidsWhere(userId, archivedBidIds, archived) {
  return {
    userId,
    ...(archived
      ? { id: { in: archivedBidIds } }
      : archivedBidIds.length > 0
        ? { id: { notIn: archivedBidIds } }
        : {}),
  };
}

export async function setBidArchived(db, { bidId, userId, archived, now = new Date() }) {
  const bid = await db.bid.findUnique({
    where: { id: bidId },
    select: {
      id: true,
      userId: true,
      auction: {
        select: {
          id: true,
          status: true,
          startsAt: true,
          endsAt: true,
          extendedEndsAt: true,
          settlement: {
            select: {
              winnerUserId: true,
              status: true,
              fulfillmentStatus: true,
            },
          },
          bids: {
            orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { userId: true },
          },
        },
      },
    },
  });

  if (!bid) throw httpError(404, "Bid not found.");
  if (bid.userId !== userId) {
    throw httpError(403, "You cannot change another buyer's bid.");
  }

  if (archived) {
    const eligibility = getBidArchiveEligibility(bid, now);
    if (!eligibility.eligible) throw httpError(400, eligibility.reason);

    await db.bidArchive.upsert({
      where: { userId_bidId: { userId, bidId } },
      create: { userId, bidId, archivedAt: now },
      update: { archivedAt: now },
    });
  } else {
    await db.bidArchive.updateMany({
      where: { userId, bidId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
  }

  return { bidId, archived };
}

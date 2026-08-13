// File: apps/api/backend/src/lib/auctionStatus.js

export {
  getEffectiveAuctionEnd,
  getEffectiveAuctionStatus,
  hasEnded,
  hasStarted,
  normalizeAuctionStatusInput,
} from "../../../../../shared/auctionStatus.mjs";

import {
  getEffectiveAuctionStatus,
  normalizeAuctionStatusInput,
} from "../../../../../shared/auctionStatus.mjs";

export function normalizeAuctionForResponse(auction, now = new Date()) {
  if (!auction) return auction;

  return {
    ...auction,
    status: getEffectiveAuctionStatus(auction, now),
  };
}

export function normalizeBidRowForResponse(row, now = new Date()) {
  if (!row) return row;

  return {
    ...row,
    auction: row.auction ? normalizeAuctionForResponse(row.auction, now) : row.auction,
  };
}

export function resolveCreateStatus({
  requestedStatus,
  startsAt,
  endsAt,
  now = new Date(),
}) {
  if (requestedStatus) {
    return requestedStatus;
  }

  return getEffectiveAuctionStatus(
    {
      status: "LIVE",
      startsAt,
      endsAt,
      extendedEndsAt: null,
    },
    now
  );
}

export function getStaleExpiredAuctionIds(rows, now = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows
    .filter((row) => row && row.id)
    .filter((row) => row.status !== "CANCELED" && row.status !== "ENDED")
    .filter((row) => getEffectiveAuctionStatus(row, now) === "ENDED")
    .map((row) => row.id);
}

export function buildEffectiveStatusWhere(status, now, auctionColumns) {
  if (!status || !auctionColumns?.has?.("status")) {
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

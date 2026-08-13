export const EFFECTIVE_AUCTION_STATUSES = Object.freeze({
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  ENDED: "ENDED",
  CANCELED: "CANCELED",
});

const VALID_AUCTION_STATUSES = new Set(Object.values(EFFECTIVE_AUCTION_STATUSES));

function instant(value) {
  if (value instanceof Date) return value.getTime();
  if (value === undefined || value === null || value === "") return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function normalizeAuctionStatusInput(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const upper = String(value).trim().toUpperCase();
  if (!upper) return null;

  const canonical = upper === "CANCELLED" ? "CANCELED" : upper;
  return VALID_AUCTION_STATUSES.has(canonical) ? canonical : null;
}

export function getEffectiveAuctionEnd(auction) {
  return auction?.extendedEndsAt || auction?.endsAt || null;
}

export function hasStarted(auction, now = new Date()) {
  const start = instant(auction?.startsAt);
  return start === null || instant(now) >= start;
}

export function hasEnded(auction, now = new Date()) {
  const end = instant(getEffectiveAuctionEnd(auction));
  return end !== null && instant(now) >= end;
}

export function getEffectiveAuctionStatus(auction, now = new Date()) {
  if (!auction) return EFFECTIVE_AUCTION_STATUSES.ENDED;

  const storedStatus = normalizeAuctionStatusInput(auction.status);
  if (storedStatus === EFFECTIVE_AUCTION_STATUSES.CANCELED) {
    return EFFECTIVE_AUCTION_STATUSES.CANCELED;
  }
  if (storedStatus === EFFECTIVE_AUCTION_STATUSES.ENDED) {
    return EFFECTIVE_AUCTION_STATUSES.ENDED;
  }
  if (!hasStarted(auction, now)) return EFFECTIVE_AUCTION_STATUSES.SCHEDULED;
  if (hasEnded(auction, now)) return EFFECTIVE_AUCTION_STATUSES.ENDED;
  return EFFECTIVE_AUCTION_STATUSES.LIVE;
}

export function isAwaitingPostAuctionReview(auction, now = new Date()) {
  const status = getEffectiveAuctionStatus(auction, now);
  return (
    (status === EFFECTIVE_AUCTION_STATUSES.ENDED ||
      status === EFFECTIVE_AUCTION_STATUSES.CANCELED) &&
    !auction?.ownerReviewedAt
  );
}

export function getAuctionStatusSummary(auctions, now = new Date()) {
  return (Array.isArray(auctions) ? auctions : []).reduce(
    (summary, auction) => {
      const status = getEffectiveAuctionStatus(auction, now);
      if (status === EFFECTIVE_AUCTION_STATUSES.LIVE) summary.live += 1;
      if (status === EFFECTIVE_AUCTION_STATUSES.SCHEDULED) summary.scheduled += 1;
      if (isAwaitingPostAuctionReview(auction, now)) summary.awaitingReview += 1;
      return summary;
    },
    { live: 0, scheduled: 0, awaitingReview: 0 },
  );
}

export function formatAuctionDateTime(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return new Intl.DateTimeFormat(options.locale || "en-US", {
    dateStyle: "medium",
    timeStyle: "long",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
}

export function getAuctionCountdown(auction, now = new Date()) {
  const status = getEffectiveAuctionStatus(auction, now);
  if (status === EFFECTIVE_AUCTION_STATUSES.ENDED) return "Ended";
  if (status === EFFECTIVE_AUCTION_STATUSES.CANCELED) return "Canceled";

  const target = instant(
    status === EFFECTIVE_AUCTION_STATUSES.SCHEDULED
      ? auction?.startsAt
      : getEffectiveAuctionEnd(auction),
  );
  const current = instant(now);
  if (target === null || current === null) return "Unavailable";

  const totalSeconds = Math.max(0, Math.ceil((target - current) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const duration = days > 0
    ? `${days}d ${hours}h ${minutes}m`
    : hours > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : `${minutes}m ${seconds}s`;

  return status === EFFECTIVE_AUCTION_STATUSES.SCHEDULED
    ? `Starts in ${duration}`
    : `${duration} remaining`;
}

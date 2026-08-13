export type EffectiveAuctionStatus = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELED";
export type AuctionStatusInput = {
  status?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  extendedEndsAt?: unknown;
  ownerReviewedAt?: unknown;
};
export const EFFECTIVE_AUCTION_STATUSES: Readonly<Record<EffectiveAuctionStatus, EffectiveAuctionStatus>>;
export function normalizeAuctionStatusInput(value: unknown): EffectiveAuctionStatus | null | undefined;
export function getEffectiveAuctionEnd(auction: AuctionStatusInput): unknown;
export function hasStarted(auction: AuctionStatusInput, now?: Date): boolean;
export function hasEnded(auction: AuctionStatusInput, now?: Date): boolean;
export function getEffectiveAuctionStatus(auction: AuctionStatusInput | null, now?: Date): EffectiveAuctionStatus;
export function isAwaitingPostAuctionReview(auction: AuctionStatusInput, now?: Date): boolean;
export function getAuctionStatusSummary(auctions: AuctionStatusInput[], now?: Date): { live: number; scheduled: number; awaitingReview: number };
export function formatAuctionDateTime(value: unknown, options?: { locale?: string; timeZone?: string }): string;
export function getAuctionCountdown(auction: AuctionStatusInput, now?: Date): string;

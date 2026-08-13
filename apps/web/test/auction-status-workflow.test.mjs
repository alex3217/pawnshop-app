import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatAuctionDateTime,
  getAuctionCountdown,
  getAuctionStatusSummary,
  getEffectiveAuctionEnd,
  getEffectiveAuctionStatus,
  isAwaitingPostAuctionReview,
} from "../../../shared/auctionStatus.mjs";

const now = new Date("2026-08-13T12:00:00.000Z");
const live = { id: "live", status: "LIVE", startsAt: "2026-08-13T11:00:00.000Z", endsAt: "2026-08-13T13:00:00.000Z" };
const scheduled = { id: "scheduled", status: "SCHEDULED", startsAt: "2026-08-13T12:00:01.000Z", endsAt: "2026-08-13T14:00:00.000Z" };
const ended = { id: "ended", status: "LIVE", startsAt: "2026-08-13T10:00:00.000Z", endsAt: now.toISOString() };

test("shared effective status is instant-based at exact start and end boundaries", () => {
  assert.equal(getEffectiveAuctionStatus(scheduled, now), "SCHEDULED");
  assert.equal(getEffectiveAuctionStatus({ ...scheduled, startsAt: now.toISOString() }, now), "LIVE");
  assert.equal(getEffectiveAuctionStatus(live, now), "LIVE");
  assert.equal(getEffectiveAuctionStatus(ended, now), "ENDED");
  assert.equal(getEffectiveAuctionStatus({ ...live, status: "ENDED" }, now), "ENDED");
  assert.equal(getEffectiveAuctionStatus({ ...live, status: "CANCELED" }, now), "CANCELED");
  assert.equal(
    getEffectiveAuctionStatus({ ...live, extendedEndsAt: now.toISOString() }, now),
    "ENDED",
  );
});

test("settled ended auctions remain ended and review state controls the post-auction queue", () => {
  const settled = { ...ended, settlement: { status: "CHARGED" } };
  assert.equal(getEffectiveAuctionStatus(settled, now), "ENDED");
  assert.equal(isAwaitingPostAuctionReview(live, now), false);
  assert.equal(isAwaitingPostAuctionReview(settled, now), true);
  assert.equal(isAwaitingPostAuctionReview({ ...settled, ownerReviewedAt: now.toISOString() }, now), false);
});

test("owner summary uses the same effective status and excludes live auctions from review", () => {
  assert.deepEqual(getAuctionStatusSummary([live, scheduled, ended], now), {
    live: 1,
    scheduled: 1,
    awaitingReview: 1,
  });
});

test("timezone rendering is explicit and countdown transitions to ended", () => {
  const chicago = formatAuctionDateTime("2026-08-13T18:00:00.000Z", { timeZone: "America/Chicago" });
  assert.match(chicago, /CDT/);
  assert.equal(
    getEffectiveAuctionStatus(
      { ...live, startsAt: "2026-08-13T07:00:00-05:00" },
      new Date("2026-08-13T12:00:00Z"),
    ),
    "LIVE",
  );
  assert.match(getAuctionCountdown(live, now), /remaining$/);
  assert.equal(getAuctionCountdown(live, new Date(live.endsAt)), "Ended");
});

test("extended auctions use their active closing time for owner sorting and display", async () => {
  const extended = {
    ...live,
    endsAt: "2026-08-13T12:30:00.000Z",
    extendedEndsAt: "2026-08-13T14:00:00.000Z",
  };
  const unextended = { ...live, id: "unextended", endsAt: "2026-08-13T13:00:00.000Z" };
  const sorted = [extended, unextended].sort(
    (left, right) =>
      new Date(getEffectiveAuctionEnd(left)).getTime() -
      new Date(getEffectiveAuctionEnd(right)).getTime(),
  );

  assert.deepEqual(sorted.map((auction) => auction.id), ["unextended", "live"]);
  assert.equal(getEffectiveAuctionEnd(extended), extended.extendedEndsAt);
  assert.equal(getEffectiveAuctionEnd(unextended), unextended.endsAt);

  const source = await readFile(new URL("../src/pages/OwnerAuctionsPage.tsx", import.meta.url), "utf8");
  assert.match(source, /getAuctionTimestamp\(getEffectiveAuctionEnd\(left\)\)/);
  assert.match(source, /getAuctionTimestamp\(getEffectiveAuctionEnd\(right\)\)/);
  assert.match(source, /label=\{auction\.extendedEndsAt \? "Extended end" : "Ends"\}/);
  assert.match(source, /value=\{formatOwnerAuctionDateTime\(effectiveEnd\)\}/);
  assert.match(source, /label="Original scheduled end"/);
});

test("owner workflow copy, collapsed empty state, status labels, and confirmations remain accessible", async () => {
  const source = await readFile(new URL("../src/pages/OwnerAuctionsPage.tsx", import.meta.url), "utf8");
  assert.match(source, /Post-Auction Workflow/);
  assert.doesNotMatch(source, /Closed Auction Workflow/);
  assert.match(source, /No auctions are awaiting post-auction review\./);
  assert.match(source, /awaitingReviewAuctions\.length > 0/);
  assert.match(source, /aria-label={`Auction status:/);
  assert.match(source, /window\.confirm\([\s\S]*End this auction now\?/);
  assert.match(source, /window\.confirm\([\s\S]*Cancel this auction\?/);
});

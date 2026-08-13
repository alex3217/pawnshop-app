import test from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveAuctionStatus,
  getStaleExpiredAuctionIds,
} from "../src/lib/auctionStatus.js";

const now = new Date("2026-08-13T12:00:00.000Z");
const base = {
  id: "auction-1",
  status: "SCHEDULED",
  startsAt: "2026-08-13T11:00:00.000Z",
  endsAt: "2026-08-13T13:00:00.000Z",
};

test("effective auction status observes lifecycle boundaries and terminal states", () => {
  assert.equal(getEffectiveAuctionStatus({ ...base, startsAt: "2026-08-13T12:00:01.000Z" }, now), "SCHEDULED");
  assert.equal(getEffectiveAuctionStatus(base, now), "LIVE");
  assert.equal(getEffectiveAuctionStatus({ ...base, startsAt: now.toISOString() }, now), "LIVE");
  assert.equal(getEffectiveAuctionStatus({ ...base, endsAt: now.toISOString() }, now), "ENDED");
  assert.equal(getEffectiveAuctionStatus({ ...base, extendedEndsAt: now.toISOString() }, now), "ENDED");
  assert.equal(getEffectiveAuctionStatus({ ...base, endsAt: "2026-08-13T11:59:59.999Z" }, now), "ENDED");
  assert.equal(getEffectiveAuctionStatus({ ...base, status: "ENDED", endsAt: "2026-08-14T12:00:00.000Z" }, now), "ENDED");
  assert.equal(getEffectiveAuctionStatus({ ...base, status: "CANCELED" }, now), "CANCELED");
});

test("stale expiration reconciliation excludes canceled and manually ended auctions", () => {
  const expired = { ...base, endsAt: "2026-08-13T11:59:59.999Z" };
  assert.deepEqual(getStaleExpiredAuctionIds([
    expired,
    { ...expired, id: "auction-2", status: "CANCELED" },
    { ...expired, id: "auction-3", status: "ENDED" },
  ], now), ["auction-1"]);
});

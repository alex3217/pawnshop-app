import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMyBidsWhere,
  getBidArchiveEligibility,
  setBidArchived,
} from "../src/services/bidArchive.service.js";

const NOW = new Date("2026-07-26T18:00:00.000Z");

function bidFixture(overrides = {}) {
  return {
    id: "bid-1",
    userId: "buyer-1",
    auction: {
      status: "ENDED",
      startsAt: new Date("2026-07-26T15:00:00.000Z"),
      endsAt: new Date("2026-07-26T16:00:00.000Z"),
      extendedEndsAt: null,
      settlement: { winnerUserId: "buyer-2" },
      bids: [{ userId: "buyer-2" }],
      ...overrides.auction,
    },
    ...overrides,
  };
}

function dbFor(bid) {
  const calls = { upsert: 0, deleteMany: 0 };
  return {
    calls,
    bid: { findUnique: async () => bid },
    bidArchive: {
      upsert: async () => { calls.upsert += 1; },
      deleteMany: async () => { calls.deleteMany += 1; },
    },
  };
}

test("eligible buyer can archive and repeated archive requests are idempotent", async () => {
  const db = dbFor(bidFixture());
  await setBidArchived(db, { bidId: "bid-1", userId: "buyer-1", archived: true, now: NOW });
  await setBidArchived(db, { bidId: "bid-1", userId: "buyer-1", archived: true, now: NOW });
  assert.equal(db.calls.upsert, 2);
});

test("eligible buyer can restore and repeated restore requests are idempotent", async () => {
  const db = dbFor(bidFixture());
  await setBidArchived(db, { bidId: "bid-1", userId: "buyer-1", archived: false, now: NOW });
  await setBidArchived(db, { bidId: "bid-1", userId: "buyer-1", archived: false, now: NOW });
  assert.equal(db.calls.deleteMany, 2);
});

test("another buyer cannot change the record", async () => {
  const db = dbFor(bidFixture());
  await assert.rejects(
    setBidArchived(db, { bidId: "bid-1", userId: "buyer-2", archived: true, now: NOW }),
    (error) => error.statusCode === 403,
  );
  assert.equal(db.calls.upsert, 0);
});

test("missing bids return 404", async () => {
  const db = dbFor(null);
  await assert.rejects(
    setBidArchived(db, { bidId: "missing", userId: "buyer-1", archived: true, now: NOW }),
    (error) => error.statusCode === 404,
  );
});

test("active bids cannot be archived", () => {
  const result = getBidArchiveEligibility(
    bidFixture({ auction: { status: "LIVE", endsAt: new Date("2026-07-26T19:00:00.000Z") } }),
    NOW,
  );
  assert.equal(result.eligible, false);
});

test("unpaid wins and other winning records cannot be archived", () => {
  const result = getBidArchiveEligibility(
    bidFixture({
      auction: {
        settlement: {
          winnerUserId: "buyer-1",
          status: "PENDING",
          fulfillmentStatus: "PAYMENT_PENDING",
        },
        bids: [{ userId: "buyer-1" }],
      },
    }),
    NOW,
  );
  assert.equal(result.eligible, false);
});

test("canceled auctions with no winning buyer action are eligible", () => {
  const result = getBidArchiveEligibility(
    bidFixture({ auction: { status: "CANCELED", settlement: null } }),
    NOW,
  );
  assert.equal(result.eligible, true);
});

test("archive filters are buyer-specific and default results exclude archived bids", () => {
  assert.deepEqual(buildMyBidsWhere("buyer-1", ["bid-1"], true), {
    userId: "buyer-1",
    id: { in: ["bid-1"] },
  });
  assert.deepEqual(buildMyBidsWhere("buyer-2", [], false), { userId: "buyer-2" });
  assert.deepEqual(buildMyBidsWhere("buyer-1", ["bid-1"], false), {
    userId: "buyer-1",
    id: { notIn: ["bid-1"] },
  });
});

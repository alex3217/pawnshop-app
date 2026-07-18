import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSellerLedgerHistoryQuery,
  getSellerLedgerHistory,
} from "../src/services/payouts/sellerLedgerHistory.service.js";

test("builds default seller ledger query", () => {
  const query = buildSellerLedgerHistoryQuery({
    sellerUserId: "seller_1",
    shopId: "shop_1",
  });

  assert.equal(query.page, 1);
  assert.equal(query.limit, 25);
  assert.equal(query.skip, 0);

  assert.deepEqual(query.where, {
    sellerUserId: "seller_1",
    shopId: "shop_1",
  });
});

test("normalizes pagination and enum filters", () => {
  const query = buildSellerLedgerHistoryQuery({
    sellerUserId: "seller_1",
    shopId: "shop_1",
    page: "3",
    limit: "500",
    type: "settlement_credit",
    status: "available",
  });

  assert.equal(query.page, 3);
  assert.equal(query.limit, 100);
  assert.equal(query.skip, 200);
  assert.equal(query.where.type, "SETTLEMENT_CREDIT");
  assert.equal(query.where.status, "AVAILABLE");
});

test("rejects unsupported ledger filters", () => {
  assert.throws(
    () =>
      buildSellerLedgerHistoryQuery({
        sellerUserId: "seller_1",
        shopId: "shop_1",
        type: "UNKNOWN",
      }),
    /Unsupported ledger type/,
  );
});

test("rejects an invalid date range", () => {
  assert.throws(
    () =>
      buildSellerLedgerHistoryQuery({
        sellerUserId: "seller_1",
        shopId: "shop_1",
        from: "2026-08-01",
        to: "2026-07-01",
      }),
    /from must be before or equal to to/,
  );
});

test("returns paginated seller ledger entries", async () => {
  const calls = [];

  const prismaClient = {
    sellerBalanceLedger: {
      async findMany(args) {
        calls.push({
          method: "findMany",
          args,
        });

        return [
          {
            id: "ledger_1",
            type: "SETTLEMENT_CREDIT",
            status: "AVAILABLE",
            amountCents: 2500,
          },
        ];
      },

      async count(args) {
        calls.push({
          method: "count",
          args,
        });

        return 3;
      },
    },
  };

  const result = await getSellerLedgerHistory({
    sellerUserId: "seller_1",
    shopId: "shop_1",
    page: 2,
    limit: 1,
    prismaClient,
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.limit, 1);
  assert.equal(result.pagination.total, 3);
  assert.equal(result.pagination.totalPages, 3);

  assert.equal(calls[0].args.skip, 1);
  assert.equal(calls[0].args.take, 1);
});

test("requires seller and shop IDs", () => {
  assert.throws(
    () =>
      buildSellerLedgerHistoryQuery({
        shopId: "shop_1",
      }),
    /sellerUserId is required/,
  );

  assert.throws(
    () =>
      buildSellerLedgerHistoryQuery({
        sellerUserId: "seller_1",
      }),
    /shopId is required/,
  );
});

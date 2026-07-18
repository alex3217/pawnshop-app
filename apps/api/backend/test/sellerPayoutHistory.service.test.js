import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSellerPayoutHistoryQuery,
  getSellerPayoutHistory,
} from "../src/services/payouts/sellerPayoutHistory.service.js";

test("builds default payout history query", () => {
  const query = buildSellerPayoutHistoryQuery({
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

test("normalizes pagination and payout status", () => {
  const query = buildSellerPayoutHistoryQuery({
    sellerUserId: "seller_1",
    shopId: "shop_1",
    page: "2",
    limit: "500",
    status: "paid",
  });

  assert.equal(query.page, 2);
  assert.equal(query.limit, 100);
  assert.equal(query.skip, 100);
  assert.equal(query.where.status, "PAID");
});

test("rejects unsupported payout status", () => {
  assert.throws(
    () =>
      buildSellerPayoutHistoryQuery({
        sellerUserId: "seller_1",
        shopId: "shop_1",
        status: "UNKNOWN",
      }),
    /Unsupported payout status/,
  );
});

test("rejects invalid payout date range", () => {
  assert.throws(
    () =>
      buildSellerPayoutHistoryQuery({
        sellerUserId: "seller_1",
        shopId: "shop_1",
        from: "2026-08-01",
        to: "2026-07-01",
      }),
    /from must be before or equal to to/,
  );
});

test("returns paginated payout history", async () => {
  const calls = [];

  const prismaClient = {
    sellerPayout: {
      async findMany(args) {
        calls.push({
          method: "findMany",
          args,
        });

        return [
          {
            id: "payout_1",
            status: "PAID",
            amountCents: 5000,
          },
        ];
      },

      async count(args) {
        calls.push({
          method: "count",
          args,
        });

        return 4;
      },
    },
  };

  const result = await getSellerPayoutHistory({
    sellerUserId: "seller_1",
    shopId: "shop_1",
    page: 2,
    limit: 2,
    prismaClient,
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.limit, 2);
  assert.equal(result.pagination.total, 4);
  assert.equal(result.pagination.totalPages, 2);

  assert.equal(calls[0].args.skip, 2);
  assert.equal(calls[0].args.take, 2);
});

test("requires payout seller and shop IDs", () => {
  assert.throws(
    () =>
      buildSellerPayoutHistoryQuery({
        shopId: "shop_1",
      }),
    /sellerUserId is required/,
  );

  assert.throws(
    () =>
      buildSellerPayoutHistoryQuery({
        sellerUserId: "seller_1",
      }),
    /shopId is required/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSellerBalanceFromEntries,
  getSellerBalance,
} from "../src/services/payouts/sellerBalance.service.js";

test("calculates available seller credits", () => {
  const result = calculateSellerBalanceFromEntries([
    {
      type: "SETTLEMENT_CREDIT",
      status: "AVAILABLE",
      amountCents: 24_200,
    },
  ]);

  assert.equal(result.availableCents, 24_200);
  assert.equal(result.totalCents, 24_200);
  assert.equal(result.entryCount, 1);
});

test("subtracts payout and refund debits", () => {
  const result = calculateSellerBalanceFromEntries([
    {
      type: "SETTLEMENT_CREDIT",
      status: "AVAILABLE",
      amountCents: 24_200,
    },
    {
      type: "PAYOUT_DEBIT",
      status: "PAID",
      amountCents: 10_000,
    },
    {
      type: "REFUND_DEBIT",
      status: "AVAILABLE",
      amountCents: 2_000,
    },
  ]);

  assert.equal(result.availableCents, 22_200);
  assert.equal(result.paidCents, -10_000);
  assert.equal(result.totalCents, 12_200);
});

test("separates pending, held, and available balances", () => {
  const result = calculateSellerBalanceFromEntries([
    {
      type: "SETTLEMENT_CREDIT",
      status: "PENDING",
      amountCents: 5_000,
    },
    {
      type: "SETTLEMENT_CREDIT",
      status: "HELD",
      amountCents: 3_000,
    },
    {
      type: "SETTLEMENT_CREDIT",
      status: "AVAILABLE",
      amountCents: 2_000,
    },
  ]);

  assert.equal(result.pendingCents, 5_000);
  assert.equal(result.heldCents, 3_000);
  assert.equal(result.availableCents, 2_000);
  assert.equal(result.totalCents, 10_000);
});

test("rejects an unsupported ledger type", () => {
  assert.throws(
    () =>
      calculateSellerBalanceFromEntries([
        {
          type: "UNKNOWN",
          status: "AVAILABLE",
          amountCents: 100,
        },
      ]),
    /Unsupported ledger entry type/,
  );
});

test("loads and calculates a seller shop balance", async () => {
  const calls = [];

  const prismaClient = {
    sellerBalanceLedger: {
      async findMany(args) {
        calls.push(args);

        return [
          {
            id: "ledger_1",
            type: "SETTLEMENT_CREDIT",
            status: "AVAILABLE",
            amountCents: 24_200,
            currency: "USD",
            availableAt: new Date(),
            createdAt: new Date(),
          },
        ];
      },
    },
  };

  const result = await getSellerBalance({
    sellerUserId: "seller_1",
    shopId: "shop_1",
    currency: "usd",
    prismaClient,
  });

  assert.equal(result.availableCents, 24_200);
  assert.equal(result.currency, "USD");

  assert.deepEqual(calls[0].where, {
    sellerUserId: "seller_1",
    shopId: "shop_1",
    currency: "USD",
  });
});

test("rejects missing seller or shop IDs", async () => {
  await assert.rejects(
    getSellerBalance({
      sellerUserId: "",
      shopId: "shop_1",
    }),
    /sellerUserId is required/,
  );

  await assert.rejects(
    getSellerBalance({
      sellerUserId: "seller_1",
      shopId: "",
    }),
    /shopId is required/,
  );
});

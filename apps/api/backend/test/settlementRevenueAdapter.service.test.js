import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateSettlementRevenueContext,
  settlementAmountToCents,
} from "../src/services/revenue/settlementRevenueAdapter.service.js";

const catalog = [
  {
    code: "FREE",
    label: "Free",
    commissionBps: 1200,
    currency: "USD",
  },
  {
    code: "PRO",
    label: "Professional",
    commissionBps: 600,
    currency: "USD",
  },
];

test("converts a whole-dollar settlement amount to cents", () => {
  assert.equal(
    settlementAmountToCents(500),
    50_000,
  );
});

test("converts a decimal settlement amount to cents", () => {
  assert.equal(
    settlementAmountToCents("149.99"),
    14_999,
  );
});

test("rounds fractional cents safely", () => {
  assert.equal(
    settlementAmountToCents(10.005),
    1_001,
  );
});

test("rejects zero settlement amounts", () => {
  assert.throws(
    () => settlementAmountToCents(0),
    /Settlement amount must be a positive number/,
  );
});

test("rejects negative settlement amounts", () => {
  assert.throws(
    () => settlementAmountToCents(-10),
    /Settlement amount must be a positive number/,
  );
});

test("rejects invalid settlement amounts", () => {
  assert.throws(
    () => settlementAmountToCents("invalid"),
    /Settlement amount must be a positive number/,
  );
});

test("calculates auction revenue from a Prisma-compatible amount", async () => {
  const result =
    await calculateSettlementRevenueContext({
      amount: "500.00",
      sellerPlanCode: "FREE",
      transactionType: "AUCTION",
      catalog,
      calculatedAt:
        new Date("2026-07-18T12:00:00.000Z"),
    });

  assert.equal(result.amount, 500);
  assert.equal(result.grossAmountCents, 50_000);
  assert.equal(result.sellerPlanCode, "FREE");
  assert.equal(result.transactionType, "AUCTION");
  assert.equal(
    result.revenue.platformFeeCents,
    6_000,
  );
  assert.equal(
    result.revenue.sellerNetCents,
    44_000,
  );
});

test("calculates offer revenue using the professional plan", async () => {
  const result =
    await calculateSettlementRevenueContext({
      amount: 149.99,
      sellerPlanCode: "PRO",
      transactionType: "OFFER",
      catalog,
    });

  assert.equal(result.grossAmountCents, 14_999);
  assert.equal(
    result.revenue.platformFeeCents,
    900,
  );
  assert.equal(
    result.revenue.sellerNetCents,
    14_099,
  );
});

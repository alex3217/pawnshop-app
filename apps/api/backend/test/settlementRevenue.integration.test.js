import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateSellerSettlementRevenue,
  resolveSellerCommissionRule,
} from "../src/services/revenue/settlementRevenue.service.js";

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
  {
    code: "ENTERPRISE",
    label: "Enterprise",
    commissionBps: 400,
    currency: "USD",
  },
];

test("resolves the commission rule for a seller plan", async () => {
  const rule = await resolveSellerCommissionRule({
    sellerPlanCode: "PRO",
    transactionType: "AUCTION",
    catalog,
  });

  assert.equal(
    rule.key,
    "seller_plan_pro_commission_bps",
  );

  assert.equal(rule.percentBps, 600);
  assert.equal(rule.feeType, "PERCENT_BPS");
  assert.equal(
    rule.metadata.transactionType,
    "AUCTION",
  );
});

test("normalizes seller plan and transaction type", async () => {
  const rule = await resolveSellerCommissionRule({
    sellerPlanCode: " enterprise ",
    transactionType: " offer ",
    catalog,
  });

  assert.equal(rule.percentBps, 400);
  assert.equal(
    rule.metadata.transactionType,
    "OFFER",
  );
});

test("calculates an auction settlement for a free seller", async () => {
  const result =
    await calculateSellerSettlementRevenue({
      grossAmountCents: 50_000,
      sellerPlanCode: "FREE",
      transactionType: "AUCTION",
      processorFeeCents: 1_480,
      processorFeePaidBy: "PLATFORM",
      catalog,
      calculatedAt:
        new Date("2026-07-18T12:00:00.000Z"),
    });

  assert.equal(result.grossAmountCents, 50_000);
  assert.equal(result.platformFeeCents, 6_000);
  assert.equal(result.sellerNetCents, 44_000);
  assert.equal(result.platformNetCents, 4_520);
  assert.equal(
    result.pricingRuleSnapshot.percentBps,
    1200,
  );
});

test("calculates a lower commission for a professional seller", async () => {
  const result =
    await calculateSellerSettlementRevenue({
      grossAmountCents: 50_000,
      sellerPlanCode: "PRO",
      transactionType: "OFFER",
      catalog,
    });

  assert.equal(result.platformFeeCents, 3_000);
  assert.equal(result.sellerNetCents, 47_000);
});

test("calculates an enterprise dealer transaction", async () => {
  const result =
    await calculateSellerSettlementRevenue({
      grossAmountCents: 100_000,
      sellerPlanCode: "ENTERPRISE",
      transactionType: "DEALER",
      catalog,
    });

  assert.equal(result.platformFeeCents, 4_000);
  assert.equal(result.sellerNetCents, 96_000);
});

test("rejects an unknown seller plan", async () => {
  await assert.rejects(
    () =>
      resolveSellerCommissionRule({
        sellerPlanCode: "UNKNOWN",
        transactionType: "AUCTION",
        catalog,
      }),
    /Seller plan not found/,
  );
});

test("rejects an unsupported transaction type", async () => {
  await assert.rejects(
    () =>
      resolveSellerCommissionRule({
        sellerPlanCode: "FREE",
        transactionType: "INVALID",
        catalog,
      }),
    /Unsupported transaction type/,
  );
});

test("rejects invalid commission basis points", async () => {
  await assert.rejects(
    () =>
      resolveSellerCommissionRule({
        sellerPlanCode: "FREE",
        transactionType: "AUCTION",
        catalog: [
          {
            code: "FREE",
            label: "Free",
            commissionBps: -1,
          },
        ],
      }),
    /commissionBps must be a non-negative integer/,
  );
});

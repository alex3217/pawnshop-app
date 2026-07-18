import test from "node:test";
import assert from "node:assert/strict";

import {
  calculatePercentageFeeCents,
  calculatePlatformFeeCents,
  calculateSettlementRevenue,
} from "../src/services/revenue/revenueCalculator.service.js";

test("calculates a percentage fee using basis points", () => {
  assert.equal(
    calculatePercentageFeeCents(10_000, 800),
    800,
  );
});

test("rounds percentage fees to the nearest cent", () => {
  assert.equal(
    calculatePercentageFeeCents(999, 750),
    75,
  );
});

test("calculates a fixed fee", () => {
  const fee = calculatePlatformFeeCents({
    grossAmountCents: 10_000,
    pricingRule: {
      feeType: "FIXED_CENTS",
      amountCents: 299,
    },
  });

  assert.equal(fee, 299);
});

test("calculates percentage plus fixed fee", () => {
  const fee = calculatePlatformFeeCents({
    grossAmountCents: 10_000,
    pricingRule: {
      feeType: "PERCENT_PLUS_FIXED",
      percentBps: 500,
      amountCents: 100,
    },
  });

  assert.equal(fee, 600);
});

test("applies a minimum platform fee", () => {
  const fee = calculatePlatformFeeCents({
    grossAmountCents: 500,
    pricingRule: {
      feeType: "PERCENT_BPS",
      percentBps: 100,
      minCents: 100,
    },
  });

  assert.equal(fee, 100);
});

test("applies a maximum platform fee", () => {
  const fee = calculatePlatformFeeCents({
    grossAmountCents: 100_000,
    pricingRule: {
      feeType: "PERCENT_BPS",
      percentBps: 1_000,
      maxCents: 5_000,
    },
  });

  assert.equal(fee, 5_000);
});

test("never allows the fee to exceed gross amount", () => {
  const fee = calculatePlatformFeeCents({
    grossAmountCents: 500,
    pricingRule: {
      feeType: "FIXED_CENTS",
      amountCents: 1_000,
    },
  });

  assert.equal(fee, 500);
});

test("calculates seller proceeds when platform pays processor fee", () => {
  const result = calculateSettlementRevenue({
    grossAmountCents: 50_000,
    processorFeeCents: 1_480,
    processorFeePaidBy: "PLATFORM",
    pricingRule: {
      id: "rule-1",
      key: "seller_plan_free_commission_bps",
      label: "Free plan commission",
      category: "MARKETPLACE",
      appliesTo: "SELLER_PLAN_FREE",
      feeType: "PERCENT_BPS",
      percentBps: 800,
      currency: "USD",
    },
    calculatedAt: new Date("2026-07-18T12:00:00.000Z"),
  });

  assert.equal(result.grossAmountCents, 50_000);
  assert.equal(result.platformFeeCents, 4_000);
  assert.equal(result.processorFeeCents, 1_480);
  assert.equal(result.sellerNetCents, 46_000);
  assert.equal(result.platformNetCents, 2_520);
  assert.equal(result.pricingRuleId, "rule-1");
  assert.equal(
    result.pricingRuleSnapshot.percentBps,
    800,
  );
});

test("deducts processor fee from seller when seller is responsible", () => {
  const result = calculateSettlementRevenue({
    grossAmountCents: 50_000,
    processorFeeCents: 1_480,
    processorFeePaidBy: "SELLER",
    pricingRule: {
      feeType: "PERCENT_BPS",
      percentBps: 800,
    },
  });

  assert.equal(result.platformFeeCents, 4_000);
  assert.equal(result.sellerNetCents, 44_520);
  assert.equal(result.platformNetCents, 4_000);
});

test("rejects negative money values", () => {
  assert.throws(
    () =>
      calculateSettlementRevenue({
        grossAmountCents: -1,
        pricingRule: {
          feeType: "PERCENT_BPS",
          percentBps: 800,
        },
      }),
    /grossAmountCents must be a non-negative integer/,
  );
});

test("rejects invalid minimum and maximum limits", () => {
  assert.throws(
    () =>
      calculatePlatformFeeCents({
        grossAmountCents: 10_000,
        pricingRule: {
          feeType: "PERCENT_BPS",
          percentBps: 800,
          minCents: 1_000,
          maxCents: 500,
        },
      }),
    /minCents cannot exceed/,
  );
});

test("rejects unsupported fee types", () => {
  assert.throws(
    () =>
      calculatePlatformFeeCents({
        grossAmountCents: 10_000,
        pricingRule: {
          feeType: "UNKNOWN",
        },
      }),
    /Unsupported fee type/,
  );
});

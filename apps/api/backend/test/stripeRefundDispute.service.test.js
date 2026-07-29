import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRefundIdempotencyKey,
  requestStripeRefund,
  StripeFinancialLifecycleError,
} from "../src/services/stripeRefundDispute.service.js";

function marketplacePrisma({ alreadyRefundedCents = 0 } = {}) {
  const transaction = {
    id: "marketplace_1",
    status: "PAID",
    paymentIntentId: "pi_marketplace_1",
    buyerUserId: "buyer_1",
    sellerUserId: "seller_1",
    sellerShopId: "shop_1",
    totalAmount: "100.00",
    platformFee: "10.00",
    currency: "USD",
    metadata: {},
  };
  const client = {
    stripeRefund: {
      findUnique: async () => null,
      aggregate: async () => ({ _sum: { amountCents: alreadyRefundedCents } }),
      create: async ({ data }) => ({ id: "refund_local_1", ...data }),
    },
    stripeRefundAuditEvent: { create: async ({ data }) => ({ id: "audit_1", ...data }) },
    marketplaceTransaction: { findUnique: async () => transaction },
    sellerPayout: { findFirst: async () => null },
    $queryRaw: async () => [],
  };
  client.$transaction = async (callback) => callback(client);
  return client;
}

test("refund Stripe idempotency keys are deterministic and scoped", () => {
  const first = buildRefundIdempotencyKey("refund_record_1");
  assert.equal(first, buildRefundIdempotencyKey("refund_record_1"));
  assert.match(first, /^stripe-refund:v1:[a-f0-9]{64}$/);
  assert.notEqual(first, buildRefundIdempotencyKey("refund_record_2"));
});

test("refunds require a non-empty immutable audit reason", async () => {
  await assert.rejects(
    requestStripeRefund({
      marketplaceTransactionId: "marketplace_1",
      amountCents: 100,
      reason: "   ",
      requesterId: "admin_1",
      requestKey: "request_1",
      prismaClient: marketplacePrisma(),
    }),
    (error) => {
      assert.ok(error instanceof StripeFinancialLifecycleError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /reason is required/i);
      return true;
    },
  );
});

test("partial refunds reject amounts above the remaining integer-cent balance", async () => {
  let stripeCalls = 0;
  await assert.rejects(
    requestStripeRefund({
      marketplaceTransactionId: "marketplace_1",
      amountCents: 2_501,
      reason: "Item returned",
      requesterId: "admin_1",
      requestKey: "request_2",
      prismaClient: marketplacePrisma({ alreadyRefundedCents: 7_500 }),
      stripeClient: { refunds: { create: async () => { stripeCalls += 1; } } },
    }),
    (error) => {
      assert.equal(error.code, "REFUND_EXCEEDS_REMAINING");
      assert.equal(error.statusCode, 409);
      return true;
    },
  );
  assert.equal(stripeCalls, 0);
});

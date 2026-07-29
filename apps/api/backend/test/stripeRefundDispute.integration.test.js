import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import request from "supertest";

const DOMAIN = "@stripe-refund-dispute.integration.pawnloop.test";
const WEBHOOK_SECRET = "whsec_refund_dispute_integration_only";
let app;
let prisma;
let signer;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const ids = users.map(({ id }) => id);
  if (!ids.length) return;
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "StripeRefundAuditEvent" DISABLE TRIGGER "StripeRefundAuditEvent_append_only_trigger"',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "StripeDisputeEvent" DISABLE TRIGGER "StripeDisputeEvent_append_only_trigger"',
  );
  try {
    await prisma.stripeDisputeEvent.deleteMany({
      where: { dispute: { sellerUserId: { in: ids } } },
    });
    await prisma.sellerBalanceLedger.deleteMany({ where: { sellerUserId: { in: ids } } });
    await prisma.stripeDispute.deleteMany({ where: { sellerUserId: { in: ids } } });
    await prisma.stripeRefundAuditEvent.deleteMany({
      where: { refund: { sellerUserId: { in: ids } } },
    });
    await prisma.stripeRefund.deleteMany({ where: { sellerUserId: { in: ids } } });
    await prisma.marketplaceTransaction.deleteMany({
      where: { OR: [{ buyerUserId: { in: ids } }, { sellerUserId: { in: ids } }] },
    });
    await prisma.marketplaceListing.deleteMany({ where: { sellerUserId: { in: ids } } });
    await prisma.pawnShop.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "StripeRefundAuditEvent" ENABLE TRIGGER "StripeRefundAuditEvent_append_only_trigger"',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "StripeDisputeEvent" ENABLE TRIGGER "StripeDisputeEvent_append_only_trigger"',
    );
  }
}

async function fixture() {
  const password = await bcrypt.hash("RefundDispute123!", 4);
  const seller = await prisma.user.create({
    data: { name: "Seller", email: `seller${DOMAIN}`, password, role: "OWNER" },
  });
  const buyer = await prisma.user.create({
    data: { name: "Buyer", email: `buyer${DOMAIN}`, password, role: "CONSUMER" },
  });
  const shop = await prisma.pawnShop.create({
    data: { name: "Refund test shop", ownerId: seller.id },
  });
  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerUserId: seller.id,
      sellerShopId: shop.id,
      listingType: "SHOP_TO_CUSTOMER",
      status: "SOLD",
      title: "Refund lifecycle item",
      price: "100.00",
      currency: "USD",
      quantity: 0,
    },
  });
  const transaction = await prisma.marketplaceTransaction.create({
    data: {
      listingId: listing.id,
      buyerUserId: buyer.id,
      sellerUserId: seller.id,
      sellerShopId: shop.id,
      type: "DIRECT_PURCHASE",
      status: "PAID",
      quantity: 1,
      subtotal: "100.00",
      platformFee: "10.00",
      totalAmount: "100.00",
      paymentIntentId: "pi_refund_dispute_signed_integration",
    },
  });
  return { seller, buyer, shop, transaction };
}

function stripeEvent(type, object, suffix) {
  return {
    id: `evt_refund_dispute_${suffix}`,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
}

async function send(event) {
  const payload = JSON.stringify(event);
  const signature = signer.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return request(app)
    .post("/api/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: "stripe-refund-dispute-integration-jwt",
    STRIPE_SECRET_KEY: "sk_test_refund_dispute_integration_only",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
  });
  const [prismaModule, appModule] = await Promise.all([
    import("../src/lib/prisma.js"),
    import("../src/app.js"),
  ]);
  prisma = prismaModule.prisma;
  app = appModule.createApp({ readinessCheck: async () => true });
  signer = new Stripe("sk_test_refund_dispute_integration_only");
  await cleanup();
});

beforeEach(async () => cleanup());

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("signed refund webhooks persist and compensate idempotently", async () => {
  const { seller, transaction } = await fixture();
  const object = {
    id: "re_signed_partial_1",
    object: "refund",
    amount: 2_500,
    currency: "usd",
    payment_intent: transaction.paymentIntentId,
    charge: "ch_signed_refund_1",
    status: "succeeded",
    reason: "requested_by_customer",
    metadata: { auditReason: "Signed webhook partial return" },
  };
  const event = stripeEvent("refund.created", object, "refund_created");
  assert.equal((await send(event)).status, 200);
  assert.equal((await send(event)).status, 200);

  const refunds = await prisma.stripeRefund.findMany({
    where: { stripeRefundId: object.id },
    include: { auditEvents: true, ledgerEntry: true },
  });
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].amountCents, 2_500);
  assert.equal(refunds[0].auditEvents.length, 1);
  assert.equal(refunds[0].ledgerEntry.type, "REFUND_DEBIT");
  assert.equal(refunds[0].ledgerEntry.amountCents, 2_250);
  const stored = await prisma.marketplaceTransaction.findUnique({ where: { id: transaction.id } });
  assert.equal(stored.status, "PAID");
  assert.equal(stored.metadata.refunds.refundedAmountCents, 2_500);
  assert.equal(refunds[0].sellerUserId, seller.id);
});

test("signed dispute lifecycle debits and reinstates without rewriting history", async () => {
  const { transaction } = await fixture();
  const object = {
    id: "dp_signed_1",
    object: "dispute",
    amount: 10_000,
    currency: "usd",
    payment_intent: transaction.paymentIntentId,
    charge: "ch_signed_dispute_1",
    reason: "fraudulent",
    status: "needs_response",
    evidence_details: { due_by: Math.floor(Date.now() / 1000) + 86_400 },
  };
  assert.equal((await send(stripeEvent("charge.dispute.created", object, "dispute_created"))).status, 200);
  object.status = "won";
  assert.equal(
    (await send(stripeEvent("charge.dispute.funds_reinstated", object, "dispute_reinstated"))).status,
    200,
  );

  const dispute = await prisma.stripeDispute.findUnique({
    where: { stripeDisputeId: object.id },
    include: { events: true, ledgerEntries: { orderBy: { createdAt: "asc" } } },
  });
  assert.equal(dispute.events.length, 2);
  assert.deepEqual(dispute.ledgerEntries.map(({ type }) => type), [
    "REFUND_DEBIT",
    "REVERSAL_CREDIT",
  ]);
  const stored = await prisma.marketplaceTransaction.findUnique({ where: { id: transaction.id } });
  assert.equal(stored.status, "PAID");
});

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import request from "supertest";

const DOMAIN = "@stripe-subscription-webhook.integration.pawnloop.test";
const WEBHOOK_SECRET = "whsec_subscription_webhook_integration_only";
let app;
let prisma;
let signer;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  if (!userIds.length) return;
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "StripeSubscriptionBillingEvent" DISABLE TRIGGER "StripeSubscriptionBillingEvent_append_only_trigger"',
  );
  try {
    await prisma.stripeSubscriptionBillingEvent.deleteMany({
      where: { ownerUserId: { in: userIds } },
    });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pawnShop.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "StripeSubscriptionBillingEvent" ENABLE TRIGGER "StripeSubscriptionBillingEvent_append_only_trigger"',
    );
  }
}

async function fixture() {
  const owner = await prisma.user.create({
    data: {
      name: "Subscription owner",
      email: `owner${DOMAIN}`,
      password: await bcrypt.hash("SubscriptionWebhook123!", 4),
      role: "OWNER",
    },
  });
  const shop = await prisma.pawnShop.create({
    data: {
      name: "Subscription webhook shop",
      ownerId: owner.id,
      subscriptionPlan: "PRO",
      subscriptionStatus: "ACTIVE",
      subscriptionBillingInterval: "MONTH",
      stripeCustomerId: "cus_subscription_integration",
      stripeSubscriptionId: "sub_subscription_integration",
      stripePriceId: "price_pro_integration",
    },
  });
  return { owner, shop };
}

function event(type, object, id, created) {
  return {
    id,
    object: "event",
    api_version: "2025-01-27.acacia",
    created,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
}

function invoice(shop, id = "in_subscription_integration") {
  return {
    id,
    object: "invoice",
    customer: shop.stripeCustomerId,
    subscription: shop.stripeSubscriptionId,
    subscription_details: { metadata: { shopId: shop.id, planCode: "PRO" } },
    lines: {
      data: [{
        subscription: shop.stripeSubscriptionId,
        period: { start: 1_785_283_200, end: 1_787_961_600 },
        price: {
          id: "price_pro_integration",
          recurring: { interval: "month" },
          metadata: { planCode: "PRO" },
        },
      }],
    },
  };
}

async function send(stripeEvent) {
  const payload = JSON.stringify(stripeEvent);
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
    JWT_SECRET: "stripe-subscription-integration-jwt",
    STRIPE_SECRET_KEY: "sk_test_subscription_integration_only",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
  });
  const [prismaModule, appModule] = await Promise.all([
    import("../src/lib/prisma.js"),
    import("../src/app.js"),
  ]);
  prisma = prismaModule.prisma;
  app = appModule.createApp({ readinessCheck: async () => true });
  signer = new Stripe("sk_test_subscription_integration_only");
  await cleanup();
});

beforeEach(cleanup);

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("signed invoice failure and recovery synchronize once with immutable history", async () => {
  const { owner, shop } = await fixture();
  const failed = event(
    "invoice.payment_failed",
    invoice(shop),
    "evt_subscription_failed_integration",
    1_785_283_200,
  );
  assert.equal((await send(failed)).status, 200);
  assert.equal((await send(failed)).status, 200);

  let stored = await prisma.pawnShop.findUnique({ where: { id: shop.id } });
  assert.equal(stored.subscriptionStatus, "PAST_DUE");
  assert.equal(stored.stripeLatestInvoiceId, "in_subscription_integration");

  const recovered = event(
    "invoice.payment_succeeded",
    invoice(shop, "in_subscription_recovered_integration"),
    "evt_subscription_recovered_integration",
    1_785_369_600,
  );
  assert.equal((await send(recovered)).status, 200);

  stored = await prisma.pawnShop.findUnique({ where: { id: shop.id } });
  assert.equal(stored.subscriptionStatus, "ACTIVE");
  assert.equal(stored.subscriptionPlan, "PRO");
  const audits = await prisma.stripeSubscriptionBillingEvent.findMany({
    where: { shopId: shop.id },
    orderBy: { stripeEventCreatedAt: "asc" },
  });
  assert.equal(audits.length, 2);
  assert.deepEqual(audits.map(({ applied }) => applied), [true, true]);
  assert.deepEqual(audits.map(({ eventType }) => eventType), [
    "invoice.payment_failed",
    "invoice.payment_succeeded",
  ]);
  const notifications = await prisma.notification.findMany({
    where: { userId: owner.id },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(notifications.map(({ type }) => type), [
    "SUBSCRIPTION_PAYMENT_FAILED",
    "SUBSCRIPTION_PAYMENT_RECOVERED",
  ]);

  await assert.rejects(
    prisma.stripeSubscriptionBillingEvent.update({
      where: { id: audits[0].id },
      data: { applied: false },
    }),
    /append-only/,
  );
});

test("cancellation revokes paid entitlements and stale recovery cannot restore them", async () => {
  const { shop } = await fixture();
  const deleted = event(
    "customer.subscription.deleted",
    {
      id: shop.stripeSubscriptionId,
      object: "subscription",
      customer: shop.stripeCustomerId,
      status: "canceled",
      canceled_at: 1_785_456_000,
      metadata: { shopId: shop.id, planCode: "PRO" },
    },
    "evt_subscription_deleted_integration",
    1_785_456_000,
  );
  assert.equal((await send(deleted)).status, 200);

  const stalePayment = event(
    "invoice.payment_succeeded",
    invoice(shop, "in_stale_recovery_integration"),
    "evt_subscription_stale_recovery_integration",
    1_785_369_600,
  );
  assert.equal((await send(stalePayment)).status, 200);

  const stored = await prisma.pawnShop.findUnique({ where: { id: shop.id } });
  assert.equal(stored.subscriptionStatus, "CANCELED");
  assert.ok(stored.subscriptionCanceledAt);
  const audits = await prisma.stripeSubscriptionBillingEvent.findMany({
    where: { shopId: shop.id },
    orderBy: { stripeEventCreatedAt: "asc" },
  });
  assert.deepEqual(audits.map(({ applied }) => applied), [false, true]);

  const { buildEntitlements } = await import("../src/services/sellerPlan.service.js");
  const entitlements = buildEntitlements(stored, 0);
  assert.equal(entitlements.subscription.effectivePlan, "FREE");
  assert.equal(entitlements.subscription.isUsable, false);
});

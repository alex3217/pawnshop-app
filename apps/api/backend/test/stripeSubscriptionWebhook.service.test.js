import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileSellerSubscriptionAudit,
  syncStripeSubscriptionEvent,
} from "../src/services/stripeSubscriptionWebhook.service.js";

function shopFixture(overrides = {}) {
  return {
    id: "shop_1",
    ownerId: "owner_1",
    isDeleted: false,
    subscriptionPlan: "PRO",
    subscriptionStatus: "ACTIVE",
    subscriptionBillingInterval: "MONTH",
    subscriptionCurrentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    subscriptionStartedAt: new Date("2026-07-01T00:00:00.000Z"),
    subscriptionCanceledAt: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripePriceId: "price_pro",
    stripeLatestInvoiceId: null,
    stripeSubscriptionEventCreatedAt: null,
    stripeSubscriptionEventId: null,
    stripeSubscriptionEventType: null,
    ...overrides,
  };
}

function mockPrisma(initialShop = shopFixture()) {
  let shop = { ...initialShop };
  const audits = [];
  const adminAudits = [];
  const notifications = [];
  const client = {
    pawnShop: {
      findFirst: async ({ where }) => {
        const match =
          where.id === shop.id ||
          where.stripeSubscriptionId === shop.stripeSubscriptionId ||
          where.stripeCustomerId === shop.stripeCustomerId;
        return match ? { ...shop } : null;
      },
      findMany: async ({ where }) =>
        where.stripeCustomerId === shop.stripeCustomerId ? [{ ...shop }] : [],
      findUnique: async ({ where }) => (where.id === shop.id ? { ...shop } : null),
      update: async ({ data }) => {
        shop = { ...shop, ...data };
        return { ...shop };
      },
    },
    stripeSubscriptionBillingEvent: {
      findUnique: async ({ where }) =>
        audits.find(({ stripeEventId }) => stripeEventId === where.stripeEventId) || null,
      create: async ({ data }) => {
        const audit = { id: `audit_${audits.length + 1}`, ...data };
        audits.push(audit);
        return audit;
      },
    },
    notification: {
      createMany: async ({ data }) => {
        notifications.push(...data);
        return { count: data.length };
      },
    },
    superAdminAuditLog: {
      upsert: async ({ where, create }) => {
        const existing = adminAudits.find((row) => row.idempotencyKey === where.idempotencyKey);
        if (existing) return existing;
        const row = { id: `admin_audit_${adminAudits.length + 1}`, ...create };
        adminAudits.push(row);
        return row;
      },
    },
  };
  client.$transaction = async (callback) => callback(client);
  return {
    client,
    get shop() {
      return shop;
    },
    audits,
    notifications,
    adminAudits,
  };
}

function event(type, object, { id, created = 1_785_283_200 } = {}) {
  return {
    id: id || `evt_${type.replaceAll(".", "_")}`,
    type,
    created,
    data: { object },
  };
}

function invoice(overrides = {}) {
  return {
    id: "in_1",
    customer: "cus_1",
    subscription: "sub_1",
    subscription_details: { metadata: { shopId: "shop_1" } },
    lines: {
      data: [{
        subscription: "sub_1",
        period: { start: 1_785_283_200, end: 1_787_961_600 },
        price: {
          id: "price_pro",
          recurring: { interval: "month" },
          metadata: { planCode: "PRO" },
        },
      }],
    },
    ...overrides,
  };
}

test("payment failures are idempotent and retain a single immutable audit/notification", async () => {
  const db = mockPrisma();
  const stripeEvent = event("invoice.payment_failed", invoice(), { id: "evt_failure_1" });

  const first = await syncStripeSubscriptionEvent({
    event: stripeEvent,
    prismaClient: db.client,
  });
  const second = await syncStripeSubscriptionEvent({
    event: stripeEvent,
    prismaClient: db.client,
  });

  assert.equal(first.applied, true);
  assert.equal(second.duplicate, true);
  assert.equal(db.shop.subscriptionStatus, "PAST_DUE");
  assert.equal(db.shop.stripeLatestInvoiceId, "in_1");
  assert.equal(db.audits.length, 1);
  assert.equal(db.adminAudits.length, 0);
  assert.equal(db.notifications.length, 1);
  assert.equal(db.notifications[0].type, "SUBSCRIPTION_PAYMENT_FAILED");
});

test("successful payment recovers state and paid-plan access notification", async () => {
  const db = mockPrisma(shopFixture({ subscriptionStatus: "PAST_DUE" }));
  const successfulEvent = event("invoice.payment_succeeded", invoice(), { id: "evt_recovery_1" });
  const first = await syncStripeSubscriptionEvent({
    event: successfulEvent,
    prismaClient: db.client,
  });
  const replay = await syncStripeSubscriptionEvent({ event: successfulEvent, prismaClient: db.client });

  assert.equal(first.applied, true);
  assert.equal(replay.duplicate, true);
  assert.equal(db.shop.subscriptionStatus, "ACTIVE");
  assert.equal(db.shop.subscriptionPlan, "PRO");
  assert.equal(db.notifications[0].type, "SUBSCRIPTION_PAYMENT_RECOVERED");
  assert.equal(db.audits[0].previousState.status, "PAST_DUE");
  assert.equal(db.audits[0].resultingState.status, "ACTIVE");
  assert.equal(db.adminAudits.length, 1);
  assert.equal(db.adminAudits[0].action, "SELLER_SUBSCRIPTION_ACTIVATED");
  assert.equal(db.adminAudits[0].targetId, "shop_1");
  assert.equal(db.audits.length, 1);
  assert.equal(db.adminAudits.filter(({ action }) => action === "SELLER_SUBSCRIPTION_ACTIVATED").length, 1);
});

test("ACTIVE paid state with an expired period end creates no activation audit", async () => {
  const db = mockPrisma(shopFixture({ subscriptionStatus: "PAST_DUE" }));
  const expired = invoice({
    lines: { data: [{
      subscription: "sub_1",
      period: {
        start: Math.floor(Date.now() / 1000) - 7_200,
        end: Math.floor(Date.now() / 1000) - 3_600,
      },
      price: { id: "price_pro", recurring: { interval: "month" }, metadata: { planCode: "PRO" } },
    }] },
  });

  await syncStripeSubscriptionEvent({
    event: event("invoice.payment_succeeded", expired, {
      id: "evt_expired_recovery",
      created: Math.floor(Date.now() / 1000),
    }),
    prismaClient: db.client,
  });

  assert.equal(db.shop.subscriptionStatus, "ACTIVE");
  assert.equal(db.adminAudits.length, 0);
});

test("existing subscription reconciliation is truthful and idempotent", async () => {
  const db = mockPrisma();
  await reconcileSellerSubscriptionAudit({ shopId: "shop_1", prismaClient: db.client });
  await reconcileSellerSubscriptionAudit({ shopId: "shop_1", prismaClient: db.client });
  assert.equal(db.adminAudits.length, 1);
  assert.equal(db.adminAudits[0].action, "SELLER_SUBSCRIPTION_RECONCILED");
  assert.equal(db.adminAudits[0].metadata.effectivePlan, "PRO");
  assert.equal(db.adminAudits[0].metadata.interval, "MONTH");
});

test("reconciliation records inactive paid storage as effective FREE without claiming activation", async () => {
  const db = mockPrisma(shopFixture({ subscriptionStatus: "CANCELED" }));
  await reconcileSellerSubscriptionAudit({ shopId: "shop_1", prismaClient: db.client });
  assert.equal(db.adminAudits.length, 1);
  assert.equal(db.adminAudits[0].action, "SELLER_SUBSCRIPTION_RECONCILED");
  assert.equal(db.adminAudits[0].metadata.previousPlan, "PRO");
  assert.equal(db.adminAudits[0].metadata.effectivePlan, "FREE");
  assert.equal(db.adminAudits[0].metadata.status, "CANCELED");
});

test("subscription updates synchronize plan, interval, period, and scheduled cancellation", async () => {
  const db = mockPrisma();
  const subscription = {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    current_period_end: 1_787_961_600,
    cancel_at_period_end: true,
    metadata: { shopId: "shop_1", planCode: "PREMIUM" },
    items: {
      data: [{
        price: {
          id: "price_premium_year",
          recurring: { interval: "year" },
        },
      }],
    },
  };

  await syncStripeSubscriptionEvent({
    event: event("customer.subscription.updated", subscription, {
      id: "evt_subscription_update",
    }),
    prismaClient: db.client,
  });

  assert.equal(db.shop.subscriptionPlan, "PREMIUM");
  assert.equal(db.shop.subscriptionStatus, "ACTIVE");
  assert.equal(db.shop.subscriptionBillingInterval, "YEAR");
  assert.equal(db.shop.stripePriceId, "price_premium_year");
  assert.equal(db.shop.cancelAtPeriodEnd, true);
  assert.equal(
    db.shop.subscriptionCurrentPeriodEnd.toISOString(),
    "2026-08-29T00:00:00.000Z",
  );
  assert.equal(db.audits.length, 1);
});

test("older subscription updates are audited without overwriting newer cancellation", async () => {
  const db = mockPrisma(
    shopFixture({
      subscriptionStatus: "CANCELED",
      subscriptionCanceledAt: new Date("2026-07-29T12:00:00.000Z"),
      stripeSubscriptionEventCreatedAt: new Date("2026-07-29T12:00:00.000Z"),
      stripeSubscriptionEventId: "evt_new_cancel",
      stripeSubscriptionEventType: "customer.subscription.deleted",
    }),
  );
  const subscription = {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    current_period_end: 1_787_961_600,
    cancel_at_period_end: false,
    metadata: { shopId: "shop_1", planCode: "PREMIUM" },
  };

  const result = await syncStripeSubscriptionEvent({
    event: event("customer.subscription.updated", subscription, {
      id: "evt_old_update",
      created: 1_785_240_000,
    }),
    prismaClient: db.client,
  });

  assert.equal(result.applied, false);
  assert.equal(db.shop.subscriptionStatus, "CANCELED");
  assert.equal(db.shop.subscriptionPlan, "PRO");
  assert.equal(db.audits.length, 1);
  assert.equal(db.audits[0].applied, false);
});

test("a later invoice cannot reactivate a canceled subscription", async () => {
  const db = mockPrisma(
    shopFixture({
      subscriptionStatus: "CANCELED",
      subscriptionCanceledAt: new Date("2026-07-29T12:00:00.000Z"),
      stripeSubscriptionEventCreatedAt: new Date("2026-07-29T12:00:00.000Z"),
      stripeSubscriptionEventId: "evt_cancel",
      stripeSubscriptionEventType: "customer.subscription.deleted",
    }),
  );

  const result = await syncStripeSubscriptionEvent({
    event: event("invoice.payment_succeeded", invoice(), {
      id: "evt_late_payment",
      created: 1_785_369_601,
    }),
    prismaClient: db.client,
  });

  assert.equal(result.applied, false);
  assert.equal(db.shop.subscriptionStatus, "CANCELED");
  assert.equal(db.notifications.length, 0);
  assert.equal(db.audits[0].applied, false);
});

test("same-second cancellation outranks a successful invoice regardless of event id", async () => {
  const db = mockPrisma(
    shopFixture({
      stripeSubscriptionEventCreatedAt: new Date(1_785_283_200 * 1000),
      stripeSubscriptionEventId: "evt_z_payment",
      stripeSubscriptionEventType: "invoice.payment_succeeded",
    }),
  );
  const subscription = {
    id: "sub_1",
    customer: "cus_1",
    status: "canceled",
    canceled_at: 1_785_283_200,
    metadata: { shopId: "shop_1", planCode: "PRO" },
  };

  const result = await syncStripeSubscriptionEvent({
    event: event("customer.subscription.deleted", subscription, {
      id: "evt_a_cancel",
      created: 1_785_283_200,
    }),
    prismaClient: db.client,
  });

  assert.equal(result.applied, true);
  assert.equal(db.shop.subscriptionStatus, "CANCELED");
  assert.equal(db.shop.stripeSubscriptionEventType, "customer.subscription.deleted");
});

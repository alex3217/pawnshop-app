import assert from "node:assert/strict";
import test from "node:test";

import {
  executeBuyerSubscriptionLifecycle,
} from "../src/services/buyerSubscriptionLifecycle.service.js";

function makeRecord(overrides = {}) {
  return {
    id: "buyer-sub-1",
    userId: "user-1",
    plan: "PLUS",
    status: "ACTIVE",
    billingInterval: "MONTH",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    startedAt: null,
    canceledAt: null,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    stripeLatestInvoiceId: null,
    stripeCheckoutSessionId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    user: {
      id: "user-1",
      name: "Buyer Test",
      email: "buyer@example.com",
    },
    ...overrides,
  };
}

function makePrisma(initialRecord) {
  let current = {
    ...initialRecord,
    user: { ...initialRecord.user },
  };

  return {
    buyerSubscription: {
      async findUnique({ where }) {
        if (where.id !== current.id) return null;

        return {
          ...current,
          user: { ...current.user },
        };
      },

      async update({ where, data }) {
        assert.equal(where.id, current.id);

        current = {
          ...current,
          ...data,
          updatedAt: new Date(),
        };

        return {
          ...current,
          user: { ...current.user },
        };
      },
    },
  };
}

test(
  "requires a meaningful administrator reason",
  async () => {
    const prismaClient = makePrisma(makeRecord());

    await assert.rejects(
      executeBuyerSubscriptionLifecycle({
        subscriptionId: "buyer-sub-1",
        input: {
          action: "ADMIN_CORRECTION",
          reason: "short",
          planCode: "PREMIUM",
        },
        prismaClient,
      }),
      /at least 10 characters/i,
    );
  },
);

test(
  "allows local administrative corrections without Stripe",
  async () => {
    const prismaClient = makePrisma(makeRecord());

    const result =
      await executeBuyerSubscriptionLifecycle({
        subscriptionId: "buyer-sub-1",
        input: {
          action: "ADMIN_CORRECTION",
          reason:
            "Correcting a verified legacy subscription record.",
          planCode: "PREMIUM",
          status: "ACTIVE",
        },
        prismaClient,
      });

    assert.equal(result.stripeApplied, false);
    assert.equal(result.subscription.plan, "PREMIUM");
    assert.equal(result.subscription.status, "ACTIVE");
  },
);

test(
  "rejects local plan correction for Stripe-backed subscriptions",
  async () => {
    const prismaClient = makePrisma(
      makeRecord({
        stripeSubscriptionId: "sub_test_123",
      }),
    );

    await assert.rejects(
      executeBuyerSubscriptionLifecycle({
        subscriptionId: "buyer-sub-1",
        input: {
          action: "ADMIN_CORRECTION",
          reason:
            "Attempting a local correction for testing.",
          planCode: "PREMIUM",
        },
        prismaClient,
      }),
      /synchronize from Stripe/i,
    );
  },
);

test(
  "applies cancel-at-period-end through Stripe and syncs local state",
  async () => {
    const prismaClient = makePrisma(
      makeRecord({
        stripeCustomerId: "cus_test_123",
        stripeSubscriptionId: "sub_test_123",
        stripePriceId: "price_test_plus",
      }),
    );

    const calls = [];

    const stripeClient = {
      subscriptions: {
        async update(id, params) {
          calls.push({ id, params });

          return {
            id,
            status: "active",
            customer: "cus_test_123",
            cancel_at_period_end: true,
            current_period_start: 1767225600,
            current_period_end: 1769904000,
            start_date: 1767225600,
            canceled_at: null,
            trial_end: null,
            latest_invoice: "in_test_123",
            metadata: {
              planCode: "PLUS",
            },
            items: {
              data: [
                {
                  price: {
                    id: "price_test_plus",
                    recurring: {
                      interval: "month",
                    },
                  },
                },
              ],
            },
          };
        },
      },
    };

    const result =
      await executeBuyerSubscriptionLifecycle({
        subscriptionId: "buyer-sub-1",
        input: {
          action: "CANCEL_AT_PERIOD_END",
          reason:
            "Customer requested cancellation after support review.",
        },
        prismaClient,
        stripeClient,
      });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].params.cancel_at_period_end,
      true,
    );
    assert.equal(result.stripeApplied, true);
    assert.equal(
      result.subscription.cancelAtPeriodEnd,
      true,
    );
    assert.equal(
      result.subscription.stripeLatestInvoiceId,
      "in_test_123",
    );
  },
);

import assert from "node:assert/strict";
import test from "node:test";
import {
  syncStripeConnectedAccountPayoutEvent,
} from "../src/services/payouts/stripeConnectedAccountPayout.service.js";

function store({ knownAccount = true } = {}) {
  const payouts = new Map();
  const events = new Map();
  const tx = {
    pawnShop: {
      findUnique: async ({ where }) =>
        knownAccount && where.stripeConnectAccountId === "acct_1" ? { id: "shop_1" } : null,
    },
    stripeConnectedAccountPayout: {
      findUnique: async ({ where }) => payouts.get(where.stripePayoutId) || null,
      create: async ({ data }) => {
        const row = { id: `record_${payouts.size + 1}`, ...data };
        payouts.set(data.stripePayoutId, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = [...payouts.values()].find((candidate) => candidate.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    stripeConnectedAccountPayoutEvent: {
      findUnique: async ({ where }) => events.get(where.stripeEventId) || null,
      create: async ({ data }) => {
        events.set(data.stripeEventId, data);
        return data;
      },
    },
  };
  return {
    payouts,
    events,
    client: { $transaction: async (callback) => callback(tx) },
  };
}

function event(type, {
  id = `evt_${type}`,
  created = 100,
  status = "pending",
  payoutId = "po_1",
  account = "acct_1",
  failure_code = null,
  failure_message = null,
} = {}) {
  return {
    id,
    type,
    created,
    account,
    data: {
      object: {
        id: payoutId,
        amount: 2500,
        currency: "usd",
        status,
        arrival_date: 200,
        created: 90,
        method: "standard",
        type: "bank_account",
        failure_code,
        failure_message,
      },
    },
  };
}

test("payout.created and payout.updated create and update a shop-scoped ledger row", async () => {
  const { client, payouts, events } = store();
  const created = await syncStripeConnectedAccountPayoutEvent({
    event: event("payout.created"),
    prismaClient: client,
  });
  assert.equal(created.applied, true);
  assert.equal(created.shopResolved, true);
  assert.equal(payouts.get("po_1").shopId, "shop_1");
  assert.equal(payouts.get("po_1").currency, "USD");
  assert.equal(payouts.get("po_1").payoutMethod, "standard");

  await syncStripeConnectedAccountPayoutEvent({
    event: event("payout.updated", { created: 110, status: "in_transit" }),
    prismaClient: client,
  });
  assert.equal(payouts.get("po_1").status, "in_transit");
  assert.equal(events.size, 2);
});

test("payout.paid and payout.failed set actual terminal timestamps and failure details", async () => {
  const { client, payouts } = store();
  await syncStripeConnectedAccountPayoutEvent({
    event: event("payout.paid", { payoutId: "po_paid", status: "paid", created: 120 }),
    prismaClient: client,
  });
  assert.equal(payouts.get("po_paid").status, "paid");
  assert.equal(payouts.get("po_paid").paidAt.toISOString(), new Date(120000).toISOString());

  await syncStripeConnectedAccountPayoutEvent({
    event: event("payout.failed", {
      payoutId: "po_failed",
      status: "failed",
      created: 130,
      failure_code: "account_closed",
      failure_message: "The bank account is closed",
    }),
    prismaClient: client,
  });
  assert.equal(payouts.get("po_failed").failedAt.toISOString(), new Date(130000).toISOString());
  assert.equal(payouts.get("po_failed").failureCode, "account_closed");
  assert.equal(payouts.get("po_failed").failureMessage, "The bank account is closed");
});

test("duplicate and out-of-order events do not overwrite the latest payout snapshot", async () => {
  const { client, payouts, events } = store();
  const paid = event("payout.paid", { id: "evt_paid", status: "paid", created: 200 });
  await syncStripeConnectedAccountPayoutEvent({ event: paid, prismaClient: client });
  assert.deepEqual(
    await syncStripeConnectedAccountPayoutEvent({ event: paid, prismaClient: client }),
    { duplicate: true, applied: false },
  );
  const older = await syncStripeConnectedAccountPayoutEvent({
    event: event("payout.created", { id: "evt_old", status: "pending", created: 100 }),
    prismaClient: client,
  });
  assert.equal(older.applied, false);
  assert.equal(payouts.get("po_1").status, "paid");
  assert.equal(events.size, 2);
});

test("same-second delivery cannot regress a terminal payout snapshot", async () => {
  const { client, payouts } = store();
  await syncStripeConnectedAccountPayoutEvent({
    event: event("payout.paid", { id: "evt_paid_same_second", status: "paid", created: 200 }),
    prismaClient: client,
  });
  const result = await syncStripeConnectedAccountPayoutEvent({
    event: event("payout.updated", { id: "evt_pending_same_second", status: "pending", created: 200 }),
    prismaClient: client,
  });
  assert.equal(result.applied, false);
  assert.equal(payouts.get("po_1").status, "paid");
});

test("missing event.account is rejected and unknown accounts remain safely unassociated", async () => {
  await assert.rejects(
    syncStripeConnectedAccountPayoutEvent({
      event: event("payout.created", { account: "" }),
      prismaClient: store().client,
    }),
    (error) => error.statusCode === 400 && /event.account/.test(error.message),
  );
  const { client, payouts } = store({ knownAccount: false });
  const result = await syncStripeConnectedAccountPayoutEvent({
    event: event("payout.created"),
    prismaClient: client,
  });
  assert.equal(result.shopResolved, false);
  assert.equal(payouts.get("po_1").shopId, null);
});

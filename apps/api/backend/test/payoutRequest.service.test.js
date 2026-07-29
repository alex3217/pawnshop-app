import assert from "node:assert/strict";
import test from "node:test";
import {
  PayoutRequestError,
  cancelPayoutRequest,
  createPayoutRequest,
  normalizePayoutIdempotencyKey,
  processPayoutRequest,
  syncPayoutTransferEvent,
} from "../src/services/payouts/payoutRequest.service.js";

function withConnectEnabled(fn) {
  const previous = process.env.STRIPE_CONNECT_ENABLED;
  process.env.STRIPE_CONNECT_ENABLED = "true";
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete process.env.STRIPE_CONNECT_ENABLED;
      else process.env.STRIPE_CONNECT_ENABLED = previous;
    });
}

function createRequestStore({ availableCents = 5000, shopPatch = {} } = {}) {
  const state = { payouts: [], ledger: [] };
  const shop = {
    id: "shop_1",
    ownerId: "owner_1",
    stripeConnectAccountId: "acct_1",
    stripeConnectDetailsSubmitted: true,
    stripeConnectPayoutsEnabled: true,
    ...shopPatch,
  };
  const tx = {
    $queryRaw: async () => [{ id: shop.id }],
    pawnShop: { findFirst: async () => shop },
    sellerPayout: {
      findUnique: async ({ where }) =>
        state.payouts.find((row) =>
          where.idempotencyKey ? row.idempotencyKey === where.idempotencyKey : row.id === where.id,
        ) || null,
      create: async ({ data }) => {
        const row = {
          id: `payout_${state.payouts.length + 1}`,
          requestedAt: new Date(),
          ...data,
        };
        state.payouts.push(row);
        return row;
      },
    },
    sellerBalanceLedger: {
      aggregate: async ({ where }) => ({
        _sum: {
          amountCents: where.type?.in
            ? state.ledger.reduce((sum, row) => sum + row.amountCents, 0)
            : availableCents + state.ledger.reduce((sum, row) => sum + row.amountCents, 0),
        },
      }),
      create: async ({ data }) => {
        state.ledger.push(data);
        return data;
      },
    },
  };
  return {
    state,
    client: {
      sellerPayout: tx.sellerPayout,
      $transaction: async (callback) => callback(tx),
    },
  };
}

test("normalizes and scopes idempotency keys without storing the raw key", () => {
  const first = normalizePayoutIdempotencyKey(" browser-key ", "owner_1");
  assert.equal(first, normalizePayoutIdempotencyKey("browser-key", "owner_1"));
  assert.notEqual(first, normalizePayoutIdempotencyKey("browser-key", "owner_2"));
  assert.equal(first.includes("browser-key"), false);
});

test("Connect disabled returns a safe 503 before database access", async () => {
  const previous = process.env.STRIPE_CONNECT_ENABLED;
  process.env.STRIPE_CONNECT_ENABLED = "false";
  await assert.rejects(
    createPayoutRequest({
      shopId: "shop_1", amountCents: 1000, requesterId: "owner_1",
      idempotencyKey: "key", prismaClient: {},
    }),
    (error) => error instanceof PayoutRequestError && error.statusCode === 503,
  );
  if (previous === undefined) delete process.env.STRIPE_CONNECT_ENABLED;
  else process.env.STRIPE_CONNECT_ENABLED = previous;
});

test("validates positive integer amount, USD, and configured minimum", async () => {
  await withConnectEnabled(async () => {
    for (const input of [
      { amountCents: 0, currency: "USD" },
      { amountCents: 1000.5, currency: "USD" },
      { amountCents: 1000, currency: "EUR" },
      { amountCents: 999, currency: "USD" },
    ]) {
      await assert.rejects(createPayoutRequest({
        shopId: "shop_1", requesterId: "owner_1", idempotencyKey: "key",
        prismaClient: {}, ...input,
      }), PayoutRequestError);
    }
  });
});

test("requires complete Connect setup and payouts capability", async () => {
  await withConnectEnabled(async () => {
    for (const shopPatch of [
      { stripeConnectAccountId: null },
      { stripeConnectDetailsSubmitted: false },
      { stripeConnectPayoutsEnabled: false },
    ]) {
      const { client } = createRequestStore({ shopPatch });
      await assert.rejects(createPayoutRequest({
        shopId: "shop_1", amountCents: 1000, requesterId: "owner_1",
        idempotencyKey: JSON.stringify(shopPatch), prismaClient: client,
      }), (error) => [409].includes(error.statusCode));
    }
  });
});

test("atomically creates one payout and AVAILABLE PAYOUT_DEBIT reservation", async () => {
  await withConnectEnabled(async () => {
    const { client, state } = createRequestStore();
    const first = await createPayoutRequest({
      shopId: "shop_1", amountCents: 1500, requesterId: "owner_1",
      idempotencyKey: "same-key", prismaClient: client,
    });
    const replay = await createPayoutRequest({
      shopId: "shop_1", amountCents: 1500, requesterId: "owner_1",
      idempotencyKey: "same-key", prismaClient: client,
    });
    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(state.payouts.length, 1);
    assert.equal(state.ledger.length, 1);
    assert.equal(state.ledger[0].type, "PAYOUT_DEBIT");
    assert.equal(state.ledger[0].status, "AVAILABLE");
    assert.equal(state.ledger[0].amountCents, 1500);
    assert.equal(state.ledger[0].payoutId, first.payout.id);
    await assert.rejects(createPayoutRequest({
      shopId: "shop_1", amountCents: 1600, requesterId: "owner_1",
      idempotencyKey: "same-key", prismaClient: client,
    }), (error) => error.statusCode === 409);
  });
});

test("rejects a request exceeding the in-lock available balance", async () => {
  await withConnectEnabled(async () => {
    const { client } = createRequestStore({ availableCents: 1200 });
    await assert.rejects(createPayoutRequest({
      shopId: "shop_1", amountCents: 1500, requesterId: "owner_1",
      idempotencyKey: "too-much", prismaClient: client,
    }), (error) => error.code === "INSUFFICIENT_BALANCE");
  });
});

test("cancellation is idempotent and reverses the reservation", async () => {
  const payout = { id: "payout_1", shopId: "shop_1", status: "PENDING" };
  let ledgerStatus = "AVAILABLE";
  const tx = {
    $queryRaw: async () => [],
    sellerPayout: {
      findUnique: async () => payout,
      update: async ({ data }) => Object.assign(payout, data),
    },
    sellerBalanceLedger: {
      updateMany: async ({ data }) => {
        ledgerStatus = data.status;
        return { count: 1 };
      },
    },
  };
  const client = { $transaction: async (callback) => callback(tx) };
  const first = await cancelPayoutRequest({
    shopId: "shop_1", payoutId: "payout_1", requesterId: "owner_1", prismaClient: client,
  });
  const replay = await cancelPayoutRequest({
    shopId: "shop_1", payoutId: "payout_1", requesterId: "owner_1", prismaClient: client,
  });
  assert.equal(first.status, "CANCELED");
  assert.equal(replay.status, "CANCELED");
  assert.equal(ledgerStatus, "REVERSED");
});

test("processing uses a Connect transfer and Stripe idempotency then marks transferred", async () => {
  await withConnectEnabled(async () => {
  const payout = {
    id: "payout_1", shopId: "shop_1", status: "PENDING", amountCents: 1200,
    currency: "USD", stripeTransferId: null, shop: { stripeConnectAccountId: "acct_1" },
  };
  let stripeCall;
  const model = {
    findUnique: async () => payout,
    update: async ({ data, include }) => {
      Object.assign(payout, data);
      return include ? payout : { ...payout };
    },
  };
  const client = {
    sellerPayout: model,
    $transaction: async (callback) => callback({ $queryRaw: async () => [], sellerPayout: model }),
  };
  const result = await processPayoutRequest({
    shopId: "shop_1", payoutId: "payout_1", reviewerId: "admin_1",
    prismaClient: client,
    stripe: { transfers: { create: async (...args) => {
      stripeCall = args;
      return { id: "tr_1" };
    } } },
  });
  assert.equal(result.status, "TRANSFERRED");
  assert.equal(result.stripeTransferId, "tr_1");
  assert.equal(result.providerPayoutId, undefined);
  assert.equal(result.paidAt, undefined);
  assert.equal(stripeCall[0].destination, "acct_1");
  assert.equal(stripeCall[1].idempotencyKey, "seller-payout:payout_1");
  });
});

test("processing an already transferred request does not create another transfer", async () => {
  await withConnectEnabled(async () => {
    const payout = {
      id: "payout_1", shopId: "shop_1", status: "TRANSFERRED",
      stripeTransferId: "tr_existing", shop: { stripeConnectAccountId: "acct_1" },
    };
    let calls = 0;
    const client = {
      sellerPayout: { findUnique: async () => payout },
      $transaction: async (callback) => callback({
        $queryRaw: async () => [],
        sellerPayout: { findUnique: async () => payout },
      }),
    };
    const result = await processPayoutRequest({
      shopId: "shop_1", payoutId: "payout_1", reviewerId: "admin_1",
      prismaClient: client,
      stripe: { transfers: { create: async () => { calls += 1; } } },
    });
    assert.equal(result, payout);
    assert.equal(calls, 0);
  });
});

test("transfer reversal webhook is idempotent and unmatched events are ignored", async () => {
  const payout = { id: "payout_1", status: "PAID" };
  let releases = 0;
  const client = {
    sellerPayout: {
      findFirst: async ({ where }) => where.OR.some((item) => item.id === "payout_1") ? payout : null,
      update: async ({ data }) => Object.assign(payout, data),
    },
    sellerBalanceLedger: {
      updateMany: async () => {
        releases += 1;
        return { count: 1 };
      },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const transfer = { id: "tr_1", metadata: { payoutId: "payout_1" } };
  assert.deepEqual(await syncPayoutTransferEvent({
    transfer, eventType: "transfer.reversed", prismaClient: client,
  }), { matched: true });
  assert.equal(payout.status, "FAILED");
  assert.equal(releases, 1);
  await syncPayoutTransferEvent({ transfer, eventType: "transfer.reversed", prismaClient: client });
  assert.equal(releases, 1);
  client.sellerPayout.findFirst = async () => null;
  assert.deepEqual(await syncPayoutTransferEvent({
    transfer: { id: "tr_missing", metadata: {} },
    eventType: "transfer.updated", prismaClient: client,
  }), { matched: false });
});

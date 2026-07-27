import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStripeConnectStatus,
  createStripeConnectOnboardingLink,
  ensureStripeConnectAccount,
  isStripeConnectEnabled,
  normalizeStripeConnectAccount,
  syncStripeConnectAccountUpdated,
  validateStripeConnectReturnUrl,
} from "../src/services/stripeConnect.service.js";

function createStore(initialShop) {
  let shop = { ...initialShop };
  const updates = [];
  const prismaClient = {
    pawnShop: {
      async update(input) {
        updates.push(input);
        shop = { ...shop, ...input.data };
        return { ...shop };
      },
      async findUnique({ where }) {
        if (
          where.stripeConnectAccountId &&
          where.stripeConnectAccountId !== shop.stripeConnectAccountId
        ) {
          return null;
        }
        return { ...shop };
      },
    },
  };
  return { prismaClient, updates, getShop: () => shop };
}

test("Connect is disabled unless explicitly enabled", () => {
  assert.equal(isStripeConnectEnabled(undefined), false);
  assert.equal(isStripeConnectEnabled("false"), false);
  assert.equal(isStripeConnectEnabled("disabled"), false);
  assert.equal(isStripeConnectEnabled("true"), true);
  assert.equal(isStripeConnectEnabled("1"), true);
});

test("normalizes only the required Stripe account capability fields", () => {
  assert.deepEqual(
    normalizeStripeConnectAccount({
      id: "acct_secret",
      details_submitted: 1,
      charges_enabled: false,
      payouts_enabled: true,
      external_accounts: { data: ["not exposed"] },
    }),
    {
      detailsSubmitted: true,
      chargesEnabled: false,
      payoutsEnabled: true,
    },
  );
});

test("builds each normalized frontend status without exposing the account id", () => {
  const base = {
    stripeConnectAccountId: "acct_private",
    stripeConnectDetailsSubmitted: true,
    stripeConnectChargesEnabled: false,
    stripeConnectPayoutsEnabled: false,
  };
  const status = buildStripeConnectStatus(base, true);

  assert.equal(status.state, "RESTRICTED");
  assert.equal(status.hasAccount, true);
  assert.equal("stripeConnectAccountId" in status, false);
  assert.equal(buildStripeConnectStatus({}, false).state, "DISABLED");
  assert.equal(buildStripeConnectStatus({}, true).state, "NOT_STARTED");
  assert.equal(
    buildStripeConnectStatus(
      { stripeConnectAccountId: "acct_1" },
      true,
    ).state,
    "SETUP_INCOMPLETE",
  );
  assert.equal(
    buildStripeConnectStatus(
      { ...base, stripeConnectPayoutsEnabled: true },
      true,
    ).state,
    "PAYOUTS_ENABLED",
  );
});

test("creates an Express account idempotently with PawnShop metadata", async () => {
  const shop = {
    id: "shop_1",
    ownerId: "owner_1",
    stripeConnectAccountId: null,
  };
  const store = createStore(shop);
  const createCalls = [];
  const stripeClient = {
    accounts: {
      async create(params, options) {
        createCalls.push({ params, options });
        return {
          id: "acct_1",
          details_submitted: false,
          charges_enabled: false,
          payouts_enabled: false,
        };
      },
    },
  };

  const first = await ensureStripeConnectAccount({
    shop,
    prismaClient: store.prismaClient,
    stripeClient,
  });

  assert.equal(first.created, true);
  assert.equal(first.shop.stripeConnectAccountId, "acct_1");
  assert.deepEqual(createCalls, [
    {
      params: {
        type: "express",
        metadata: {
          pawnShopId: "shop_1",
          pawnShopOwnerId: "owner_1",
        },
      },
      options: {
        idempotencyKey: "pawnshop-connect-account-shop_1",
      },
    },
  ]);
});

test("reuses and refreshes an existing connected account", async () => {
  const shop = {
    id: "shop_1",
    ownerId: "owner_1",
    stripeConnectAccountId: "acct_existing",
    stripeConnectOnboardingCompletedAt: null,
  };
  const store = createStore(shop);
  let retrieved = "";
  const stripeClient = {
    accounts: {
      async retrieve(id) {
        retrieved = id;
        return {
          id,
          details_submitted: true,
          charges_enabled: true,
          payouts_enabled: true,
        };
      },
      async create() {
        assert.fail("existing account must not be recreated");
      },
    },
  };

  const result = await ensureStripeConnectAccount({
    shop,
    prismaClient: store.prismaClient,
    stripeClient,
  });

  assert.equal(result.created, false);
  assert.equal(retrieved, "acct_existing");
  assert.equal(result.shop.stripeConnectPayoutsEnabled, true);
  assert.ok(result.shop.stripeConnectOnboardingCompletedAt instanceof Date);
});

test("creates a Stripe-hosted account onboarding link with validated URLs", async () => {
  const shop = {
    id: "shop_1",
    ownerId: "owner_1",
    stripeConnectAccountId: "acct_existing",
  };
  const store = createStore(shop);
  let linkParams;
  const stripeClient = {
    accounts: {
      async retrieve() {
        return {
          details_submitted: false,
          charges_enabled: false,
          payouts_enabled: false,
        };
      },
    },
    accountLinks: {
      async create(params) {
        linkParams = params;
        return {
          url: "https://connect.stripe.com/setup/s/test",
          expires_at: 1_800_000_000,
        };
      },
    },
  };

  const result = await createStripeConnectOnboardingLink({
    shop,
    returnUrl: "https://app.example.com/owner/finance?connect=returned",
    refreshUrl: "https://app.example.com/owner/finance?connect=refresh",
    allowedOrigins: ["https://app.example.com"],
    prismaClient: store.prismaClient,
    stripeClient,
  });

  assert.equal(result.url, "https://connect.stripe.com/setup/s/test");
  assert.deepEqual(linkParams, {
    account: "acct_existing",
    return_url: "https://app.example.com/owner/finance?connect=returned",
    refresh_url: "https://app.example.com/owner/finance?connect=refresh",
    type: "account_onboarding",
  });
});

test("rejects untrusted, insecure, credentialed, and fragmented return URLs", () => {
  const options = { allowedOrigins: ["https://app.example.com"] };
  for (const value of [
    "https://evil.example/owner/finance",
    "http://app.example.com/owner/finance",
    "https://user:pass@app.example.com/owner/finance",
    "https://app.example.com/owner/finance#fragment",
  ]) {
    assert.throws(
      () => validateStripeConnectReturnUrl(value, "returnUrl", options),
      (error) =>
        error.statusCode === 400 &&
        error.code === "INVALID_CONNECT_URL",
    );
  }
  assert.equal(
    validateStripeConnectReturnUrl(
      "http://localhost:5173/owner/finance",
      "returnUrl",
      { allowedOrigins: ["http://localhost:5173"] },
    ),
    "http://localhost:5173/owner/finance",
  );
});

test("account.updated synchronizes a matching shop idempotently", async () => {
  const completedAt = new Date("2026-07-27T12:00:00.000Z");
  const store = createStore({
    id: "shop_1",
    isDeleted: false,
    stripeConnectAccountId: "acct_1",
    stripeConnectOnboardingCompletedAt: completedAt,
  });
  const account = {
    id: "acct_1",
    details_submitted: true,
    charges_enabled: true,
    payouts_enabled: true,
  };

  const first = await syncStripeConnectAccountUpdated({
    account,
    prismaClient: store.prismaClient,
    now: new Date("2026-07-27T13:00:00.000Z"),
  });
  const second = await syncStripeConnectAccountUpdated({
    account,
    prismaClient: store.prismaClient,
    now: new Date("2026-07-27T14:00:00.000Z"),
  });

  assert.equal(first.matched, true);
  assert.equal(second.matched, true);
  assert.equal(
    store.getShop().stripeConnectOnboardingCompletedAt,
    completedAt,
  );
  assert.equal(store.getShop().stripeConnectPayoutsEnabled, true);
});

test("an unmatched account.updated event is safely ignored", async () => {
  const store = createStore({
    id: "shop_1",
    stripeConnectAccountId: "acct_known",
  });
  const result = await syncStripeConnectAccountUpdated({
    account: { id: "acct_unknown" },
    prismaClient: store.prismaClient,
  });

  assert.deepEqual(result, { matched: false });
  assert.equal(store.updates.length, 0);
});

test("Stripe account failures propagate without being converted to account data", async () => {
  const expected = new Error("Stripe internal detail");
  await assert.rejects(
    ensureStripeConnectAccount({
      shop: {
        id: "shop_1",
        ownerId: "owner_1",
        stripeConnectAccountId: "acct_1",
      },
      prismaClient: createStore({ id: "shop_1" }).prismaClient,
      stripeClient: {
        accounts: {
          async retrieve() {
            throw expected;
          },
        },
      },
    }),
    expected,
  );
});

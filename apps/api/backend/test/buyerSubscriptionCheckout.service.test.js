import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBuyerCheckoutInput,
  selectBuyerCheckoutConfig,
  createBuyerSubscriptionCheckout,
  deriveBuyerCheckoutIdempotencyKey,
} from "../src/services/buyerSubscriptionCheckout.service.js";
import { assertStripePriceMatchesBillingConfig } from "../src/services/stripeSubscriptionPrice.service.js";
import { validateStripeConnectReturnUrl } from "../src/services/stripeConnect.service.js";

const catalog = [{
  code: "PLUS",
  currency: "USD",
  monthlyPriceCents: 699,
  yearlyPriceCents: 6900,
  stripeMonthlyPriceId: "price_plus_month",
  stripeYearlyPriceId: "price_plus_year",
}];

test("buyer checkout rejects Free before Stripe session creation", () => {
  assert.throws(() => normalizeBuyerCheckoutInput({ planCode: "FREE" }), { code: "BUYER_FREE_CHECKOUT_NOT_ALLOWED" });
});

test("buyer checkout resolves monthly and yearly prices on the server", () => {
  assert.deepEqual(selectBuyerCheckoutConfig(catalog, "PLUS", "MONTH"), {
    planCode: "PLUS", billingInterval: "MONTH", amountCents: 699,
    priceId: "price_plus_month", currency: "usd", expectedStripeInterval: "month",
  });
  assert.equal(selectBuyerCheckoutConfig(catalog, "PLUS", "YEAR").priceId, "price_plus_year");
});

test("buyer checkout rejects a missing configured Stripe price", () => {
  assert.throws(() => selectBuyerCheckoutConfig([{ ...catalog[0], stripeYearlyPriceId: null }], "PLUS", "YEAR"), { code: "BUYER_STRIPE_PRICE_NOT_CONFIGURED" });
});

test("buyer checkout rejects Stripe test/live mode mismatches", () => {
  const config = selectBuyerCheckoutConfig(catalog, "PLUS", "MONTH");
  assert.throws(() => assertStripePriceMatchesBillingConfig({ id: config.priceId, unit_amount: 699, currency: "usd", type: "recurring", recurring: { interval: "month" }, active: true, livemode: true }, config, "sk_test_example"), { code: "STRIPE_PRICE_MODE_MISMATCH" });
});

test("buyer checkout uses a stable scoped idempotency key", async () => {
  const keys = []; const sessions = [];
  const prismaClient = {
    user: { findUnique: async () => ({ id: "buyer-1", name: "Buyer", email: "buyer@example.test", stripeCustomerId: "cus_1" }) },
    buyerSubscription: { findUnique: async () => null },
  };
  const stripeClient = {
    prices: { retrieve: async () => ({ id: "price_plus_month", unit_amount: 699, currency: "usd", type: "recurring", recurring: { interval: "month" }, active: true, livemode: false }) },
    checkout: { sessions: { create: async (params, options) => { sessions.push(params); keys.push(options.idempotencyKey); return { url: "https://checkout.stripe.test/session" }; } } },
  };
  const input = { planCode: "PLUS", billingInterval: "MONTH" };
  for (let index = 0; index < 2; index += 1) await createBuyerSubscriptionCheckout({ userId: "buyer-1", input, successUrl: "https://pawnloop.test/success", cancelUrl: "https://pawnloop.test/cancel", requestId: "request-key-0001", prismaClient, stripeClient, stripeSecretKey: "sk_test_example", catalog });
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); assert.match(keys[0], /^buyer-subscription:buyer-1:PLUS:MONTH:/);
  assert.deepEqual(sessions[0].line_items, [{ price: "price_plus_month", quantity: 1 }]);
  assert.equal("priceId" in sessions[0].metadata, false);
});

test("buyer checkout ignores client-supplied pricing and uses PlatformPricingRule catalog data", async () => {
  const sessions = [];
  const prismaClient = {
    user: { findUnique: async () => ({ id: "buyer-1", name: "Buyer", email: "buyer@example.test", stripeCustomerId: "cus_1" }) },
    buyerSubscription: { findUnique: async () => null },
  };
  const stripeClient = {
    prices: { retrieve: async (id) => { assert.equal(id, "price_plus_month"); return { id, unit_amount: 699, currency: "usd", type: "recurring", recurring: { interval: "month" }, active: true, livemode: false }; } },
    checkout: { sessions: { create: async (params) => { sessions.push(params); return { url: "https://checkout.stripe.test/session" }; } } },
  };
  await createBuyerSubscriptionCheckout({ userId: "buyer-1", input: { planCode: "PLUS", billingInterval: "MONTH", priceId: "price_attacker", amountCents: 1 }, successUrl: "https://pawnloop.test/success", cancelUrl: "https://pawnloop.test/cancel", requestId: "request-key-0003", prismaClient, stripeClient, stripeSecretKey: "sk_test_example", catalog });
  assert.deepEqual(sessions[0].line_items, [{ price: "price_plus_month", quantity: 1 }]);
});

test("buyer idempotency identity changes across every checkout scope", () => {
  const base = { userId: "buyer-1", planCode: "PLUS", billingInterval: "MONTH", incomingKey: "request-key-0001" };
  const values = [base, { ...base, userId: "buyer-2" }, { ...base, planCode: "ULTRA" }, { ...base, billingInterval: "YEAR" }, { ...base, incomingKey: "request-key-0002" }].map(deriveBuyerCheckoutIdempotencyKey);
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every((value) => !value.includes("request-key")));
  assert.throws(() => deriveBuyerCheckoutIdempotencyKey({ ...base, incomingKey: "short" }), { code: "BUYER_IDEMPOTENCY_KEY_INVALID" });
});

test("buyer checkout rejects an existing non-canceled paid Stripe subscription", async () => {
  let stripeCalled = false;
  const prismaClient = {
    user: { findUnique: async () => ({ id: "buyer-1", name: "Buyer", email: "buyer@example.test", stripeCustomerId: "cus_1" }) },
    buyerSubscription: { findUnique: async () => ({ plan: "PLUS", status: "ACTIVE", stripeSubscriptionId: "sub_existing" }) },
  };
  const stripeClient = {
    prices: { retrieve: async () => { stripeCalled = true; } },
    checkout: { sessions: { create: async () => { stripeCalled = true; } } },
  };

  await assert.rejects(
    createBuyerSubscriptionCheckout({ userId: "buyer-1", input: { planCode: "PLUS", billingInterval: "MONTH" }, successUrl: "https://pawnloop.test/success", cancelUrl: "https://pawnloop.test/cancel", requestId: "request-key-0004", prismaClient, stripeClient, stripeSecretKey: "sk_test_example", catalog }),
    { statusCode: 409, code: "BUYER_SUBSCRIPTION_ALREADY_EXISTS" },
  );
  assert.equal(stripeCalled, false);
});

test("buyer checkout permits replacement after INCOMPLETE_EXPIRED", async () => {
  let sessionCalls = 0;
  const prismaClient = {
    user: { findUnique: async () => ({ id: "buyer-1", name: "Buyer", email: "buyer@example.test", stripeCustomerId: "cus_1" }) },
    buyerSubscription: { findUnique: async () => ({ plan: "PLUS", status: "INCOMPLETE_EXPIRED", stripeSubscriptionId: "sub_expired" }) },
  };
  const stripeClient = {
    prices: { retrieve: async () => ({ id: "price_plus_month", unit_amount: 699, currency: "usd", type: "recurring", recurring: { interval: "month" }, active: true, livemode: false }) },
    checkout: { sessions: { create: async () => { sessionCalls += 1; return { id: "cs_replacement", url: "https://checkout.stripe.test/replacement" }; } } },
  };
  const result = await createBuyerSubscriptionCheckout({ userId: "buyer-1", input: { planCode: "PLUS", billingInterval: "MONTH" }, successUrl: "https://pawnloop.test/success", cancelUrl: "https://pawnloop.test/cancel", requestId: "request-key-replacement", prismaClient, stripeClient, stripeSecretKey: "sk_test_example", catalog });
  assert.equal(result.sessionId, "cs_replacement");
  assert.equal(sessionCalls, 1);
});

test("buyer checkout rejects every recoverable Stripe subscription status", async () => {
  for (const status of ["UNKNOWN", "ACTIVE", "TRIALING", "PAST_DUE", "INCOMPLETE", "PAUSED"]) {
    let stripeCalled = false;
    const prismaClient = {
      user: { findUnique: async () => ({ id: "buyer-1", name: "Buyer", email: "buyer@example.test", stripeCustomerId: "cus_1" }) },
      buyerSubscription: { findUnique: async () => ({ plan: "PLUS", status, stripeSubscriptionId: "sub_existing" }) },
    };
    const stripeClient = { prices: { retrieve: async () => { stripeCalled = true; } }, checkout: { sessions: { create: async () => { stripeCalled = true; } } } };
    await assert.rejects(
      createBuyerSubscriptionCheckout({ userId: "buyer-1", input: { planCode: "PLUS", billingInterval: "MONTH" }, successUrl: "https://pawnloop.test/success", cancelUrl: "https://pawnloop.test/cancel", requestId: `request-key-${status.toLowerCase()}`, prismaClient, stripeClient, stripeSecretKey: "sk_test_example", catalog }),
      { code: "BUYER_SUBSCRIPTION_ALREADY_EXISTS" },
    );
    assert.equal(stripeCalled, false, status);
  }
});

test("buyer checkout return URLs use the trusted frontend-origin policy", () => {
  const options = { allowedOrigins: ["https://app.pawnloop.test", "http://localhost:5177"] };
  assert.equal(validateStripeConnectReturnUrl("https://app.pawnloop.test/buyer/subscription?checkout=success", "successUrl", options), "https://app.pawnloop.test/buyer/subscription?checkout=success");
  for (const value of ["http://app.pawnloop.test/buyer/subscription", "https://user:pass@app.pawnloop.test/buyer/subscription", "https://app.pawnloop.test/buyer/subscription#secret", "https://evil.test/buyer/subscription", "not a url"]) {
    assert.throws(() => validateStripeConnectReturnUrl(value, "successUrl", options), { code: "INVALID_CONNECT_URL" });
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentMethodsService, safePaymentMethod } from "../src/services/paymentMethods.service.js";

function fixture({ subscriptionStatus = "ACTIVE", methods = null, customerId = "cus_owned" } = {}) {
  const user = { id: "user_1", name: "Buyer", email: "buyer@example.test", stripeCustomerId: customerId, buyerSubscription: { status: subscriptionStatus, stripeCustomerId: customerId } };
  const paymentMethods = methods || [{ id: "pm_owned", customer: "cus_owned", type: "card", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030, number: "4242424242424242", cvc: "123" } }];
  const updates = [];
  const consents = [];
  const stripe = {
    customers: { retrieve: async () => ({ id: "cus_owned", invoice_settings: { default_payment_method: "pm_owned" } }), create: async (...args) => { updates.push(["customer-create", ...args]); return { id: "cus_created" }; }, update: async (...args) => { updates.push(args); } },
    paymentMethods: { list: async ({ type }) => ({ data: type === "card" ? paymentMethods : [] }), retrieve: async (id) => paymentMethods.find((item) => item.id === id) || { id, customer: "cus_other" }, detach: async (id) => { updates.push(["detach", id]); } },
    checkout: { sessions: { create: async () => ({ id: "cs_setup", url: "https://checkout.stripe.com/setup" }), retrieve: async () => ({ id: "cs_setup", url: "https://checkout.stripe.com/setup" }) } },
    billingPortal: { sessions: { create: async (...args) => { updates.push(["portal", ...args]); return { url: "https://billing.stripe.com/session" }; } } },
  };
  const prisma = { user: { findUnique: async () => user, update: async ({ data }) => { updates.push(["user", data]); return user; } }, pawnShop: { findUnique: async () => null, update: async () => null }, paymentMethodConsent: { findUnique: async ({ where }) => consents.find((entry) => entry.idempotencyKey === where.idempotencyKey) || null, create: async ({ data }) => { const value = { id: `consent_${consents.length + 1}`, ...data }; consents.push(value); updates.push(["consent", value]); return value; }, update: async ({ where, data }) => { const value = consents.find((entry) => entry.id === where.id); Object.assign(value, data); updates.push(["consent-update", data]); return value; } } };
  return { service: createPaymentMethodsService({ prismaClient: prisma, stripeClient: stripe, resolveAccess: async () => ({ authorized: false }) }), updates };
}

test("safe payment method responses never expose raw card, CVC, bank, routing, or customer data", () => {
  const output = safePaymentMethod({ id: "pm_1", customer: "cus_secret", type: "card", card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2030, number: "4242424242424242", cvc: "123", routing_number: "110000000", account_number: "000123" } });
  assert.deepEqual(Object.keys(output).sort(), ["brand", "default", "expMonth", "expYear", "expired", "funding", "id", "last4", "status", "type"].sort());
  assert.equal(JSON.stringify(output).includes("4242424242424242"), false);
  assert.equal(JSON.stringify(output).includes("110000000"), false);
  assert.equal(JSON.stringify(output).includes("cus_secret"), false);
});

test("Setup checkout requires consent and binds the server-owned customer", async () => {
  const { service, updates } = fixture({ subscriptionStatus: "CANCELED" });
  await assert.rejects(() => service.createSetupSession({ user: { id: "user_1" }, successUrl: "https://app.test/success", cancelUrl: "https://app.test/cancel", consent: { accepted: false } }), /Consent/);
  const result = await service.createSetupSession({ user: { id: "user_1" }, successUrl: "https://app.test/success", cancelUrl: "https://app.test/cancel", consent: { accepted: true, termsVersion: "v1" }, requestId: "request_1" });
  assert.equal(result.sessionId, "cs_setup");
  assert.ok(updates.some(([kind, data]) => kind === "consent" && data.stripeCustomerId === "cus_owned"));
});

test("default and cross-customer ownership checks are enforced server-side", async () => {
  const { service, updates } = fixture({ subscriptionStatus: "CANCELED" });
  await service.setDefault({ user: { id: "user_1" }, paymentMethodId: "pm_owned" });
  assert.ok(updates.some((entry) => entry[0] === "cus_owned"));
  await assert.rejects(() => service.setDefault({ user: { id: "user_1" }, paymentMethodId: "pm_foreign" }), /not found/);
});

test("only active subscription method cannot be removed; replacement permits removal", async () => {
  const active = fixture();
  await assert.rejects(() => active.service.remove({ user: { id: "user_1" }, paymentMethodId: "pm_owned" }), (cause) => cause.code === "ACTIVE_SUBSCRIPTION_REQUIRES_METHOD");
  const replacement = fixture({ methods: [{ id: "pm_owned", customer: "cus_owned", type: "card", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } }, { id: "pm_new", customer: "cus_owned", type: "card", card: { brand: "mastercard", last4: "4444", exp_month: 12, exp_year: 2031 } }] });
  await replacement.service.remove({ user: { id: "user_1" }, paymentMethodId: "pm_owned" });
  assert.ok(replacement.updates.some((entry) => entry[0] === "detach"));
  const expiredReplacement = fixture({ methods: [{ id: "pm_owned", customer: "cus_owned", type: "card", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } }, { id: "pm_expired", customer: "cus_owned", type: "card", card: { brand: "mastercard", last4: "4444", exp_month: 1, exp_year: 2020 } }] });
  await assert.rejects(() => expiredReplacement.service.remove({ user: { id: "user_1" }, paymentMethodId: "pm_owned" }), (cause) => cause.code === "ACTIVE_SUBSCRIPTION_REQUIRES_METHOD");
});

test("billing portal creates a missing Stripe customer before opening", async () => {
  const { service, updates } = fixture({ customerId: null });
  const result = await service.portal({ user: { id: "user_1" }, returnUrl: "https://app.example.test/account/payment-methods" });

  assert.equal(result.url, "https://billing.stripe.com/session");
  assert.ok(updates.some(([kind, params]) => kind === "customer-create" && params.metadata.pawnloopUserId === "user_1"));
  assert.ok(updates.some(([kind, data]) => kind === "user" && data.stripeCustomerId === "cus_created"));
  assert.ok(updates.some(([kind, params]) => kind === "portal" && params.customer === "cus_created" && params.return_url === "https://app.example.test/account/payment-methods"));
});

test("shop billing access rejects non-owner and never trusts a supplied customer id", async () => {
  const { service } = fixture();
  await assert.rejects(() => service.listMethods({ user: { id: "user_1", role: "OWNER" }, shopId: "shop_other", stripeCustomerId: "cus_attacker" }), (cause) => cause.statusCode === 403);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSettlementPaymentIntentIdempotencyKey,
  createOrReuseLockedSettlementPaymentIntent,
  settlementPaymentIntentErrorResponse,
  settlementPaymentIntentResponse,
} from "../src/controllers/stripe.controller.js";

function settlement(overrides = {}) {
  return {
    id: "settlement-checkout-test",
    auctionId: "auction-checkout-test",
    offerId: null,
    winnerUserId: "buyer-checkout-test",
    finalPrice: 25,
    status: "PENDING",
    stripePaymentIntent: null,
    ...overrides,
  };
}

function transactionFixture() {
  const updates = [];
  const audits = [];
  return {
    updates,
    audits,
    tx: {
      settlement: {
        update: async (args) => {
          updates.push(args);
          return { id: args.where.id, ...args.data };
        },
      },
      superAdminAuditLog: {
        create: async ({ data }) => {
          audits.push(data);
          return data;
        },
      },
    },
  };
}

function intent(id, status, clientSecret = `${id}_secret`) {
  return { id, status, client_secret: clientSecret, amount: 2500, currency: "usd" };
}

test("new PaymentIntent returns its client secret without auditing it", async () => {
  const fixture = transactionFixture();
  const created = intent("pi_new", "requires_payment_method", "secret_new");
  const result = await createOrReuseLockedSettlementPaymentIntent({
    tx: fixture.tx,
    stripe: { paymentIntents: { create: async () => created, retrieve: async () => null } },
    settlement: settlement(),
    actor: { id: "buyer-checkout-test", role: "CONSUMER" },
  });
  const response = settlementPaymentIntentResponse(result);
  assert.equal(response.clientSecret, "secret_new");
  assert.equal(response.reused, false);
  assert.equal(fixture.updates[0].data.stripePaymentIntent, "pi_new");
  assert.doesNotMatch(JSON.stringify(fixture.audits), /secret_new|client.?secret/i);
});

test("reusable pending PaymentIntent is not duplicated and returns its client secret", async () => {
  const fixture = transactionFixture();
  let creates = 0;
  const existing = intent("pi_pending", "requires_action", "secret_pending");
  const result = await createOrReuseLockedSettlementPaymentIntent({
    tx: fixture.tx,
    stripe: {
      paymentIntents: {
        retrieve: async () => existing,
        create: async () => { creates += 1; return intent("pi_wrong", "requires_payment_method"); },
      },
    },
    settlement: settlement({ stripePaymentIntent: existing.id }),
  });
  assert.equal(settlementPaymentIntentResponse(result).clientSecret, "secret_pending");
  assert.equal(result.reused, true);
  assert.equal(creates, 0);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.audits.length, 0);
});

test("canceled PaymentIntent is replaced, persisted, and returns the replacement secret", async () => {
  const fixture = transactionFixture();
  const replacement = intent("pi_replacement", "requires_payment_method", "secret_replacement");
  let createOptions;
  const result = await createOrReuseLockedSettlementPaymentIntent({
    tx: fixture.tx,
    stripe: {
      paymentIntents: {
        retrieve: async () => intent("pi_canceled", "canceled"),
        create: async (_params, options) => { createOptions = options; return replacement; },
      },
    },
    settlement: settlement({ stripePaymentIntent: "pi_canceled" }),
  });
  assert.equal(result.reused, false);
  assert.equal(settlementPaymentIntentResponse(result).clientSecret, "secret_replacement");
  assert.equal(fixture.updates[0].data.stripePaymentIntent, replacement.id);
  assert.equal(
    createOptions.idempotencyKey,
    buildSettlementPaymentIntentIdempotencyKey("settlement-checkout-test", "pi_canceled"),
  );
  assert.notEqual(
    createOptions.idempotencyKey,
    buildSettlementPaymentIntentIdempotencyKey("settlement-checkout-test", "pi_other_canceled"),
  );
  assert.doesNotMatch(JSON.stringify(fixture.audits), /secret_replacement|client.?secret/i);
});

test("retries of the same canceled-intent replacement converge on one provider object", async () => {
  const providerObjects = new Map();
  const keys = [];
  const stripe = {
    paymentIntents: {
      retrieve: async () => intent("pi_canceled_retry", "canceled"),
      create: async (_params, options) => {
        keys.push(options.idempotencyKey);
        if (!providerObjects.has(options.idempotencyKey)) {
          providerObjects.set(options.idempotencyKey, intent("pi_retry_replacement", "requires_payment_method"));
        }
        return providerObjects.get(options.idempotencyKey);
      },
    },
  };
  const first = transactionFixture();
  const second = transactionFixture();
  const args = { stripe, settlement: settlement({ stripePaymentIntent: "pi_canceled_retry" }) };
  const firstResult = await createOrReuseLockedSettlementPaymentIntent({ tx: first.tx, ...args });
  const retryResult = await createOrReuseLockedSettlementPaymentIntent({ tx: second.tx, ...args });
  const persisted = transactionFixture();
  stripe.paymentIntents.retrieve = async (id) => (
    id === "pi_retry_replacement"
      ? intent(id, "requires_payment_method")
      : intent(id, "canceled")
  );
  const persistedRetryResult = await createOrReuseLockedSettlementPaymentIntent({
    tx: persisted.tx,
    stripe,
    settlement: settlement({ stripePaymentIntent: firstResult.paymentIntent.id }),
  });
  assert.equal(firstResult.paymentIntent.id, retryResult.paymentIntent.id);
  assert.equal(firstResult.paymentIntent.id, persistedRetryResult.paymentIntent.id);
  assert.equal(providerObjects.size, 1);
  assert.equal(new Set(keys).size, 1);
});

test("succeeded PaymentIntent reconciles once and never creates another payment opportunity", async () => {
  const fixture = transactionFixture();
  let creates = 0;
  let reconciliations = 0;
  const succeeded = intent("pi_succeeded", "succeeded", "secret_succeeded");
  const result = await createOrReuseLockedSettlementPaymentIntent({
    tx: fixture.tx,
    stripe: {
      paymentIntents: {
        retrieve: async () => succeeded,
        create: async () => { creates += 1; return intent("pi_wrong", "requires_payment_method"); },
      },
    },
    settlement: settlement({ stripePaymentIntent: succeeded.id }),
    reconcileSucceeded: async () => { reconciliations += 1; },
  });
  assert.equal(result.finalized, true);
  assert.equal(result.reused, true);
  assert.equal(creates, 0);
  assert.equal(reconciliations, 1);
  assert.equal(settlementPaymentIntentResponse(result).settlementStatus, "CHARGED");
});

test("already-charged checkout preserves the existing 400 response contract", async () => {
  await assert.rejects(
    createOrReuseLockedSettlementPaymentIntent({
      tx: transactionFixture().tx,
      stripe: { paymentIntents: {} },
      settlement: settlement({ status: "CHARGED" }),
    }),
    (error) => error.statusCode === 400 && error.message === "Settlement already charged",
  );
});

test("client secrets cannot enter audit metadata or surfaced persistence errors", async () => {
  const fixture = transactionFixture();
  fixture.tx.superAdminAuditLog.create = async () => { throw new Error("audit persistence failed"); };
  const secret = "should_never_escape_to_error_or_audit";
  await assert.rejects(
    createOrReuseLockedSettlementPaymentIntent({
      tx: fixture.tx,
      stripe: { paymentIntents: { create: async () => intent("pi_audit_failure", "requires_payment_method", secret) } },
      settlement: settlement(),
    }),
    (error) => error.message === "audit persistence failed" && !error.message.includes(secret),
  );
  assert.doesNotMatch(JSON.stringify(fixture.audits), new RegExp(secret));

  let statusCode;
  let body;
  settlementPaymentIntentErrorResponse({
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return value; },
  }, {
    type: "StripeInvalidRequestError",
    message: `provider rejected client_secret=${secret}`,
    details: { requestBody: { client_secret: secret } },
  });
  assert.equal(statusCode, 502);
  assert.deepEqual(body, { error: "Failed to create settlement payment intent" });
  assert.doesNotMatch(JSON.stringify(body), new RegExp(secret));
});

test("MyWinsPage checkout still requires the authorized clientSecret response field", async () => {
  const page = await readFile(new URL("../../../web/src/pages/MyWinsPage.tsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../../../web/src/services/settlements.ts", import.meta.url), "utf8");
  assert.match(page, /paymentIntent\.clientSecret/);
  assert.match(page, /Missing Stripe client secret/);
  assert.match(service, /clientSecret\?: string \| null/);
  assert.equal(
    settlementPaymentIntentResponse({
      paymentIntent: intent("pi_contract", "requires_payment_method", "secret_contract"),
      reused: false,
      finalized: false,
    }).clientSecret,
    "secret_contract",
  );
});

test("superseded failure webhooks no-op while mismatched success remains strict", async () => {
  const controller = await readFile(new URL("../src/controllers/stripe.controller.js", import.meta.url), "utf8");
  const succeededCase = controller.split('case "payment_intent.succeeded"')[1]
    .split('case "payment_intent.payment_failed"')[0];
  const failedCase = controller.split('case "payment_intent.payment_failed"')[1]
    .split("default:")[0];
  assert.match(succeededCase, /throw new SettlementTransitionError\("Stripe PaymentIntent does not match settlement\./);
  assert.match(failedCase, /stripePaymentIntent !== String\(pi\.id\)[\s\S]*return false/);
  assert.doesNotMatch(failedCase, /PAYMENT_INTENT_MISMATCH/);
});

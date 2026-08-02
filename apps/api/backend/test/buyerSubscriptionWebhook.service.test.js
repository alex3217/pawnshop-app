import assert from "node:assert/strict";
import test from "node:test";
import { syncBuyerSubscriptionEvent } from "../src/services/buyerSubscriptionWebhook.service.js";

function subscription(overrides = {}) {
  return { id: "buyer-sub-1", userId: "buyer-1", plan: "PLUS", status: "ACTIVE", billingInterval: "MONTH", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, stripeCustomerId: "cus_buyer", stripeSubscriptionId: "sub_buyer", stripePriceId: "price_old", stripeLatestInvoiceId: null, stripeEventCreatedAt: null, stripeEventId: null, stripeEventType: null, ...overrides };
}

function client(record) {
  let current = record;
  const audits = new Map();
  return { buyerSubscription: {
    findUnique: async ({ where }) => where.stripeSubscriptionId === current.stripeSubscriptionId || where.userId === current.userId ? current : null,
    update: async ({ data }) => (current = { ...current, ...data }),
    create: async ({ data }) => (current = { ...subscription(), ...data }),
  }, buyerSubscriptionEvent: {
    findUnique: async ({ where }) => audits.get(where.stripeEventId) || null,
    create: async ({ data }) => { const row = { id: `audit-${audits.size + 1}`, ...data }; audits.set(data.stripeEventId, row); return row; },
  } };
}

function event(id, created, status = "active") {
  return { id, created, type: "customer.subscription.updated", data: { object: { id: "sub_buyer", customer: "cus_buyer", status, current_period_start: 100, current_period_end: 200, cancel_at_period_end: false, metadata: { billingProfile: "BUYER", pawnloopUserId: "buyer-1", planCode: "PREMIUM" }, items: { data: [{ price: { id: "price_new", recurring: { interval: "year" } } }] } } } };
}

test("buyer webhook updates only a matched buyer subscription", async () => {
  const result = await syncBuyerSubscriptionEvent({ event: event("evt_new", 200), prismaClient: client(subscription()) });
  assert.equal(result.handled, true); assert.equal(result.applied, true);
  assert.equal(result.subscription.plan, "PREMIUM"); assert.equal(result.subscription.billingInterval, "YEAR");
  assert.equal(result.audit.reasonCode, "APPLIED");
});

test("buyer subscription.created creates the first trusted buyer record", async () => {
  const prismaClient = client(subscription({ userId: "another", stripeSubscriptionId: "another-sub" }));
  const result = await syncBuyerSubscriptionEvent({ event: event("evt_create", 200), prismaClient });
  assert.equal(result.applied, true); assert.equal(result.subscription.userId, "buyer-1");
  assert.equal(result.subscription.stripeSubscriptionId, "sub_buyer");
});

test("buyer webhook ignores duplicate and older events", async () => {
  const existing = subscription({ stripeEventCreatedAt: new Date(300000), stripeEventId: "evt_latest", stripeEventType: "customer.subscription.updated" });
  const old = await syncBuyerSubscriptionEvent({ event: event("evt_old", 200, "past_due"), prismaClient: client(existing) });
  assert.equal(old.handled, true); assert.equal(old.applied, false);
  assert.equal(old.audit.reasonCode, "OUT_OF_ORDER");
  const duplicate = await syncBuyerSubscriptionEvent({ event: event("evt_latest", 300), prismaClient: client(existing) });
  assert.equal(duplicate.duplicate, true);
});

test("seller metadata cannot create or update a buyer subscription", async () => {
  const sellerEvent = event("evt_seller", 200);
  sellerEvent.data.object.id = "sub_seller";
  sellerEvent.data.object.metadata = { billingProfile: "SELLER", pawnloopUserId: "buyer-1", planCode: "PREMIUM" };
  const result = await syncBuyerSubscriptionEvent({ event: sellerEvent, prismaClient: client(subscription()) });
  assert.deepEqual(result, { handled: false, applied: false });
});

test("duplicate buyer events reuse one immutable audit row", async () => {
  const prismaClient = client(subscription()); const stripeEvent = event("evt_duplicate", 200);
  const first = await syncBuyerSubscriptionEvent({ event: stripeEvent, prismaClient });
  const second = await syncBuyerSubscriptionEvent({ event: stripeEvent, prismaClient });
  assert.equal(first.audit.id, second.audit.id); assert.equal(second.duplicate, true);
});

test("buyer cancellation, past due, and resume states are audited", async () => {
  const prismaClient = client(subscription());
  const failed = event("evt_failed", 200); failed.type = "invoice.payment_failed"; failed.data.object = { id: "in_1", customer: "cus_buyer", subscription: "sub_buyer", parent: { subscription_details: { metadata: { billingProfile: "BUYER", pawnloopUserId: "buyer-1", planCode: "PLUS" } } }, lines: { data: [] } };
  assert.equal((await syncBuyerSubscriptionEvent({ event: failed, prismaClient })).subscription.status, "PAST_DUE");
  const canceled = event("evt_canceled", 300, "canceled"); canceled.type = "customer.subscription.deleted";
  assert.equal((await syncBuyerSubscriptionEvent({ event: canceled, prismaClient })).subscription.status, "CANCELED");
  const resumed = event("evt_resumed", 400, "active");
  const result = await syncBuyerSubscriptionEvent({ event: resumed, prismaClient });
  assert.equal(result.subscription.status, "ACTIVE"); assert.equal(result.audit.reasonCode, "APPLIED");
});

test("same-second cancellation precedence ignores a later lower-precedence invoice", async () => {
  const prismaClient = client(subscription());
  const canceled = event("evt_cancel", 500, "canceled"); canceled.type = "customer.subscription.deleted";
  await syncBuyerSubscriptionEvent({ event: canceled, prismaClient });
  const paid = event("evt_paid", 500); paid.type = "invoice.paid"; paid.data.object = { id: "in_paid", customer: "cus_buyer", subscription: "sub_buyer", parent: { subscription_details: { metadata: { billingProfile: "BUYER", pawnloopUserId: "buyer-1", planCode: "PLUS" } } }, lines: { data: [] } };
  const result = await syncBuyerSubscriptionEvent({ event: paid, prismaClient });
  assert.equal(result.applied, false); assert.equal(result.audit.reasonCode, "OUT_OF_ORDER");
});

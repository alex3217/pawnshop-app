import assert from "node:assert/strict";
import test from "node:test";
import { setAuthenticatedBuyerStripeCancellation } from "../src/services/buyerSelfServiceSubscription.service.js";

test("cancellation and resume use only the authenticated buyer stored Stripe subscription", async () => {
  const queries = []; const updates = [];
  const prismaClient = { buyerSubscription: { findUnique: async ({ where }) => { queries.push(where); return { userId: where.userId, stripeSubscriptionId: `sub_${where.userId}` }; } } };
  const stripeClient = { subscriptions: { update: async (id, input) => { updates.push({ id, input }); return { cancel_at_period_end: input.cancel_at_period_end }; } } };
  await setAuthenticatedBuyerStripeCancellation({ userId: "buyer-1", cancelAtPeriodEnd: true, prismaClient, stripeClient });
  await setAuthenticatedBuyerStripeCancellation({ userId: "buyer-1", cancelAtPeriodEnd: false, prismaClient, stripeClient });
  assert.deepEqual(queries, [{ userId: "buyer-1" }, { userId: "buyer-1" }]);
  assert.deepEqual(updates, [{ id: "sub_buyer-1", input: { cancel_at_period_end: true } }, { id: "sub_buyer-1", input: { cancel_at_period_end: false } }]);
  assert.equal("pawnShop" in prismaClient, false);
});

test("a buyer without a stored Stripe subscription cannot mutate local state", async () => {
  const prismaClient = { buyerSubscription: { findUnique: async () => null } };
  await assert.rejects(() => setAuthenticatedBuyerStripeCancellation({ userId: "buyer-1", cancelAtPeriodEnd: true, prismaClient, stripeClient: {} }), /No Stripe-backed buyer subscription/);
});

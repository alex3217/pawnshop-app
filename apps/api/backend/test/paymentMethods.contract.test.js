import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("payment method and portal routes require authenticated buyer/owner roles", async () => {
  const source = await readFile(new URL("../src/routes/stripe.routes.js", import.meta.url), "utf8");
  for (const route of ["/payment-methods", "/payment-methods/setup-session", "/payment-methods/:id/default", "/payment-methods/:id", "/billing-portal"]) {
    const line = source.split("\n").find((entry) => entry.includes(`\"${route}\"`));
    assert.ok(line || source.includes(`\"${route}\"`), `${route} route missing`);
  }
  assert.match(source, /authRequired, requireRole\("CONSUMER", "OWNER"\)/);
  assert.doesNotMatch(source, /payment-methods[^\n]*SUPER_ADMIN/);
});

test("signed Stripe webhook records setup consent without financial details", async () => {
  const source = await readFile(new URL("../src/controllers/stripe.controller.js", import.meta.url), "utf8");
  assert.match(source, /stripe\.webhooks\.constructEvent/);
  assert.match(source, /session\?\.mode === "setup"/);
  assert.match(source, /paymentMethodConsentId/);
  assert.match(source, /setupCustomerId !== customerId/);
  assert.match(source, /payment method ownership verification failed/);
  assert.match(source, /already finalized by a different event/);
  assert.match(source, /updateMany/);
  assert.match(source, /stripeSetupIntentId/);
  assert.match(source, /stripeMandateId/);
  assert.doesNotMatch(source, /card_number|routing_number|account_number|\bcvc\b/i);
});

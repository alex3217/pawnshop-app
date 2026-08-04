import assert from "node:assert/strict";
import test from "node:test";

import {
  FULFILLMENT_TRANSITIONS,
  redactSettlementAuditMetadata,
  runLockedSettlementTransition,
  SETTLEMENT_TRANSITIONS,
} from "../src/services/settlementStateMachine.service.js";

test("defines every permitted and terminal settlement transition", () => {
  assert.deepEqual([...SETTLEMENT_TRANSITIONS.PENDING], ["CHARGED", "FAILED", "CANCELED"]);
  assert.deepEqual([...SETTLEMENT_TRANSITIONS.FAILED], ["CHARGED", "CANCELED"]);
  assert.deepEqual([...SETTLEMENT_TRANSITIONS.CHARGED], ["REFUNDED", "DISPUTED"]);
  assert.deepEqual([...SETTLEMENT_TRANSITIONS.DISPUTED], ["CHARGED", "REFUNDED"]);
  assert.equal(SETTLEMENT_TRANSITIONS.CANCELED.size, 0);
  assert.equal(SETTLEMENT_TRANSITIONS.REFUNDED.size, 0);
});

test("a superseded webhook can be acknowledged without mutation or audit", async () => {
  let updates = 0;
  let audits = 0;
  const current = { id: "settlement-stale-webhook", status: "PENDING" };
  const result = await runLockedSettlementTransition({
    tx: {
      settlement: { update: async () => { updates += 1; } },
      superAdminAuditLog: { create: async () => { audits += 1; } },
    },
    current,
    toStatus: "FAILED",
    action: "SETTLEMENT_PAYMENT_FAILED",
    validateCurrent: () => false,
  });
  assert.equal(result.transitioned, false);
  assert.equal(result.settlement, current);
  assert.equal(updates, 0);
  assert.equal(audits, 0);
});

test("defines ordered fulfillment transitions without skips or reversals", () => {
  assert.deepEqual([...FULFILLMENT_TRANSITIONS.PAYMENT_PENDING], ["READY_FOR_PICKUP", "CANCELED"]);
  assert.deepEqual([...FULFILLMENT_TRANSITIONS.READY_FOR_PICKUP], ["PICKED_UP", "SHIPPED", "CANCELED"]);
  assert.deepEqual([...FULFILLMENT_TRANSITIONS.PICKED_UP], ["COMPLETED"]);
  assert.deepEqual([...FULFILLMENT_TRANSITIONS.SHIPPED], ["COMPLETED"]);
  assert.equal(FULFILLMENT_TRANSITIONS.COMPLETED.size, 0);
  assert.equal(FULFILLMENT_TRANSITIONS.CANCELED.size, 0);
});

test("deeply redacts payment data while retaining operational metadata", () => {
  const redacted = redactSettlementAuditMetadata({
    stripeEventId: "evt_safe",
    nested: {
      client_secret: "secret",
      paymentMethodToken: "token",
      array: [{ Authorization: "Bearer secret", amountCents: 100 }],
    },
    requestBody: { unrestricted: true },
  });
  assert.equal(redacted.stripeEventId, "evt_safe");
  assert.equal(redacted.nested.client_secret, "[REDACTED]");
  assert.equal(redacted.nested.paymentMethodToken, "[REDACTED]");
  assert.equal(redacted.nested.array[0].Authorization, "[REDACTED]");
  assert.equal(redacted.nested.array[0].amountCents, 100);
  assert.equal(redacted.requestBody, "[REDACTED]");
});

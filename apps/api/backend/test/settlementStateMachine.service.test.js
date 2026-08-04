import assert from "node:assert/strict";
import test from "node:test";

import {
  FULFILLMENT_TRANSITIONS,
  redactSettlementAuditMetadata,
  runFulfillmentTransition,
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

test("fulfillment persists the note but never copies its contents into audit metadata", async () => {
  const note = [
    "client_secret=pi_secret_value",
    "token=tok_value",
    "password=pw_value",
    "credential=cred_value",
    "authorization=Bearer auth_value",
    "cookie=session_value",
    "requestBody=raw_body_value",
    "paymentMethod=pm_value",
  ].join("; ");
  const audits = [];
  const updates = [];
  const current = {
    id: "settlement-note-redaction-unit",
    status: "CHARGED",
    fulfillmentStatus: "PAYMENT_PENDING",
    stripePaymentIntent: "pi_note_redaction_unit",
    chargedAt: new Date(),
  };
  const prismaClient = {
    $transaction: async (callback) => callback({
      $queryRaw: async () => [],
      settlement: {
        findUnique: async () => current,
        update: async ({ data }) => {
          updates.push(data);
          return { ...current, ...data };
        },
      },
      superAdminAuditLog: {
        create: async ({ data }) => {
          audits.push(data);
          return data;
        },
      },
    }),
  };

  const result = await runFulfillmentTransition({
    settlementId: current.id,
    toStatus: "READY_FOR_PICKUP",
    note,
    actor: { id: "owner-note-redaction", role: "OWNER" },
    prismaClient,
  });

  assert.equal(result.fulfillmentNote, note);
  assert.equal(updates[0].fulfillmentNote, note);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "SETTLEMENT_FULFILLMENT_TRANSITION");
  assert.equal(audits[0].metadata.from, "PAYMENT_PENDING");
  assert.equal(audits[0].metadata.to, "READY_FOR_PICKUP");
  assert.equal(audits[0].metadata.noteProvided, true);
  assert.equal(Object.hasOwn(audits[0].metadata, "note"), false);
  assert.doesNotMatch(JSON.stringify(audits[0].metadata), /pi_secret_value|tok_value|pw_value|cred_value|auth_value|session_value|raw_body_value|pm_value/);
});

test("ordinary fulfillment notes are not copied into audit metadata", async () => {
  const note = "Customer will collect the item at the front desk.";
  let audit;
  const current = {
    id: "settlement-ordinary-note-unit",
    status: "CHARGED",
    fulfillmentStatus: "PAYMENT_PENDING",
    stripePaymentIntent: "pi_ordinary_note_unit",
    chargedAt: new Date(),
  };
  await runFulfillmentTransition({
    settlementId: current.id,
    toStatus: "READY_FOR_PICKUP",
    note,
    prismaClient: {
      $transaction: async (callback) => callback({
        $queryRaw: async () => [],
        settlement: {
          findUnique: async () => current,
          update: async ({ data }) => ({ ...current, ...data }),
        },
        superAdminAuditLog: { create: async ({ data }) => { audit = data; return data; } },
      }),
    },
  });
  assert.doesNotMatch(JSON.stringify(audit.metadata), new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.deepEqual(audit.metadata, {
    from: "PAYMENT_PENDING",
    to: "READY_FOR_PICKUP",
    noteProvided: true,
  });
});

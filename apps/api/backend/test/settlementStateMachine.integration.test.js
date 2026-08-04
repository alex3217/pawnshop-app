import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { prisma } from "../src/lib/prisma.js";
import {
  runFulfillmentTransition,
  runSettlementTransition,
  SettlementTransitionError,
} from "../src/services/settlementStateMachine.service.js";

const PREFIX = "settlement-safety-it-";
const BUYER_ID = `${PREFIX}buyer`;

async function createSettlement(suffix, data = {}) {
  return prisma.settlement.create({
    data: {
      id: `${PREFIX}${suffix}`,
      winnerUserId: BUYER_ID,
      finalPrice: 25,
      currency: "USD",
      status: "PENDING",
      ...data,
    },
  });
}

async function cleanup() {
  await prisma.superAdminAuditLog.deleteMany({ where: { targetId: { startsWith: PREFIX } } });
  await prisma.settlement.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

before(async () => {
  await prisma.user.upsert({
    where: { id: BUYER_ID },
    update: {},
    create: { id: BUYER_ID, name: "Settlement Safety Buyer", email: `${PREFIX}buyer@pawnloop.test`, password: "not-a-real-login", role: "CONSUMER" },
  });
});

beforeEach(cleanup);
after(async () => {
  await cleanup();
  await prisma.user.deleteMany({ where: { id: BUYER_ID } });
  await prisma.$disconnect();
});

test("real PostgreSQL row lock permits exactly one concurrent destructive transition", async () => {
  const settlement = await createSettlement("race");
  const results = await Promise.allSettled([
    runSettlementTransition({ settlementId: settlement.id, toStatus: "FAILED", expectedStatus: "PENDING", action: "TEST_FAILED" }),
    runSettlementTransition({ settlementId: settlement.id, toStatus: "CANCELED", expectedStatus: "PENDING", action: "TEST_CANCELED" }),
  ]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(results.filter((row) => row.status === "rejected").length, 1);
  assert.equal((await prisma.superAdminAuditLog.count({ where: { targetId: settlement.id } })), 1);
});

test("rejects stale and prohibited transitions without mutation or audit", async () => {
  const settlement = await createSettlement("stale");
  await assert.rejects(
    runSettlementTransition({ settlementId: settlement.id, toStatus: "CHARGED", expectedStatus: "FAILED", action: "TEST" }),
    (error) => error instanceof SettlementTransitionError && error.code === "STALE_SETTLEMENT_STATE",
  );
  await assert.rejects(
    runSettlementTransition({ settlementId: settlement.id, toStatus: "REFUNDED", action: "TEST" }),
    /cannot move from PENDING to REFUNDED/,
  );
  assert.equal((await prisma.settlement.findUnique({ where: { id: settlement.id } })).status, "PENDING");
  assert.equal(await prisma.superAdminAuditLog.count({ where: { targetId: settlement.id } }), 0);
});

test("webhook-style replay is a no-op with exactly one audit", async () => {
  const settlement = await createSettlement("replay", { stripePaymentIntent: "pi_settlement_safety_replay" });
  const args = { settlementId: settlement.id, toStatus: "FAILED", action: "SETTLEMENT_PAYMENT_FAILED", metadata: { stripeEventId: "evt_replay" } };
  assert.equal((await runSettlementTransition(args)).transitioned, true);
  assert.equal((await runSettlementTransition(args)).transitioned, false);
  assert.equal(await prisma.superAdminAuditLog.count({ where: { targetId: settlement.id } }), 1);
});

test("audit persistence failure rolls back the protected mutation", async () => {
  const settlement = await createSettlement("rollback");
  const failingClient = {
    $transaction: (callback, options) => prisma.$transaction(async (tx) => callback({
      ...tx,
      $queryRaw: tx.$queryRaw.bind(tx),
      settlement: tx.settlement,
      superAdminAuditLog: { create: async () => { throw new Error("audit unavailable"); } },
    }), options),
  };
  await assert.rejects(
    runSettlementTransition({ settlementId: settlement.id, toStatus: "FAILED", action: "TEST", prismaClient: failingClient }),
    /audit unavailable/,
  );
  assert.equal((await prisma.settlement.findUnique({ where: { id: settlement.id } })).status, "PENDING");
});

test("requires confirmed payment and enforces ordered fulfillment", async () => {
  const pending = await createSettlement("pending-fulfillment");
  await assert.rejects(
    runFulfillmentTransition({ settlementId: pending.id, toStatus: "READY_FOR_PICKUP" }),
    (error) => error.code === "PAYMENT_NOT_CONFIRMED",
  );
  const charged = await createSettlement("charged-fulfillment", {
    status: "CHARGED", stripePaymentIntent: "pi_settlement_safety_charged", chargedAt: new Date(),
  });
  await assert.rejects(
    runFulfillmentTransition({ settlementId: charged.id, toStatus: "COMPLETED" }),
    /cannot move from PAYMENT_PENDING to COMPLETED/,
  );
  await runFulfillmentTransition({ settlementId: charged.id, toStatus: "READY_FOR_PICKUP" });
  await runFulfillmentTransition({ settlementId: charged.id, toStatus: "PICKED_UP" });
  await runFulfillmentTransition({ settlementId: charged.id, toStatus: "COMPLETED" });
  assert.equal((await prisma.settlement.findUnique({ where: { id: charged.id } })).fulfillmentStatus, "COMPLETED");
  assert.equal(await prisma.superAdminAuditLog.count({ where: { targetId: charged.id } }), 3);
});

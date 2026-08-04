import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const SETTLEMENT_TRANSITIONS = Object.freeze({
  PENDING: new Set(["CHARGED", "FAILED", "CANCELED"]),
  FAILED: new Set(["CHARGED", "CANCELED"]),
  CHARGED: new Set(["REFUNDED", "DISPUTED"]),
  DISPUTED: new Set(["CHARGED", "REFUNDED"]),
  CANCELED: new Set(),
  REFUNDED: new Set(),
});

export const FULFILLMENT_TRANSITIONS = Object.freeze({
  PAYMENT_PENDING: new Set(["READY_FOR_PICKUP", "CANCELED"]),
  READY_FOR_PICKUP: new Set(["PICKED_UP", "SHIPPED", "CANCELED"]),
  PICKED_UP: new Set(["COMPLETED"]),
  SHIPPED: new Set(["COMPLETED"]),
  COMPLETED: new Set(),
  CANCELED: new Set(),
});

const SENSITIVE_PARTS = [
  "authorization", "clientsecret", "credential", "cookie", "cvc", "cvv",
  "password", "paymentmethod", "requestbody", "secret", "token",
];

function normalized(value) {
  return String(value || "").trim().toUpperCase();
}

function isSensitive(key) {
  const value = String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return SENSITIVE_PARTS.some((part) => value.includes(part));
}

export function redactSettlementAuditMetadata(value) {
  if (Array.isArray(value)) return value.map(redactSettlementAuditMetadata);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      isSensitive(key) ? "[REDACTED]" : redactSettlementAuditMetadata(child),
    ]));
  }
  return value ?? null;
}

export class SettlementTransitionError extends Error {
  constructor(message, statusCode = 409, code = "ILLEGAL_SETTLEMENT_TRANSITION") {
    super(message);
    this.name = "SettlementTransitionError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function lockSettlement(tx, settlementId) {
  await tx.$queryRaw`SELECT "id" FROM "Settlement" WHERE "id" = ${settlementId} FOR UPDATE`;
  const settlement = await tx.settlement.findUnique({ where: { id: settlementId } });
  if (!settlement) {
    throw new SettlementTransitionError("Settlement not found.", 404, "SETTLEMENT_NOT_FOUND");
  }
  return settlement;
}

function auditData({ actor, action, settlementId, from, to, metadata }) {
  return {
    actorId: actor?.id || null,
    actorEmail: actor?.email || null,
    actorRole: actor?.role || "SYSTEM",
    action,
    method: actor?.method || "SYSTEM",
    path: actor?.path || "settlement-state-machine",
    routeKey: actor?.routeKey || null,
    targetType: "SETTLEMENT",
    targetId: settlementId,
    statusCode: 200,
    success: true,
    requestId: actor?.requestId || null,
    ipAddress: actor?.ipAddress || null,
    userAgent: actor?.userAgent || null,
    metadata: redactSettlementAuditMetadata({ from, to, ...metadata }),
  };
}

export function settlementActorFromRequest(req) {
  return {
    id: String(req?.user?.sub || req?.user?.id || "") || null,
    email: String(req?.user?.email || "") || null,
    role: normalized(req?.user?.role) || "SYSTEM",
    method: String(req?.method || "SYSTEM").toUpperCase(),
    path: String(req?.originalUrl || req?.url || "settlement-state-machine"),
    routeKey: req?.route?.path ? `${String(req.method).toUpperCase()} ${req.route.path}` : null,
    requestId: String(req?.id || req?.requestId || req?.headers?.["x-request-id"] || "") || null,
    ipAddress: String(req?.ip || "") || null,
    userAgent: String(req?.headers?.["user-agent"] || "") || null,
  };
}

async function persistAudit(tx, data) {
  if (!tx.superAdminAuditLog?.create) throw new Error("Settlement audit persistence is unavailable.");
  return tx.superAdminAuditLog.create({ data });
}

export async function runSettlementTransition({
  settlementId,
  toStatus,
  expectedStatus,
  action,
  actor,
  metadata = {},
  data = {},
  sideEffect,
  validateCurrent,
  ignoreFromStatuses = [],
  prismaClient = prisma,
}) {
  return prismaClient.$transaction(async (tx) => {
    const current = await lockSettlement(tx, settlementId);
    return runLockedSettlementTransition({
      tx, current, toStatus, expectedStatus, action, actor, metadata, data,
      sideEffect, validateCurrent, ignoreFromStatuses,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function runLockedSettlementTransition({
  tx,
  current,
  toStatus,
  expectedStatus,
  action,
  actor,
  metadata = {},
  data = {},
  sideEffect,
  validateCurrent,
  ignoreFromStatuses = [],
}) {
  const settlementId = current.id;
  const target = normalized(toStatus);
  if (validateCurrent && await validateCurrent(current, tx) === false) {
    return { settlement: current, transitioned: false };
  }
  const from = normalized(current.status);
  if (expectedStatus && from !== normalized(expectedStatus)) {
    throw new SettlementTransitionError(
      `Settlement state is stale; expected ${normalized(expectedStatus)} but found ${from}.`,
      409,
      "STALE_SETTLEMENT_STATE",
    );
  }
  if (from === target) return { settlement: current, transitioned: false };
  if (ignoreFromStatuses.map(normalized).includes(from)) {
    return { settlement: current, transitioned: false };
  }
  if (!SETTLEMENT_TRANSITIONS[from]?.has(target)) {
    throw new SettlementTransitionError(`Settlement cannot move from ${from} to ${target}.`);
  }
  const settlement = await tx.settlement.update({
    where: { id: settlementId },
    data: { ...data, status: target },
  });
  if (sideEffect) await sideEffect(tx, settlement, current);
  await persistAudit(tx, auditData({ actor, action, settlementId, from, to: target, metadata }));
  return { settlement, transitioned: true };
}

export async function runFulfillmentTransition({
  settlementId,
  toStatus,
  expectedStatus,
  note,
  actor,
  prismaClient = prisma,
}) {
  const target = normalized(toStatus);
  return prismaClient.$transaction(async (tx) => {
    const current = await lockSettlement(tx, settlementId);
    if (normalized(current.status) !== "CHARGED" || !current.stripePaymentIntent || !current.chargedAt) {
      throw new SettlementTransitionError("Only charged settlements can be fulfilled.", 400, "PAYMENT_NOT_CONFIRMED");
    }
    const from = normalized(current.fulfillmentStatus);
    if (expectedStatus && from !== normalized(expectedStatus)) {
      throw new SettlementTransitionError(
        `Fulfillment state is stale; expected ${normalized(expectedStatus)} but found ${from}.`,
        409,
        "STALE_FULFILLMENT_STATE",
      );
    }
    if (from === target || !FULFILLMENT_TRANSITIONS[from]?.has(target)) {
      throw new SettlementTransitionError(`Fulfillment cannot move from ${from} to ${target}.`);
    }
    const fulfilled = ["PICKED_UP", "SHIPPED", "COMPLETED"].includes(target);
    const settlement = await tx.settlement.update({
      where: { id: settlementId },
      data: {
        fulfillmentStatus: target,
        ...(note !== undefined ? { fulfillmentNote: note } : {}),
        ...(fulfilled && !current.fulfilledAt ? { fulfilledAt: new Date() } : {}),
      },
    });
    await persistAudit(tx, auditData({
      actor,
      action: "SETTLEMENT_FULFILLMENT_TRANSITION",
      settlementId,
      from,
      to: target,
      metadata: { note },
    }));
    return settlement;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function withLockedSettlement({ settlementId, prismaClient = prisma, operation }) {
  return prismaClient.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, settlementId);
    return operation(tx, settlement);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function persistSettlementOperationAudit(tx, params) {
  return persistAudit(tx, auditData(params));
}

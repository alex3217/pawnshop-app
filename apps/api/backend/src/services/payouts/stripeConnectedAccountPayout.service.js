import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

function text(value) {
  return String(value ?? "").trim();
}

function required(value, name) {
  const result = text(value);
  if (!result) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    error.code = "INVALID_CONNECT_PAYOUT_EVENT";
    throw error;
  }
  return result;
}

function stripeDate(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function eventDate(value) {
  return stripeDate(value) || new Date(0);
}

function isUniqueError(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function statusRank(status) {
  switch (text(status).toLowerCase()) {
    case "paid":
    case "failed":
    case "canceled":
      return 3;
    case "in_transit":
      return 2;
    default:
      return 1;
  }
}

function shouldApplySnapshot(existing, incomingCreatedAt, incomingStatus) {
  if (!existing) return true;
  const existingStatus = text(existing.status).toLowerCase();
  const nextStatus = text(incomingStatus).toLowerCase();
  if (statusRank(existingStatus) === 3 && nextStatus !== existingStatus) return false;
  if (incomingCreatedAt > existing.lastStripeEventCreatedAt) return true;
  if (incomingCreatedAt < existing.lastStripeEventCreatedAt) return false;
  return statusRank(nextStatus) >= statusRank(existingStatus);
}

function payoutData({ payout, stripeAccountId, shopId, stripeEventId, stripeEventCreatedAt, eventType }) {
  const status = required(payout?.status, "payout.status").toLowerCase();
  const eventOccurredAt = eventDate(stripeEventCreatedAt);
  return {
    stripeAccountId,
    shopId,
    amountCents: Number(payout?.amount),
    currency: required(payout?.currency, "payout.currency").toUpperCase(),
    status,
    arrivalDate: stripeDate(payout?.arrival_date),
    failureCode: text(payout?.failure_code) || null,
    failureMessage: text(payout?.failure_message) || null,
    payoutMethod: text(payout?.method) || null,
    payoutType: text(payout?.type) || null,
    stripeCreatedAt: stripeDate(payout?.created),
    lastStripeEventId: stripeEventId,
    lastStripeEventCreatedAt: eventOccurredAt,
    ...(eventType === "payout.paid" || status === "paid" ? { paidAt: eventOccurredAt } : {}),
    ...(eventType === "payout.failed" || status === "failed" ? { failedAt: eventOccurredAt } : {}),
  };
}

export async function syncStripeConnectedAccountPayoutEvent({
  event,
  prismaClient = prisma,
} = {}) {
  const stripeEventId = required(event?.id, "event.id");
  const eventType = required(event?.type, "event.type");
  const stripeAccountId = required(event?.account, "event.account");
  const payout = event?.data?.object;
  const stripePayoutId = required(payout?.id, "payout.id");
  if (!Number.isSafeInteger(Number(payout?.amount)) || Number(payout.amount) < 0) {
    const error = new Error("payout.amount must be a non-negative integer");
    error.statusCode = 400;
    throw error;
  }

  try {
    return await prismaClient.$transaction(async (tx) => {
      const duplicate = await tx.stripeConnectedAccountPayoutEvent.findUnique({
        where: { stripeEventId },
      });
      if (duplicate) return { duplicate: true, applied: false };

      const shop = await tx.pawnShop.findUnique({
        where: { stripeConnectAccountId: stripeAccountId },
        select: { id: true },
      });
      const existing = await tx.stripeConnectedAccountPayout.findUnique({
        where: { stripePayoutId },
      });
      const incomingCreatedAt = eventDate(event?.created);
      const applied = shouldApplySnapshot(existing, incomingCreatedAt, payout?.status);
      let record = existing;

      if (!existing) {
        record = await tx.stripeConnectedAccountPayout.create({
          data: {
            stripePayoutId,
            ...payoutData({
              payout,
              stripeAccountId,
              shopId: shop?.id || null,
              stripeEventId,
              stripeEventCreatedAt: event?.created,
              eventType,
            }),
          },
        });
      } else if (applied) {
        record = await tx.stripeConnectedAccountPayout.update({
          where: { id: existing.id },
          data: payoutData({
            payout,
            stripeAccountId,
            shopId: shop?.id || existing.shopId || null,
            stripeEventId,
            stripeEventCreatedAt: event?.created,
            eventType,
          }),
        });
      }

      await tx.stripeConnectedAccountPayoutEvent.create({
        data: {
          stripeEventId,
          stripePayoutRecordId: record.id,
          eventType,
          stripeEventCreatedAt: incomingCreatedAt,
        },
      });
      return { duplicate: false, applied, payout: record, shopResolved: Boolean(shop) };
    });
  } catch (error) {
    if (isUniqueError(error)) return { duplicate: true, applied: false };
    throw error;
  }
}

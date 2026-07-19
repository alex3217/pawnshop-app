import { prisma } from "../lib/prisma.js";
import { toAmountCents } from "../lib/stripe.js";

const PAYABLE_STATUSES = [
  "PENDING",
  "PAYMENT_PROCESSING",
];

const PAID_STATUSES = new Set([
  "PAID",
  "FULFILLING",
  "COMPLETED",
]);

function httpError(
  message,
  statusCode = 500,
  code = undefined,
) {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (code) {
    error.code = code;
  }

  return error;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeCurrency(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function metadataObject(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  return {};
}

function normalizeTimestamp(value = new Date()) {
  const timestamp =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return new Date();
  }

  return timestamp;
}

function marketplaceTransactionIdFromIntent(
  paymentIntent,
) {
  return normalizeId(
    paymentIntent?.metadata
      ?.marketplaceTransactionId,
  );
}

function paymentIntentAmountCents(
  paymentIntent,
) {
  const amountReceived =
    Number(paymentIntent?.amount_received);

  const amount =
    Number(paymentIntent?.amount);

  const resolved =
    Number.isSafeInteger(amountReceived) &&
    amountReceived > 0
      ? amountReceived
      : amount;

  if (
    !Number.isSafeInteger(resolved) ||
    resolved <= 0
  ) {
    throw httpError(
      "Marketplace PaymentIntent amount is invalid",
      400,
      "INVALID_MARKETPLACE_PAYMENT_INTENT_AMOUNT",
    );
  }

  return resolved;
}

function buildPaymentMetadata(
  transactionMetadata,
  paymentPatch,
) {
  const metadata =
    metadataObject(transactionMetadata);

  const previousPayment =
    metadataObject(metadata.payment);

  return {
    ...metadata,
    payment: {
      ...previousPayment,
      ...paymentPatch,
    },
  };
}

async function loadMarketplaceTransaction({
  transactionId,
  prismaClient,
}) {
  return prismaClient
    .marketplaceTransaction
    .findUnique({
      where: {
        id: transactionId,
      },
      select: {
        id: true,
        listingId: true,
        buyerUserId: true,
        sellerUserId: true,
        status: true,
        totalAmount: true,
        currency: true,
        paymentIntentId: true,
        metadata: true,
        listing: {
          select: {
            id: true,
            itemId: true,
            status: true,
            quantity: true,
          },
        },
      },
    });
}

function assertPaymentIntentMatches({
  transaction,
  paymentIntent,
}) {
  if (!transaction) {
    throw httpError(
      "Marketplace transaction not found",
      404,
      "MARKETPLACE_TRANSACTION_NOT_FOUND",
    );
  }

  const paymentIntentId =
    normalizeId(paymentIntent?.id);

  if (!paymentIntentId) {
    throw httpError(
      "Marketplace PaymentIntent ID is required",
      400,
      "MARKETPLACE_PAYMENT_INTENT_ID_REQUIRED",
    );
  }

  const storedPaymentIntentId =
    normalizeId(transaction.paymentIntentId);

  if (
    !storedPaymentIntentId ||
    storedPaymentIntentId !== paymentIntentId
  ) {
    throw httpError(
      "Marketplace PaymentIntent does not match the transaction",
      409,
      "MARKETPLACE_PAYMENT_INTENT_MISMATCH",
    );
  }

  const transactionAmount =
    toAmountCents(transaction.totalAmount);

  const intentAmount =
    paymentIntentAmountCents(paymentIntent);

  if (
    !Number.isSafeInteger(transactionAmount) ||
    transactionAmount <= 0 ||
    transactionAmount !== intentAmount
  ) {
    throw httpError(
      "Marketplace PaymentIntent amount does not match the transaction",
      409,
      "MARKETPLACE_PAYMENT_AMOUNT_MISMATCH",
    );
  }

  const transactionCurrency =
    normalizeCurrency(transaction.currency);

  const intentCurrency =
    normalizeCurrency(paymentIntent?.currency);

  if (
    !transactionCurrency ||
    !intentCurrency ||
    transactionCurrency !== intentCurrency
  ) {
    throw httpError(
      "Marketplace PaymentIntent currency does not match the transaction",
      409,
      "MARKETPLACE_PAYMENT_CURRENCY_MISMATCH",
    );
  }

  return {
    paymentIntentId,
    amountCents: intentAmount,
    currency: intentCurrency,
  };
}

function assertTransactionCanReceivePaymentEvent(
  transaction,
) {
  if (
    PAID_STATUSES.has(transaction.status)
  ) {
    return;
  }

  if (
    !PAYABLE_STATUSES.includes(
      transaction.status,
    )
  ) {
    throw httpError(
      "Marketplace transaction cannot receive a payment event in its current state",
      409,
      "MARKETPLACE_PAYMENT_STATE_INVALID",
    );
  }
}

export async function finalizeMarketplacePaymentSucceeded({
  paymentIntent,
  prismaClient = prisma,
  processedAt = new Date(),
}) {
  const transactionId =
    marketplaceTransactionIdFromIntent(
      paymentIntent,
    );

  if (!transactionId) {
    return {
      handled: false,
      reason: "NOT_MARKETPLACE_PAYMENT",
    };
  }

  const transaction =
    await loadMarketplaceTransaction({
      transactionId,
      prismaClient,
    });

  const {
    paymentIntentId,
    amountCents,
    currency,
  } = assertPaymentIntentMatches({
    transaction,
    paymentIntent,
  });

  assertTransactionCanReceivePaymentEvent(
    transaction,
  );

  const processedTimestamp =
    normalizeTimestamp(processedAt);

  const alreadyPaid =
    PAID_STATUSES.has(transaction.status);

  const paymentMetadata =
    buildPaymentMetadata(
      transaction.metadata,
      {
        status: "succeeded",
        paymentIntentId,
        amountCents,
        currency,
        succeededAt:
          processedTimestamp.toISOString(),
        latestChargeId:
          normalizeId(
            paymentIntent?.latest_charge,
          ) || null,
      },
    );

  return prismaClient.$transaction(
    async (tx) => {
      let transactionUpdated = false;

      if (!alreadyPaid) {
        const updateResult =
          await tx
            .marketplaceTransaction
            .updateMany({
              where: {
                id: transaction.id,
                paymentIntentId,
                status: {
                  in: PAYABLE_STATUSES,
                },
              },
              data: {
                status: "PAID",
                metadata: paymentMetadata,
              },
            });

        if (updateResult.count !== 1) {
          throw httpError(
            "Marketplace transaction changed before payment could be finalized",
            409,
            "MARKETPLACE_PAYMENT_FINALIZATION_RACE",
          );
        }

        transactionUpdated = true;
      }

      const listing =
        transaction.listing;

      if (!listing) {
        throw httpError(
          "Marketplace listing is unavailable",
          409,
          "MARKETPLACE_PAYMENT_LISTING_MISSING",
        );
      }

      let listingSold = false;
      let itemMarkedSold = false;

      if (Number(listing.quantity) === 0) {
        if (
          ![
            "RESERVED",
            "SOLD",
          ].includes(listing.status)
        ) {
          throw httpError(
            "Marketplace listing is not in a finalizable state",
            409,
            "MARKETPLACE_PAYMENT_LISTING_STATE_INVALID",
          );
        }

        const listingResult =
          await tx.marketplaceListing.updateMany({
            where: {
              id: listing.id,
              quantity: 0,
              status: {
                in: [
                  "RESERVED",
                  "SOLD",
                ],
              },
            },
            data: {
              status: "SOLD",
            },
          });

        if (listingResult.count !== 1) {
          throw httpError(
            "Marketplace listing changed before payment could be finalized",
            409,
            "MARKETPLACE_PAYMENT_LISTING_RACE",
          );
        }

        listingSold = true;

        if (listing.itemId) {
          const itemResult =
            await tx.item.updateMany({
              where: {
                id: listing.itemId,
              },
              data: {
                status: "SOLD",
              },
            });

          if (itemResult.count !== 1) {
            throw httpError(
              "Linked inventory could not be finalized",
              409,
              "MARKETPLACE_PAYMENT_ITEM_FINALIZATION_FAILED",
            );
          }

          itemMarkedSold = true;
        }
      }

      return {
        handled: true,
        transactionId: transaction.id,
        paymentIntentId,
        transactionStatus: "PAID",
        transactionUpdated,
        idempotent: alreadyPaid,
        listingSold,
        itemMarkedSold,
      };
    },
  );
}

export async function recordMarketplacePaymentFailed({
  paymentIntent,
  prismaClient = prisma,
  processedAt = new Date(),
}) {
  const transactionId =
    marketplaceTransactionIdFromIntent(
      paymentIntent,
    );

  if (!transactionId) {
    return {
      handled: false,
      reason: "NOT_MARKETPLACE_PAYMENT",
    };
  }

  const transaction =
    await loadMarketplaceTransaction({
      transactionId,
      prismaClient,
    });

  const {
    paymentIntentId,
    amountCents,
    currency,
  } = assertPaymentIntentMatches({
    transaction,
    paymentIntent,
  });

  assertTransactionCanReceivePaymentEvent(
    transaction,
  );

  if (
    PAID_STATUSES.has(transaction.status)
  ) {
    return {
      handled: true,
      transactionId: transaction.id,
      paymentIntentId,
      transactionStatus:
        transaction.status,
      idempotent: true,
      reservationRetained: true,
    };
  }

  const processedTimestamp =
    normalizeTimestamp(processedAt);

  const lastPaymentError =
    paymentIntent?.last_payment_error || {};

  const paymentMetadata =
    buildPaymentMetadata(
      transaction.metadata,
      {
        status: "payment_failed",
        paymentIntentId,
        amountCents,
        currency,
        failedAt:
          processedTimestamp.toISOString(),
        failureCode:
          normalizeId(
            lastPaymentError.code ||
            lastPaymentError.decline_code,
          ) || null,
        failureMessage:
          normalizeId(
            lastPaymentError.message,
          ) ||
          "Payment failed",
      },
    );

  const updateResult =
    await prismaClient
      .marketplaceTransaction
      .updateMany({
        where: {
          id: transaction.id,
          paymentIntentId,
          status: {
            in: PAYABLE_STATUSES,
          },
        },
        data: {
          status: "PAYMENT_PROCESSING",
          metadata: paymentMetadata,
        },
      });

  if (updateResult.count !== 1) {
    throw httpError(
      "Marketplace transaction changed before payment failure could be recorded",
      409,
      "MARKETPLACE_PAYMENT_FAILURE_RACE",
    );
  }

  return {
    handled: true,
    transactionId: transaction.id,
    paymentIntentId,
    transactionStatus:
      "PAYMENT_PROCESSING",
    idempotent: false,
    reservationRetained: true,
  };
}

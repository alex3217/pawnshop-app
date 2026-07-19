import { prisma } from "../lib/prisma.js";
import { getStripe } from "../lib/stripe.js";

const RELEASABLE_TRANSACTION_STATUSES = [
  "PENDING",
  "PAYMENT_PROCESSING",
];

const COMPLETED_TRANSACTION_STATUSES =
  new Set([
    "PAID",
    "FULFILLING",
    "COMPLETED",
    "REFUNDED",
    "DISPUTED",
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

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeReason(value) {
  return (
    String(value || "BUYER_CANCELED")
      .trim()
      .toUpperCase()
      .slice(0, 80) ||
    "BUYER_CANCELED"
  );
}

function normalizeTimestamp(value = new Date()) {
  const timestamp =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw httpError(
      "Reservation release timestamp is invalid",
      400,
      "INVALID_RESERVATION_RELEASE_TIMESTAMP",
    );
  }

  return timestamp;
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

function isAdminRole(role) {
  const normalized =
    normalizeRole(role);

  return (
    normalized === "ADMIN" ||
    normalized === "SUPER_ADMIN"
  );
}

async function loadTransaction({
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
        status: true,
        quantity: true,
        paymentIntentId: true,
        fulfillmentStatus: true,
        canceledAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        listing: {
          select: {
            id: true,
            status: true,
            quantity: true,
            expiresAt: true,
          },
        },
      },
    });
}

function assertActorMayRelease({
  transaction,
  actorUserId,
  role,
}) {
  if (!actorUserId) {
    throw httpError(
      "Unauthorized",
      401,
      "MARKETPLACE_RESERVATION_UNAUTHORIZED",
    );
  }

  if (
    !isAdminRole(role) &&
    transaction.buyerUserId !== actorUserId
  ) {
    throw httpError(
      "Forbidden",
      403,
      "MARKETPLACE_RESERVATION_FORBIDDEN",
    );
  }
}

function assertTransactionMayBeReleased(
  transaction,
) {
  if (!transaction) {
    throw httpError(
      "Marketplace transaction not found",
      404,
      "MARKETPLACE_TRANSACTION_NOT_FOUND",
    );
  }

  if (transaction.status === "CANCELED") {
    return;
  }

  if (
    COMPLETED_TRANSACTION_STATUSES.has(
      transaction.status,
    )
  ) {
    throw httpError(
      "A completed marketplace transaction cannot release its reservation",
      409,
      "MARKETPLACE_TRANSACTION_ALREADY_FINALIZED",
    );
  }

  if (
    !RELEASABLE_TRANSACTION_STATUSES.includes(
      transaction.status,
    )
  ) {
    throw httpError(
      "Marketplace transaction cannot release its reservation in its current state",
      409,
      "MARKETPLACE_TRANSACTION_NOT_RELEASABLE",
    );
  }

  if (
    !Number.isSafeInteger(
      transaction.quantity,
    ) ||
    transaction.quantity <= 0
  ) {
    throw httpError(
      "Marketplace transaction has an invalid reserved quantity",
      409,
      "INVALID_MARKETPLACE_RESERVED_QUANTITY",
    );
  }
}

function assertReservationExpired({
  transaction,
  expiredBefore,
}) {
  const cutoff =
    normalizeTimestamp(expiredBefore);

  const lastActivity =
    normalizeTimestamp(
      transaction.updatedAt,
    );

  if (lastActivity > cutoff) {
    throw httpError(
      "Marketplace reservation has not expired",
      409,
      "MARKETPLACE_RESERVATION_NOT_EXPIRED",
    );
  }
}

async function cancelAttachedPaymentIntent({
  transaction,
  stripeClient,
}) {
  const paymentIntentId =
    normalizeId(
      transaction.paymentIntentId,
    );

  if (!paymentIntentId) {
    return {
      paymentIntentId: null,
      paymentIntentStatus: null,
      paymentIntentCanceled: false,
      paymentIntentAlreadyCanceled: false,
    };
  }

  const stripe =
    stripeClient || getStripe();

  let paymentIntent;

  try {
    paymentIntent =
      await stripe.paymentIntents.retrieve(
        paymentIntentId,
      );
  } catch (error) {
    throw httpError(
      "Unable to verify the marketplace PaymentIntent before releasing inventory",
      502,
      error?.code ||
        "MARKETPLACE_PAYMENT_INTENT_RETRIEVE_FAILED",
    );
  }

  if (!paymentIntent) {
    throw httpError(
      "Marketplace PaymentIntent was not found",
      502,
      "MARKETPLACE_PAYMENT_INTENT_NOT_FOUND",
    );
  }

  const metadataTransactionId =
    normalizeId(
      paymentIntent.metadata
        ?.marketplaceTransactionId,
    );

  if (
    metadataTransactionId &&
    metadataTransactionId !==
      transaction.id
  ) {
    throw httpError(
      "Marketplace PaymentIntent does not belong to this transaction",
      409,
      "MARKETPLACE_PAYMENT_INTENT_MISMATCH",
    );
  }

  const paymentStatus =
    String(
      paymentIntent.status || "",
    ).trim();

  if (paymentStatus === "succeeded") {
    throw httpError(
      "A successful marketplace payment cannot be canceled",
      409,
      "MARKETPLACE_PAYMENT_ALREADY_SUCCEEDED",
    );
  }

  if (paymentStatus === "canceled") {
    return {
      paymentIntentId,
      paymentIntentStatus:
        paymentStatus,
      paymentIntentCanceled: false,
      paymentIntentAlreadyCanceled: true,
    };
  }

  if (
    typeof stripe?.paymentIntents?.cancel !==
    "function"
  ) {
    throw httpError(
      "Stripe PaymentIntent cancellation is unavailable",
      500,
      "MARKETPLACE_PAYMENT_CANCEL_UNAVAILABLE",
    );
  }

  let canceledIntent;

  try {
    canceledIntent =
      await stripe.paymentIntents.cancel(
        paymentIntentId,
      );
  } catch (error) {
    throw httpError(
      "Unable to cancel the marketplace PaymentIntent",
      502,
      error?.code ||
        "MARKETPLACE_PAYMENT_INTENT_CANCEL_FAILED",
    );
  }

  return {
    paymentIntentId,
    paymentIntentStatus:
      String(
        canceledIntent?.status ||
        "canceled",
      ),
    paymentIntentCanceled: true,
    paymentIntentAlreadyCanceled: false,
  };
}

function buildCancellationMetadata({
  transaction,
  reason,
  releasedAt,
  releasedByUserId,
  systemRelease,
  paymentResult,
}) {
  const metadata =
    metadataObject(
      transaction.metadata,
    );

  return {
    ...metadata,
    reservationRelease: {
      reason,
      releasedAt:
        releasedAt.toISOString(),
      releasedByUserId:
        releasedByUserId || null,
      systemRelease:
        Boolean(systemRelease),
      restoredQuantity:
        transaction.quantity,
      paymentIntentId:
        paymentResult.paymentIntentId,
      paymentIntentStatus:
        paymentResult
          .paymentIntentStatus,
      paymentIntentCanceled:
        paymentResult
          .paymentIntentCanceled,
      paymentIntentAlreadyCanceled:
        paymentResult
          .paymentIntentAlreadyCanceled,
    },
  };
}

async function releaseReservation({
  transactionId,
  actorUserId = null,
  role = null,
  reason,
  systemRelease,
  expiredBefore = null,
  stripeClient,
  prismaClient,
  releasedAt,
}) {
  const id =
    normalizeId(transactionId);

  if (!id) {
    throw httpError(
      "Marketplace transaction ID is required",
      400,
      "MARKETPLACE_TRANSACTION_ID_REQUIRED",
    );
  }

  const timestamp =
    normalizeTimestamp(releasedAt);

  const transaction =
    await loadTransaction({
      transactionId: id,
      prismaClient,
    });

  assertTransactionMayBeReleased(
    transaction,
  );

  if (!systemRelease) {
    assertActorMayRelease({
      transaction,
      actorUserId,
      role,
    });
  } else {
    assertReservationExpired({
      transaction,
      expiredBefore,
    });
  }

  if (
    transaction.status === "CANCELED"
  ) {
    return {
      handled: true,
      idempotent: true,
      transactionId:
        transaction.id,
      transactionStatus:
        "CANCELED",
      quantityRestored: 0,
      listingStatus:
        transaction.listing?.status ||
        null,
    };
  }

  const paymentResult =
    await cancelAttachedPaymentIntent({
      transaction,
      stripeClient,
    });

  const releaseReason =
    normalizeReason(reason);

  return prismaClient.$transaction(
    async (tx) => {
      const current =
        await loadTransaction({
          transactionId:
            transaction.id,
          prismaClient: tx,
        });

      assertTransactionMayBeReleased(
        current,
      );

      if (!systemRelease) {
        assertActorMayRelease({
          transaction: current,
          actorUserId,
          role,
        });
      } else {
        assertReservationExpired({
          transaction: current,
          expiredBefore,
        });
      }

      if (
        current.status === "CANCELED"
      ) {
        return {
          handled: true,
          idempotent: true,
          transactionId:
            current.id,
          transactionStatus:
            "CANCELED",
          quantityRestored: 0,
          listingStatus:
            current.listing?.status ||
            null,
        };
      }

      const listing =
        current.listing;

      if (!listing) {
        throw httpError(
          "Marketplace listing is unavailable",
          409,
          "MARKETPLACE_RESERVATION_LISTING_MISSING",
        );
      }

      if (
        ![
          "ACTIVE",
          "RESERVED",
        ].includes(listing.status)
      ) {
        throw httpError(
          "Marketplace listing cannot receive restored inventory in its current state",
          409,
          "MARKETPLACE_RESERVATION_LISTING_NOT_RELEASABLE",
        );
      }

      const listingExpired =
        listing.expiresAt &&
        new Date(
          listing.expiresAt,
        ) <= timestamp;

      const nextListingStatus =
        listingExpired
          ? "EXPIRED"
          : "ACTIVE";

      const cancellationMetadata =
        buildCancellationMetadata({
          transaction: current,
          reason:
            releaseReason,
          releasedAt:
            timestamp,
          releasedByUserId:
            systemRelease
              ? null
              : actorUserId,
          systemRelease,
          paymentResult,
        });

      const transactionResult =
        await tx
          .marketplaceTransaction
          .updateMany({
            where: {
              id: current.id,
              status: {
                in:
                  RELEASABLE_TRANSACTION_STATUSES,
              },
              paymentIntentId:
                current.paymentIntentId,
            },
            data: {
              status: "CANCELED",
              fulfillmentStatus:
                "CANCELED",
              canceledAt:
                timestamp,
              metadata:
                cancellationMetadata,
            },
          });

      if (
        transactionResult.count !== 1
      ) {
        throw httpError(
          "Marketplace transaction changed before its reservation could be released",
          409,
          "MARKETPLACE_RESERVATION_RELEASE_RACE",
        );
      }

      const listingResult =
        await tx
          .marketplaceListing
          .updateMany({
            where: {
              id: listing.id,
              status: {
                in: [
                  "ACTIVE",
                  "RESERVED",
                ],
              },
              quantity:
                listing.quantity,
            },
            data: {
              quantity: {
                increment:
                  current.quantity,
              },
              status:
                nextListingStatus,
            },
          });

      if (
        listingResult.count !== 1
      ) {
        throw httpError(
          "Marketplace listing changed before reserved inventory could be restored",
          409,
          "MARKETPLACE_RESERVATION_LISTING_RACE",
        );
      }

      return {
        handled: true,
        idempotent: false,
        transactionId:
          current.id,
        transactionStatus:
          "CANCELED",
        quantityRestored:
          current.quantity,
        listingStatus:
          nextListingStatus,
        ...paymentResult,
      };
    },
  );
}

export async function cancelMarketplaceTransactionReservation({
  transactionId,
  actorUserId,
  role,
  reason = "BUYER_CANCELED",
  stripeClient = undefined,
  prismaClient = prisma,
  releasedAt = new Date(),
}) {
  return releaseReservation({
    transactionId,
    actorUserId:
      normalizeId(actorUserId),
    role,
    reason,
    systemRelease: false,
    stripeClient,
    prismaClient,
    releasedAt,
  });
}

export async function expireMarketplaceTransactionReservation({
  transactionId,
  expiredBefore,
  reason =
    "RESERVATION_EXPIRED",
  stripeClient = undefined,
  prismaClient = prisma,
  releasedAt = new Date(),
}) {
  return releaseReservation({
    transactionId,
    reason,
    systemRelease: true,
    expiredBefore,
    stripeClient,
    prismaClient,
    releasedAt,
  });
}

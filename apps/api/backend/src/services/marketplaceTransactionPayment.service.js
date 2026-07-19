import { prisma } from "../lib/prisma.js";
import {
  getStripe,
  getStripeCurrency,
  toAmountCents,
} from "../lib/stripe.js";

const PAYABLE_TRANSACTION_STATUSES = [
  "PENDING",
  "PAYMENT_PROCESSING",
];

const REUSABLE_PAYMENT_INTENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
  "processing",
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

function normalizeCurrency(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isAdminRole(role) {
  const normalized = normalizeRole(role);

  return (
    normalized === "ADMIN" ||
    normalized === "SUPER_ADMIN"
  );
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

function paymentIntentResponse({
  transaction,
  paymentIntent,
  reused,
  finalized = false,
}) {
  return {
    transactionId: transaction.id,
    paymentIntentId:
      String(paymentIntent.id),
    clientSecret:
      paymentIntent.client_secret || null,
    amount: Number(paymentIntent.amount),
    currency:
      normalizeCurrency(paymentIntent.currency),
    paymentStatus:
      String(paymentIntent.status || ""),
    transactionStatus:
      transaction.status,
    reused: Boolean(reused),
    finalized: Boolean(finalized),
  };
}

function assertTransactionMayBePaid({
  transaction,
  buyerUserId,
  role,
}) {
  if (!transaction) {
    throw httpError(
      "Marketplace transaction not found",
      404,
      "MARKETPLACE_TRANSACTION_NOT_FOUND",
    );
  }

  if (
    !isAdminRole(role) &&
    transaction.buyerUserId !== buyerUserId
  ) {
    throw httpError(
      "Forbidden",
      403,
      "MARKETPLACE_PAYMENT_FORBIDDEN",
    );
  }

  if (
    transaction.status === "PAID" ||
    transaction.status === "FULFILLING" ||
    transaction.status === "COMPLETED"
  ) {
    throw httpError(
      "Marketplace transaction is already paid",
      409,
      "MARKETPLACE_TRANSACTION_ALREADY_PAID",
    );
  }

  if (
    !PAYABLE_TRANSACTION_STATUSES.includes(
      transaction.status,
    )
  ) {
    throw httpError(
      "Marketplace transaction cannot be paid in its current state",
      409,
      "MARKETPLACE_TRANSACTION_NOT_PAYABLE",
    );
  }
}

function validatePaymentAmount(transaction) {
  const amount = toAmountCents(
    transaction.totalAmount,
  );

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw httpError(
      "Marketplace transaction amount must be greater than zero",
      400,
      "INVALID_MARKETPLACE_TRANSACTION_AMOUNT",
    );
  }

  const metadata =
    metadataObject(transaction.metadata);

  const storedGrossAmountCents =
    Number(metadata.grossAmountCents);

  if (
    Number.isSafeInteger(storedGrossAmountCents) &&
    storedGrossAmountCents > 0 &&
    storedGrossAmountCents !== amount
  ) {
    throw httpError(
      "Marketplace transaction amount does not match its reservation snapshot",
      409,
      "MARKETPLACE_TRANSACTION_AMOUNT_MISMATCH",
    );
  }

  return amount;
}

function validatePaymentCurrency(transaction) {
  const transactionCurrency =
    normalizeCurrency(transaction.currency);

  const configuredCurrency =
    normalizeCurrency(getStripeCurrency());

  if (
    !transactionCurrency ||
    transactionCurrency !== configuredCurrency
  ) {
    throw httpError(
      "Marketplace transaction currency is not supported by the configured Stripe account",
      409,
      "MARKETPLACE_TRANSACTION_CURRENCY_MISMATCH",
    );
  }

  return configuredCurrency;
}

async function loadPaymentTransaction({
  transactionId,
  prismaClient,
}) {
  return prismaClient.marketplaceTransaction.findUnique({
    where: {
      id: transactionId,
    },
    select: {
      id: true,
      listingId: true,
      buyerUserId: true,
      sellerUserId: true,
      type: true,
      status: true,
      totalAmount: true,
      currency: true,
      paymentIntentId: true,
      metadata: true,
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    },
  });
}

async function retrieveExistingPaymentIntent({
  stripe,
  transaction,
}) {
  const paymentIntentId =
    normalizeId(transaction.paymentIntentId);

  if (!paymentIntentId) {
    return null;
  }

  let paymentIntent;

  try {
    paymentIntent =
      await stripe.paymentIntents.retrieve(
        paymentIntentId,
      );
  } catch (error) {
    throw httpError(
      "Unable to retrieve the existing marketplace PaymentIntent",
      502,
      error?.code ||
        "MARKETPLACE_PAYMENT_INTENT_RETRIEVE_FAILED",
    );
  }

  if (!paymentIntent) {
    throw httpError(
      "Existing marketplace PaymentIntent was not found",
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
    metadataTransactionId !== transaction.id
  ) {
    throw httpError(
      "Existing PaymentIntent does not belong to this marketplace transaction",
      409,
      "MARKETPLACE_PAYMENT_INTENT_MISMATCH",
    );
  }

  if (paymentIntent.status === "succeeded") {
    return paymentIntentResponse({
      transaction,
      paymentIntent,
      reused: true,
      finalized: true,
    });
  }

  if (
    REUSABLE_PAYMENT_INTENT_STATUSES.has(
      paymentIntent.status,
    )
  ) {
    return paymentIntentResponse({
      transaction,
      paymentIntent,
      reused: true,
    });
  }

  if (paymentIntent.status === "canceled") {
    throw httpError(
      "The marketplace PaymentIntent was canceled",
      409,
      "MARKETPLACE_PAYMENT_INTENT_CANCELED",
    );
  }

  throw httpError(
    "The existing marketplace PaymentIntent cannot be reused",
    409,
    "MARKETPLACE_PAYMENT_INTENT_NOT_REUSABLE",
  );
}

async function cancelPaymentIntentQuietly(
  stripe,
  paymentIntentId,
) {
  if (
    !paymentIntentId ||
    typeof stripe?.paymentIntents?.cancel !==
      "function"
  ) {
    return;
  }

  try {
    await stripe.paymentIntents.cancel(
      paymentIntentId,
    );
  } catch {
    // Best-effort cleanup only.
  }
}

export async function createMarketplaceTransactionPaymentIntent({
  transactionId,
  buyerUserId,
  role,
  stripeClient = undefined,
  prismaClient = prisma,
}) {
  const id = normalizeId(transactionId);
  const buyerId = normalizeId(buyerUserId);

  if (!buyerId) {
    throw httpError(
      "Unauthorized",
      401,
      "MARKETPLACE_PAYMENT_UNAUTHORIZED",
    );
  }

  if (!id) {
    throw httpError(
      "Marketplace transaction ID is required",
      400,
      "MARKETPLACE_TRANSACTION_ID_REQUIRED",
    );
  }

  const transaction =
    await loadPaymentTransaction({
      transactionId: id,
      prismaClient,
    });

  assertTransactionMayBePaid({
    transaction,
    buyerUserId: buyerId,
    role,
  });

  const amount =
    validatePaymentAmount(transaction);

  const currency =
    validatePaymentCurrency(transaction);

  const stripe =
    stripeClient || getStripe();

  const existing =
    await retrieveExistingPaymentIntent({
      stripe,
      transaction,
    });

  if (existing) {
    return existing;
  }

  let paymentIntent;

  try {
    paymentIntent =
      await stripe.paymentIntents.create(
        {
          amount,
          currency,
          automatic_payment_methods: {
            enabled: true,
          },
          description:
            transaction.listing?.title ||
            "PawnLoop marketplace purchase",
          metadata: {
            marketplaceTransactionId:
              transaction.id,
            marketplaceListingId:
              transaction.listingId,
            buyerUserId:
              transaction.buyerUserId,
            sellerUserId:
              transaction.sellerUserId,
            marketplaceTransactionType:
              transaction.type,
          },
        },
        {
          idempotencyKey:
            `marketplace-transaction-${transaction.id}`,
        },
      );
  } catch (error) {
    throw httpError(
      error?.message ||
        "Unable to create marketplace PaymentIntent",
      Number(error?.statusCode) || 502,
      error?.code ||
        "MARKETPLACE_PAYMENT_INTENT_CREATE_FAILED",
    );
  }

  const paymentIntentId =
    normalizeId(paymentIntent?.id);

  if (!paymentIntentId) {
    throw httpError(
      "Stripe did not return a PaymentIntent ID",
      502,
      "MARKETPLACE_PAYMENT_INTENT_ID_MISSING",
    );
  }

  const attached =
    await prismaClient.marketplaceTransaction.updateMany({
      where: {
        id: transaction.id,
        buyerUserId: transaction.buyerUserId,
        status: {
          in: PAYABLE_TRANSACTION_STATUSES,
        },
        OR: [
          {
            paymentIntentId: null,
          },
          {
            paymentIntentId,
          },
        ],
      },
      data: {
        paymentIntentId,
        status: "PAYMENT_PROCESSING",
      },
    });

  if (attached.count !== 1) {
    await cancelPaymentIntentQuietly(
      stripe,
      paymentIntentId,
    );

    throw httpError(
      "Marketplace transaction changed before payment could begin",
      409,
      "MARKETPLACE_TRANSACTION_PAYMENT_STATE_CHANGED",
    );
  }

  return paymentIntentResponse({
    transaction: {
      ...transaction,
      status: "PAYMENT_PROCESSING",
    },
    paymentIntent,
    reused: false,
    finalized:
      paymentIntent.status === "succeeded",
  });
}

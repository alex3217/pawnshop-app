import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { appendMarketplaceTransactionEvent } from "./marketplaceTransactionEvent.service.js";

const MAX_ACCEPTANCE_ATTEMPTS = 3;
const MAX_PRISMA_CONNECTOR_DIAGNOSTIC_LENGTH = 4096;
const ACCEPTABLE_SUBMISSION_STATUS = "OFFERED";
const CUSTOMER_SALE_INTENTS = new Set(["SELL", "SELL_OFFERS"]);
const PAWN_INTENTS = new Set(["PAWN", "PAWN_OFFERS"]);
const RETRYABLE_POSTGRES_CODES = new Set(["40P01", "40001"]);
const HANDOFF_UNIQUENESS_IDENTIFIERS = new Set([
  "MarketplaceTransaction_submissionId_key",
  "MarketplaceTransaction_submissionOfferId_key",
  "BuyerItemSubmissionOffer_one_accepted_per_submission_key",
  "submissionId",
  "submissionOfferId",
]);

const OFFER_INCLUDE = {
  submission: true,
  shop: {
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      ownerId: true,
      isDeleted: true,
      subscriptionStatus: true,
    },
  },
};

function acceptanceError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeWorkflowValue(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function structuredErrorEntries(error, { depthLimit = 6, entryLimit = 12 } = {}) {
  const entries = [];
  const seen = new Set();
  const pending = [{ value: error, depth: 0 }];

  while (pending.length && entries.length < entryLimit) {
    const { value, depth } = pending.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;

    seen.add(value);
    entries.push(value);
    if (depth >= depthLimit) continue;

    for (const key of ["cause", "error"]) {
      const nested = value[key];
      if (nested && typeof nested === "object" && !seen.has(nested)) {
        pending.push({ value: nested, depth: depth + 1 });
      }
    }
  }

  return entries;
}

function postgresCodeFrom(error) {
  for (const entry of structuredErrorEntries(error)) {
    const candidates = [
      entry.code,
      entry.sqlState,
      entry.sqlstate,
      entry.meta?.code,
      entry.meta?.sqlState,
      entry.meta?.sqlstate,
    ];
    for (const candidate of candidates) {
      if (RETRYABLE_POSTGRES_CODES.has(candidate)) return candidate;
    }
  }

  return null;
}

function postgresCodeFromPrismaConnectorDiagnostic(error) {
  if (!(error instanceof Prisma.PrismaClientUnknownRequestError)) return null;
  if (
    typeof error.message !== "string" ||
    error.message.length > MAX_PRISMA_CONNECTOR_DIAGNOSTIC_LENGTH
  ) {
    return null;
  }

  const connectorStart = error.message.indexOf("ConnectorError(");
  if (connectorStart === -1) return null;

  const postgresErrorStart = error.message.indexOf(
    'QueryError(PostgresError { code: "',
    connectorStart + "ConnectorError(".length,
  );
  if (postgresErrorStart === -1) return null;

  const codeStart =
    postgresErrorStart + 'QueryError(PostgresError { code: "'.length;
  for (const code of RETRYABLE_POSTGRES_CODES) {
    if (error.message.startsWith(`${code}",`, codeStart)) return code;
  }

  return null;
}

function isHandoffUniqueError(error) {
  if (error?.code !== "P2002") return false;

  const values = [error.meta?.constraint, error.meta?.target]
    .flat(Infinity)
    .filter((value) => typeof value === "string")
    .flatMap((value) => value.split(/[.,()\s"']+/).filter(Boolean));

  return values.some((value) => HANDOFF_UNIQUENESS_IDENTIFIERS.has(value));
}

export function isRetryableCustomerSellAcceptanceError(error) {
  if (structuredErrorEntries(error).some((entry) => entry.code === "P2034")) return true;
  if (isHandoffUniqueError(error)) return true;
  if (RETRYABLE_POSTGRES_CODES.has(postgresCodeFrom(error))) return true;
  return RETRYABLE_POSTGRES_CODES.has(postgresCodeFromPrismaConnectorDiagnostic(error));
}

function assertSupportedIntent(intent) {
  const normalized = normalizeWorkflowValue(intent);
  if (CUSTOMER_SALE_INTENTS.has(normalized)) return "CUSTOMER_SALE";
  if (PAWN_INTENTS.has(normalized)) return "PAWN";

  throw acceptanceError(
    "Submission intent does not support offer acceptance",
    409,
    "SUBMISSION_OFFER_INTENT_UNSUPPORTED",
  );
}

function assertShopIntegrity(offer) {
  if (!offer.shop || offer.shop.isDeleted || normalizeWorkflowValue(offer.shop.subscriptionStatus) !== "ACTIVE") {
    throw acceptanceError(
      "The offer shop is no longer active",
      409,
      "SUBMISSION_OFFER_SHOP_INACTIVE",
    );
  }

  if (offer.shop.ownerId !== offer.ownerId) {
    throw acceptanceError(
      "The offer shop ownership has changed",
      409,
      "SUBMISSION_OFFER_SHOP_OWNER_MISMATCH",
    );
  }
}

async function loadExistingResult(client, existingTransaction, offerId) {
  if (existingTransaction?.submissionOfferId !== offerId) return null;
  const offer = await client.buyerItemSubmissionOffer.findUnique({
    where: { id: offerId },
    include: OFFER_INCLUDE,
  });
  if (!offer) return null;
  return { offer, submission: offer.submission, transaction: existingTransaction, reused: true };
}

function loadAcceptedPawnResult(offer, existingTransaction, offerId) {
  if (existingTransaction) return null;
  if (offer.id !== offerId || offer.submissionId !== offer.submission?.id) return null;
  if (normalizeWorkflowValue(offer.status) !== "ACCEPTED") return null;
  if (normalizeWorkflowValue(offer.submission.status) !== "ACCEPTED") return null;
  if (!PAWN_INTENTS.has(normalizeWorkflowValue(offer.submission.intent))) return null;

  return { offer, submission: offer.submission, transaction: null, reused: true };
}

async function acceptSubmissionOfferOnce({ offerId, customerId, prismaClient = prisma }) {
  return prismaClient.$transaction(
    async (tx) => {
      const existing = await tx.buyerItemSubmissionOffer.findUnique({
        where: { id: offerId },
        include: OFFER_INCLUDE,
      });

      if (!existing || existing.submission.buyerId !== customerId) {
        throw acceptanceError("Offer not found", 404, "SUBMISSION_OFFER_NOT_FOUND");
      }

      const existingTransaction = await tx.marketplaceTransaction.findUnique({
        where: { submissionId: existing.submissionId },
      });
      const reused = await loadExistingResult(tx, existingTransaction, offerId);
      if (reused) return reused;
      const reusedPawn = loadAcceptedPawnResult(existing, existingTransaction, offerId);
      if (reusedPawn) return reusedPawn;
      if (existingTransaction) {
        throw acceptanceError("Another offer has already been accepted", 409, "SUBMISSION_OFFER_ALREADY_ACCEPTED");
      }

      const intentKind = assertSupportedIntent(existing.submission.intent);

      if (normalizeWorkflowValue(existing.submission.status) !== ACCEPTABLE_SUBMISSION_STATUS) {
        throw acceptanceError(
          "Submission is no longer open for offer acceptance",
          409,
          "SUBMISSION_OFFER_SUBMISSION_NOT_ACCEPTABLE",
        );
      }
      if (normalizeWorkflowValue(existing.status) !== "PENDING") {
        throw acceptanceError("Only pending offers can be accepted", 409, "SUBMISSION_OFFER_NOT_PENDING");
      }

      assertShopIntegrity(existing);

      const respondedAt = new Date();
      const offer = await tx.buyerItemSubmissionOffer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED", respondedAt },
        include: OFFER_INCLUDE,
      });

      await tx.buyerItemSubmissionOffer.updateMany({
        where: { submissionId: existing.submissionId, id: { not: offerId }, status: "PENDING" },
        data: { status: "REJECTED", respondedAt },
      });

      const submission = await tx.buyerItemSubmission.update({
        where: { id: existing.submissionId },
        data: { status: "ACCEPTED", reviewMessage: "Buyer accepted a shop offer." },
      });

      let transaction = null;
      if (intentKind === "CUSTOMER_SALE") {
        transaction = await tx.marketplaceTransaction.create({
          data: {
            listingId: null,
            submissionId: existing.submissionId,
            submissionOfferId: existing.id,
            buyerUserId: existing.ownerId,
            buyerShopId: existing.shopId,
            sellerUserId: customerId,
            sellerShopId: null,
            type: "CUSTOMER_SELL_TO_SHOP",
            status: "PENDING",
            quantity: 1,
            subtotal: existing.amount,
            platformFee: 0,
            shippingFee: 0,
            taxAmount: 0,
            totalAmount: existing.amount,
            currency: "USD",
            paymentIntentId: null,
            fulfillmentStatus: "PAYMENT_PENDING",
            metadata: { settlementMethod: "OFFLINE_IN_PERSON", settlementDirection: "SHOP_TO_CUSTOMER" },
          },
        });
        const fulfillment = await tx.customerSellFulfillment.create({
          data: {
            transactionId: transaction.id,
            submissionId: existing.submissionId,
            submissionOfferId: existing.id,
            shopId: existing.shopId,
            customerId,
            acceptedShopOwnerId: existing.ownerId,
            originalAmount: existing.amount,
            currency: "USD",
          },
        });
        await tx.customerSellPayment.create({
          data: {
            transactionId: transaction.id,
            fulfillmentId: fulfillment.id,
            shopId: existing.shopId,
            customerId,
            amount: existing.amount,
            currency: "USD",
          },
        });
        await appendMarketplaceTransactionEvent({
          tx,
          transactionId: transaction.id,
          fulfillmentId: fulfillment.id,
          actorUserId: customerId,
          actorRole: "CONSUMER",
          eventType: "CUSTOMER_SELL_FULFILLMENT_INITIALIZED",
          toStatus: "AWAITING_HANDOFF",
          idempotencyKey: `customer-sell-handoff:${transaction.id}`,
          data: { handoffMethod: "IN_PERSON", revenuePolicy: "SUBSCRIPTION_COVERED_ZERO_PLATFORM_FEE" },
        });
      }

      return { offer, submission, transaction, reused: false };
    },
    { isolationLevel: "Serializable" },
  );
}

async function reconcileAcceptance({ offerId, customerId, prismaClient }) {
  const offer = await prismaClient.buyerItemSubmissionOffer.findUnique({
    where: { id: offerId },
    include: OFFER_INCLUDE,
  });
  if (!offer || offer.submission.buyerId !== customerId) {
    throw acceptanceError("Offer not found", 404, "SUBMISSION_OFFER_NOT_FOUND");
  }

  const transaction = await prismaClient.marketplaceTransaction.findUnique({
    where: { submissionId: offer.submissionId },
  });
  const reused = await loadExistingResult(prismaClient, transaction, offerId);
  if (reused) return reused;
  const reusedPawn = loadAcceptedPawnResult(offer, transaction, offerId);
  if (reusedPawn) return reusedPawn;
  if (transaction || normalizeWorkflowValue(offer.submission.status) === "ACCEPTED") {
    throw acceptanceError("Another offer has already been accepted", 409, "SUBMISSION_OFFER_ALREADY_ACCEPTED");
  }

  throw acceptanceError(
    "Offer acceptance conflicted with another database operation",
    409,
    "SUBMISSION_OFFER_ACCEPTANCE_CONFLICT",
  );
}

export async function acceptSubmissionOffer(options) {
  const prismaClient = options.prismaClient || prisma;
  for (let attempt = 0; attempt < MAX_ACCEPTANCE_ATTEMPTS; attempt += 1) {
    try {
      return await acceptSubmissionOfferOnce({ ...options, prismaClient });
    } catch (error) {
      if (!isRetryableCustomerSellAcceptanceError(error)) throw error;
      if (attempt === MAX_ACCEPTANCE_ATTEMPTS - 1) {
        return reconcileAcceptance({ ...options, prismaClient });
      }
    }
  }

  throw acceptanceError("Offer acceptance conflicted", 409, "SUBMISSION_OFFER_ACCEPTANCE_CONFLICT");
}

import { prisma } from "../../lib/prisma.js";

const SETTLEMENT_CREDIT_TYPE = "SETTLEMENT_CREDIT";
const AVAILABLE_STATUS = "AVAILABLE";

function normalizeId(value) {
  const id = String(value || "").trim();
  return id || null;
}

function requirePositiveInteger(value, fieldName) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return amount;
}

function resolveSettlementSeller(settlement) {
  if (settlement?.auction) {
    const shopId = normalizeId(settlement.auction.shopId);
    const sellerUserId = normalizeId(settlement.auction.shop?.ownerId);

    if (!shopId || !sellerUserId) {
      throw new Error(
        "Auction settlement is missing its seller shop or shop owner",
      );
    }

    return {
      shopId,
      sellerUserId,
      sourceType: "AUCTION",
      sourceId: settlement.auctionId,
    };
  }

  if (settlement?.offer) {
    const shopId = normalizeId(settlement.offer.item?.pawnShopId);
    const sellerUserId = normalizeId(settlement.offer.ownerId);

    if (!shopId || !sellerUserId) {
      throw new Error(
        "Offer settlement is missing its seller or item shop",
      );
    }

    return {
      shopId,
      sellerUserId,
      sourceType: "OFFER",
      sourceId: settlement.offerId,
    };
  }

  throw new Error(
    "Settlement is not connected to a supported auction or offer",
  );
}

export async function createSettlementCreditLedgerEntry({
  settlementId,
  availableAt = new Date(),
  prismaClient = prisma,
} = {}) {
  const safeSettlementId = normalizeId(settlementId);

  if (!safeSettlementId) {
    throw new Error("settlementId is required");
  }

  const settlement = await prismaClient.settlement.findUnique({
    where: { id: safeSettlementId },
    include: {
      auction: {
        select: {
          id: true,
          shopId: true,
          shop: {
            select: {
              id: true,
              ownerId: true,
            },
          },
        },
      },
      offer: {
        select: {
          id: true,
          ownerId: true,
          item: {
            select: {
              id: true,
              pawnShopId: true,
            },
          },
        },
      },
    },
  });

  if (!settlement) {
    throw new Error(`Settlement not found: ${safeSettlementId}`);
  }

  if (String(settlement.status || "").toUpperCase() !== "CHARGED") {
    throw new Error(
      `Settlement ${safeSettlementId} must be CHARGED before ledger credit`,
    );
  }

  const sellerNetCents = requirePositiveInteger(
    settlement.sellerNetCents,
    "sellerNetCents",
  );

  const seller = resolveSettlementSeller(settlement);
  const currency = String(settlement.currency || "USD")
    .trim()
    .toUpperCase();

  const entry = await prismaClient.sellerBalanceLedger.upsert({
    where: {
      settlementId_type: {
        settlementId: safeSettlementId,
        type: SETTLEMENT_CREDIT_TYPE,
      },
    },
    update: {},
    create: {
      settlementId: safeSettlementId,
      sellerUserId: seller.sellerUserId,
      shopId: seller.shopId,
      type: SETTLEMENT_CREDIT_TYPE,
      status: AVAILABLE_STATUS,
      amountCents: sellerNetCents,
      currency,
      availableAt,
      description: `Seller proceeds for ${seller.sourceType.toLowerCase()} settlement`,
      metadata: {
        sourceType: seller.sourceType,
        sourceId: seller.sourceId,
        grossAmountCents: settlement.grossAmountCents,
        platformFeeCents: settlement.platformFeeCents,
        sellerNetCents,
        stripePaymentIntent: settlement.stripePaymentIntent,
        chargedAt: settlement.chargedAt?.toISOString?.() || null,
      },
    },
  });

  return {
    entry,
    createdOrExisting: true,
    settlementId: safeSettlementId,
    sellerUserId: seller.sellerUserId,
    shopId: seller.shopId,
    amountCents: sellerNetCents,
    currency,
  };
}

import { prisma } from "../../lib/prisma.js";

const CREDIT_TYPES = new Set([
  "SETTLEMENT_CREDIT",
  "REVERSAL_CREDIT",
  "ADJUSTMENT_CREDIT",
]);

const DEBIT_TYPES = new Set([
  "PAYOUT_DEBIT",
  "REFUND_DEBIT",
  "ADJUSTMENT_DEBIT",
]);

function normalizeId(value, fieldName) {
  const id = String(value || "").trim();

  if (!id) {
    throw new Error(`${fieldName} is required`);
  }

  return id;
}

function signedAmount(entry) {
  const amount = Number(entry?.amountCents);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Ledger amountCents must be a non-negative integer");
  }

  if (CREDIT_TYPES.has(entry.type)) {
    return amount;
  }

  if (DEBIT_TYPES.has(entry.type)) {
    return -amount;
  }

  throw new Error(`Unsupported ledger entry type: ${entry.type}`);
}

export function calculateSellerBalanceFromEntries(entries = []) {
  const balance = {
    pendingCents: 0,
    availableCents: 0,
    heldCents: 0,
    paidCents: 0,
    reversedCents: 0,
    totalCents: 0,
    entryCount: entries.length,
  };

  for (const entry of entries) {
    const amount = signedAmount(entry);

    switch (entry.status) {
      case "PENDING":
        balance.pendingCents += amount;
        break;
      case "AVAILABLE":
        balance.availableCents += amount;
        break;
      case "HELD":
        balance.heldCents += amount;
        break;
      case "PAID":
        balance.paidCents += amount;
        break;
      case "REVERSED":
        balance.reversedCents += amount;
        break;
      default:
        throw new Error(
          `Unsupported ledger entry status: ${entry.status}`,
        );
    }

    balance.totalCents += amount;
  }

  return balance;
}

export async function getSellerBalance({
  sellerUserId,
  shopId,
  currency = "USD",
  prismaClient = prisma,
} = {}) {
  const safeSellerUserId = normalizeId(
    sellerUserId,
    "sellerUserId",
  );

  const safeShopId = normalizeId(shopId, "shopId");
  const safeCurrency = String(currency || "USD")
    .trim()
    .toUpperCase();

  const entries = await prismaClient.sellerBalanceLedger.findMany({
    where: {
      sellerUserId: safeSellerUserId,
      shopId: safeShopId,
      currency: safeCurrency,
    },
    select: {
      id: true,
      type: true,
      status: true,
      amountCents: true,
      currency: true,
      availableAt: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return {
    sellerUserId: safeSellerUserId,
    shopId: safeShopId,
    currency: safeCurrency,
    ...calculateSellerBalanceFromEntries(entries),
  };
}

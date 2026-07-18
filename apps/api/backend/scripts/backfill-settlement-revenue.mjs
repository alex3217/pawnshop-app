import { PrismaClient } from "@prisma/client";

import {
  calculateSettlementRevenueContext,
} from "../src/services/revenue/settlementRevenueAdapter.service.js";

const prisma = new PrismaClient();

function resolveSettlementContext(settlement) {
  if (settlement.auctionId) {
    return {
      sellerPlanCode:
        settlement.auction?.shop?.subscriptionPlan ||
        settlement.auction?.item?.shop?.subscriptionPlan ||
        "FREE",
      transactionType: "AUCTION",
    };
  }

  if (settlement.offerId) {
    return {
      sellerPlanCode:
        settlement.offer?.item?.shop?.subscriptionPlan ||
        "FREE",
      transactionType: "OFFER",
    };
  }

  return null;
}

async function main() {
  const dryRun = !process.argv.includes("--apply");

  const settlements = await prisma.settlement.findMany({
    where: {
      OR: [
        { grossAmountCents: null },
        { platformFeeCents: null },
        { sellerNetCents: null },
        { sellerPlanCode: null },
        { transactionType: null },
      ],
    },
    include: {
      auction: {
        include: {
          shop: true,
          item: {
            include: {
              shop: true,
            },
          },
        },
      },
      offer: {
        include: {
          item: {
            include: {
              shop: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log({
    mode: dryRun ? "DRY_RUN" : "APPLY",
    settlementsFound: settlements.length,
  });

  let updated = 0;
  let skipped = 0;

  for (const settlement of settlements) {
    const context = resolveSettlementContext(settlement);

    if (!context) {
      skipped += 1;

      console.warn({
        settlementId: settlement.id,
        skipped: true,
        reason: "NO_TRANSACTION_CONTEXT",
      });

      continue;
    }

    const revenueContext =
      await calculateSettlementRevenueContext({
        amount: settlement.finalPrice,
        sellerPlanCode: context.sellerPlanCode,
        transactionType: context.transactionType,
        currency: settlement.currency || "USD",
      });

    const revenue = revenueContext.revenue;

    const data = {
      grossAmountCents: revenue.grossAmountCents,
      platformFeeCents: revenue.platformFeeCents,
      sellerNetCents: revenue.sellerNetCents,
      processorFeeCents: revenue.processorFeeCents,
      platformNetCents: revenue.platformNetCents,
      sellerPlanCode: revenueContext.sellerPlanCode,
      transactionType: revenueContext.transactionType,
      pricingRuleSnapshot: revenue.pricingRuleSnapshot,
      revenueCalculatedAt: new Date(
        revenue.pricingRuleSnapshot.calculatedAt,
      ),
    };

    console.log({
      settlementId: settlement.id,
      auctionId: settlement.auctionId,
      offerId: settlement.offerId,
      finalPrice: Number(settlement.finalPrice),
      grossAmountCents: data.grossAmountCents,
      platformFeeCents: data.platformFeeCents,
      sellerNetCents: data.sellerNetCents,
      sellerPlanCode: data.sellerPlanCode,
      transactionType: data.transactionType,
    });

    if (!dryRun) {
      await prisma.settlement.update({
        where: {
          id: settlement.id,
        },
        data,
      });

      updated += 1;
    }
  }

  console.log({
    mode: dryRun ? "DRY_RUN" : "APPLY",
    updated,
    skipped,
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

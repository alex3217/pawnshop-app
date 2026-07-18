import { PrismaClient } from "@prisma/client";

import {
  createSettlementCreditLedgerEntry,
} from "../src/services/payouts/settlementLedger.service.js";

const prisma = new PrismaClient();

const shouldApply = process.argv.includes("--apply");

try {
  const settlements = await prisma.settlement.findMany({
    where: {
      status: "CHARGED",
      sellerNetCents: {
        gt: 0,
      },
      sellerLedgerEntries: {
        none: {
          type: "SETTLEMENT_CREDIT",
        },
      },
    },
    select: {
      id: true,
      auctionId: true,
      offerId: true,
      sellerNetCents: true,
      currency: true,
      chargedAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log({
    mode: shouldApply ? "APPLY" : "DRY_RUN",
    settlementsFound: settlements.length,
  });

  let created = 0;
  let failed = 0;

  for (const settlement of settlements) {
    console.log({
      settlementId: settlement.id,
      auctionId: settlement.auctionId,
      offerId: settlement.offerId,
      sellerNetCents: settlement.sellerNetCents,
      currency: settlement.currency,
      chargedAt: settlement.chargedAt,
    });

    if (!shouldApply) {
      continue;
    }

    try {
      const result = await createSettlementCreditLedgerEntry({
        settlementId: settlement.id,
        availableAt: settlement.chargedAt || new Date(),
        prismaClient: prisma,
      });

      created += 1;

      console.log({
        status: "CREATED_OR_EXISTING",
        ledgerEntryId: result.entry.id,
        settlementId: result.settlementId,
        sellerUserId: result.sellerUserId,
        shopId: result.shopId,
        amountCents: result.amountCents,
      });
    } catch (error) {
      failed += 1;

      console.error({
        status: "FAILED",
        settlementId: settlement.id,
        message: error?.message || String(error),
      });
    }
  }

  console.log({
    complete: true,
    mode: shouldApply ? "APPLY" : "DRY_RUN",
    found: settlements.length,
    created,
    failed,
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}

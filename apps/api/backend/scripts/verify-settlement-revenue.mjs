import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REQUIRED_FIELDS = [
  "grossAmountCents",
  "platformFeeCents",
  "sellerNetCents",
  "processorFeeCents",
  "platformNetCents",
  "sellerPlanCode",
  "transactionType",
  "pricingRuleSnapshot",
  "revenueCalculatedAt",
];

function validateSettlement(settlement) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (
      settlement[field] === null ||
      settlement[field] === undefined
    ) {
      errors.push(`Missing ${field}`);
    }
  }

  const gross = settlement.grossAmountCents;
  const platformFee = settlement.platformFeeCents;
  const sellerNet = settlement.sellerNetCents;
  const processorFee = settlement.processorFeeCents;
  const platformNet = settlement.platformNetCents;

  if (
    Number.isInteger(gross) &&
    Number.isInteger(platformFee) &&
    Number.isInteger(sellerNet) &&
    gross !== platformFee + sellerNet
  ) {
    errors.push(
      `grossAmountCents must equal platformFeeCents + sellerNetCents`,
    );
  }

  if (
    Number.isInteger(platformFee) &&
    Number.isInteger(processorFee) &&
    Number.isInteger(platformNet) &&
    platformNet !== platformFee - processorFee
  ) {
    errors.push(
      `platformNetCents must equal platformFeeCents - processorFeeCents`,
    );
  }

  const finalPriceCents =
    Math.round(Number(settlement.finalPrice) * 100);

  if (
    Number.isInteger(gross) &&
    gross !== finalPriceCents
  ) {
    errors.push(
      `grossAmountCents ${gross} does not match finalPrice ${finalPriceCents}`,
    );
  }

  if (
    settlement.auctionId &&
    settlement.transactionType !== "AUCTION"
  ) {
    errors.push(
      `Auction settlement must use transactionType AUCTION`,
    );
  }

  if (
    settlement.offerId &&
    settlement.transactionType !== "OFFER"
  ) {
    errors.push(
      `Offer settlement must use transactionType OFFER`,
    );
  }

  return errors;
}

async function main() {
  const settlements = await prisma.settlement.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log({
    settlementsFound: settlements.length,
  });

  let passed = 0;
  let failed = 0;

  for (const settlement of settlements) {
    const errors =
      validateSettlement(settlement);

    const summary = {
      id: settlement.id,
      auctionId: settlement.auctionId,
      offerId: settlement.offerId,
      finalPrice: Number(settlement.finalPrice),
      grossAmountCents:
        settlement.grossAmountCents,
      platformFeeCents:
        settlement.platformFeeCents,
      sellerNetCents:
        settlement.sellerNetCents,
      processorFeeCents:
        settlement.processorFeeCents,
      platformNetCents:
        settlement.platformNetCents,
      sellerPlanCode:
        settlement.sellerPlanCode,
      transactionType:
        settlement.transactionType,
    };

    if (errors.length) {
      failed += 1;

      console.error({
        status: "FAILED",
        ...summary,
        errors,
      });
    } else {
      passed += 1;

      console.log({
        status: "PASSED",
        ...summary,
      });
    }
  }

  console.log({
    passed,
    failed,
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

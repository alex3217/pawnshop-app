ALTER TABLE "Settlement"
ADD COLUMN "grossAmountCents" INTEGER,
ADD COLUMN "platformFeeCents" INTEGER,
ADD COLUMN "sellerNetCents" INTEGER,
ADD COLUMN "processorFeeCents" INTEGER,
ADD COLUMN "platformNetCents" INTEGER,
ADD COLUMN "sellerPlanCode" TEXT,
ADD COLUMN "transactionType" TEXT,
ADD COLUMN "pricingRuleSnapshot" JSONB,
ADD COLUMN "revenueCalculatedAt" TIMESTAMP(3);

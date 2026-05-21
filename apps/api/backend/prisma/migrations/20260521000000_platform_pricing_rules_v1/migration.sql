-- Platform pricing rules for database-backed Super Admin pricing controls

CREATE TABLE "PlatformPricingRule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "appliesTo" TEXT NOT NULL,
  "feeType" TEXT NOT NULL,
  "amountCents" INTEGER,
  "percentBps" INTEGER,
  "minCents" INTEGER,
  "maxCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "stripePriceId" TEXT,
  "effectiveStartAt" TIMESTAMP(3),
  "effectiveEndAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformPricingRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformPricingRule_key_key"
  ON "PlatformPricingRule"("key");

CREATE INDEX "PlatformPricingRule_category_status_idx"
  ON "PlatformPricingRule"("category", "status");

CREATE INDEX "PlatformPricingRule_appliesTo_status_idx"
  ON "PlatformPricingRule"("appliesTo", "status");

CREATE INDEX "PlatformPricingRule_status_effectiveStartAt_idx"
  ON "PlatformPricingRule"("status", "effectiveStartAt");

CREATE INDEX "PlatformPricingRule_createdAt_idx"
  ON "PlatformPricingRule"("createdAt");

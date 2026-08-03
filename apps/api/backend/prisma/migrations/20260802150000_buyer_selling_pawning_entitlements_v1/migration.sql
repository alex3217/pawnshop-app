ALTER TABLE "BuyerItemSubmission"
ADD COLUMN "shopTransactionPreference" TEXT NOT NULL DEFAULT 'EITHER';

UPDATE "BuyerItemSubmission"
SET "shopTransactionPreference" = 'PAWN',
    "intent" = 'SHOP_OFFERS'
WHERE "intent" = 'PAWN_OFFERS';

ALTER TABLE "BuyerItemSubmission"
ALTER COLUMN "intent" SET DEFAULT 'SHOP_OFFERS';

CREATE TABLE "AiListingGeneration" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "shopId" TEXT,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiListingGeneration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiListingGeneration_userId_createdAt_idx" ON "AiListingGeneration"("userId", "createdAt");
CREATE INDEX "AiListingGeneration_shopId_createdAt_idx" ON "AiListingGeneration"("shopId", "createdAt");

UPDATE "PlatformPricingRule"
SET "metadata" = jsonb_set(
  jsonb_set("metadata", '{maxActiveListings}', '20'::jsonb, true),
  '{features}',
  '["Up to 20 active products","50 active listings during trial","Basic shop profile","Standard support"]'::jsonb,
  true
), "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'seller_plan_free_limits';

ALTER TYPE "ItemStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'AVAILABLE';

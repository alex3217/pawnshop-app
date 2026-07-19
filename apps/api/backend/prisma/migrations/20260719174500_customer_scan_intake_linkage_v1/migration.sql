-- AlterTable
ALTER TABLE "ItemIntake"
ADD COLUMN "linkedMarketplaceListingId" TEXT;

-- Remove stale loose submission references before adding a foreign key.
UPDATE "ItemIntake" AS intake
SET "linkedSubmissionId" = NULL
WHERE intake."linkedSubmissionId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "BuyerItemSubmission" AS submission
    WHERE submission."id" = intake."linkedSubmissionId"
  );

-- Keep the earliest intake when historical loose data contains
-- more than one intake pointing to the same submission.
WITH "rankedSubmissionLinks" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "linkedSubmissionId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "linkRank"
  FROM "ItemIntake"
  WHERE "linkedSubmissionId" IS NOT NULL
)
UPDATE "ItemIntake" AS intake
SET "linkedSubmissionId" = NULL
FROM "rankedSubmissionLinks" AS ranked
WHERE intake."id" = ranked."id"
  AND ranked."linkRank" > 1;

-- Backfill one eligible marketplace listing from the previous
-- metadata-only intake linkage contract.
WITH "candidateMarketplaceLinks" AS (
  SELECT DISTINCT ON (
    NULLIF(
      BTRIM(
        listing."metadata"->>'intakeId'
      ),
      ''
    )
  )
    listing."id" AS "listingId",
    listing."sellerUserId" AS "sellerUserId",
    NULLIF(
      BTRIM(
        listing."metadata"->>'intakeId'
      ),
      ''
    ) AS "intakeId"
  FROM "MarketplaceListing" AS listing
  WHERE jsonb_typeof(listing."metadata") = 'object'
    AND NULLIF(
      BTRIM(
        listing."metadata"->>'intakeId'
      ),
      ''
    ) IS NOT NULL
    AND listing."sellerShopId" IS NULL
  ORDER BY
    NULLIF(
      BTRIM(
        listing."metadata"->>'intakeId'
      ),
      ''
    ),
    listing."createdAt" ASC,
    listing."id" ASC
)
UPDATE "ItemIntake" AS intake
SET "linkedMarketplaceListingId" =
  candidate."listingId"
FROM "candidateMarketplaceLinks" AS candidate
WHERE intake."id" = candidate."intakeId"
  AND intake."customerId" = candidate."sellerUserId"
  AND intake."shopId" IS NULL
  AND intake."linkedMarketplaceListingId" IS NULL;

-- Replace the previous non-unique submission index with
-- one-to-one linkage constraints.
DROP INDEX IF EXISTS
"ItemIntake_linkedSubmissionId_idx";

CREATE UNIQUE INDEX
"ItemIntake_linkedSubmissionId_key"
ON "ItemIntake"("linkedSubmissionId");

CREATE UNIQUE INDEX
"ItemIntake_linkedMarketplaceListingId_key"
ON "ItemIntake"("linkedMarketplaceListingId");

-- AddForeignKey
ALTER TABLE "ItemIntake"
ADD CONSTRAINT "ItemIntake_linkedSubmissionId_fkey"
FOREIGN KEY ("linkedSubmissionId")
REFERENCES "BuyerItemSubmission"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemIntake"
ADD CONSTRAINT "ItemIntake_linkedMarketplaceListingId_fkey"
FOREIGN KEY ("linkedMarketplaceListingId")
REFERENCES "MarketplaceListing"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

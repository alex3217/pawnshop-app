-- Production preflight: fail before any schema change if historical data would
-- violate the one-accepted-offer-per-submission invariant.
SET lock_timeout = '10s';
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "BuyerItemSubmissionOffer"
    WHERE "status" = 'ACCEPTED'
    GROUP BY "submissionId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'customer sell handoff migration blocked: duplicate ACCEPTED offers exist for a submission',
      HINT = 'Resolve duplicate accepted offers before retrying this migration.';
  END IF;
END
$preflight$;

-- PostgreSQL requires enum additions to be committed before the new value is
-- safely referenced by later DDL. This repeatable, bounded step is therefore
-- intentionally outside the transaction containing the remaining changes.
ALTER TYPE "MarketplaceTransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_SELL_TO_SHOP';
RESET lock_timeout;

-- All compatible DDL is atomic. A lock timeout rolls this transaction back,
-- leaving at most the harmless, repeatable enum value from the boundary above.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE "MarketplaceTransaction" ALTER COLUMN "listingId" DROP NOT NULL;
ALTER TABLE "MarketplaceTransaction" ADD COLUMN "submissionId" TEXT;
ALTER TABLE "MarketplaceTransaction" ADD COLUMN "submissionOfferId" TEXT;

CREATE UNIQUE INDEX "MarketplaceTransaction_submissionId_key"
ON "MarketplaceTransaction"("submissionId");

CREATE UNIQUE INDEX "MarketplaceTransaction_submissionOfferId_key"
ON "MarketplaceTransaction"("submissionOfferId");

CREATE UNIQUE INDEX "BuyerItemSubmissionOffer_id_submissionId_key"
ON "BuyerItemSubmissionOffer"("id", "submissionId");

CREATE UNIQUE INDEX "BuyerItemSubmissionOffer_one_accepted_per_submission_key"
ON "BuyerItemSubmissionOffer"("submissionId")
WHERE "status" = 'ACCEPTED';

ALTER TABLE "MarketplaceTransaction"
ADD CONSTRAINT "MarketplaceTransaction_origin_check"
CHECK (
  (
    "listingId" IS NOT NULL
    AND "submissionId" IS NULL
    AND "submissionOfferId" IS NULL
  )
  OR
  (
    "listingId" IS NULL
    AND "submissionId" IS NOT NULL
    AND "submissionOfferId" IS NOT NULL
    AND "type" = 'CUSTOMER_SELL_TO_SHOP'
  )
);

ALTER TABLE "MarketplaceTransaction"
ADD CONSTRAINT "MarketplaceTransaction_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketplaceTransaction"
ADD CONSTRAINT "MarketplaceTransaction_submissionOfferId_fkey"
FOREIGN KEY ("submissionOfferId") REFERENCES "BuyerItemSubmissionOffer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketplaceTransaction"
ADD CONSTRAINT "MarketplaceTransaction_submissionOffer_submission_fkey"
FOREIGN KEY ("submissionOfferId", "submissionId")
REFERENCES "BuyerItemSubmissionOffer"("id", "submissionId")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

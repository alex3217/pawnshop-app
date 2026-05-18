-- Owner auction reviewed state for owner operational workflows.
-- Idempotent for local/dev safety; Prisma migrate deploy will run this once in managed environments.

ALTER TABLE "Auction"
  ADD COLUMN IF NOT EXISTS "ownerReviewedAt" TIMESTAMP(3);

ALTER TABLE "Auction"
  ADD COLUMN IF NOT EXISTS "ownerReviewedById" TEXT;

CREATE INDEX IF NOT EXISTS "Auction_ownerReviewedAt_idx"
  ON "Auction"("ownerReviewedAt");

CREATE INDEX IF NOT EXISTS "Auction_ownerReviewedById_idx"
  ON "Auction"("ownerReviewedById");

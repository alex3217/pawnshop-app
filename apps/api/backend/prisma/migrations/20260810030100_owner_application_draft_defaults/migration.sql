ALTER TABLE "OwnerApplication"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ALTER COLUMN "submittedAt" DROP NOT NULL,
  ALTER COLUMN "submittedAt" DROP DEFAULT;

-- Existing applications retain their status and timestamps. There is deliberately
-- no PENDING-to-DRAFT backfill because PENDING means submitted and review-locked.

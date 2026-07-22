-- Existing accounts predate email verification. Treat them as verified at the
-- instant this migration runs, while preserving every existing row and relation.
ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

UPDATE "User"
SET "authVersion" = 0,
    "emailVerifiedAt" = CURRENT_TIMESTAMP;

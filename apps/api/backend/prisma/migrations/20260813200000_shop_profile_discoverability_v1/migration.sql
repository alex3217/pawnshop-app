ALTER TABLE "PawnShop"
ADD COLUMN "addressLine2" TEXT,
ADD COLUMN "mapVerificationRequired" BOOLEAN NOT NULL DEFAULT false;

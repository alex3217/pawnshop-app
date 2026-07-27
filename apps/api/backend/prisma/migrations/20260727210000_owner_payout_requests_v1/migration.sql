ALTER TABLE "SellerPayout"
ADD COLUMN "requestedByUserId" TEXT,
ADD COLUMN "requestNote" TEXT,
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "stripeTransferId" TEXT;

CREATE UNIQUE INDEX "SellerPayout_stripeTransferId_key"
ON "SellerPayout"("stripeTransferId");

CREATE INDEX "SellerPayout_requestedByUserId_requestedAt_idx"
ON "SellerPayout"("requestedByUserId", "requestedAt");

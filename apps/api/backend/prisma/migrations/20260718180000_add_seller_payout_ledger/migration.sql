CREATE TYPE "SellerLedgerEntryType" AS ENUM (
  'SETTLEMENT_CREDIT',
  'PAYOUT_DEBIT',
  'REFUND_DEBIT',
  'REVERSAL_CREDIT',
  'ADJUSTMENT_CREDIT',
  'ADJUSTMENT_DEBIT'
);

CREATE TYPE "SellerLedgerEntryStatus" AS ENUM (
  'PENDING',
  'AVAILABLE',
  'HELD',
  'PAID',
  'REVERSED'
);

CREATE TYPE "SellerPayoutStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELED'
);

CREATE TABLE "SellerPayout" (
  "id" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "status" "SellerPayoutStatus" NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "provider" TEXT,
  "providerPayoutId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SellerPayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerBalanceLedger" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT,
  "payoutId" TEXT,
  "sellerUserId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "type" "SellerLedgerEntryType" NOT NULL,
  "status" "SellerLedgerEntryStatus" NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "availableAt" TIMESTAMP(3),
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SellerBalanceLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerPayout_providerPayoutId_key"
ON "SellerPayout"("providerPayoutId");

CREATE UNIQUE INDEX "SellerPayout_idempotencyKey_key"
ON "SellerPayout"("idempotencyKey");

CREATE INDEX "SellerPayout_sellerUserId_status_createdAt_idx"
ON "SellerPayout"("sellerUserId", "status", "createdAt");

CREATE INDEX "SellerPayout_shopId_status_createdAt_idx"
ON "SellerPayout"("shopId", "status", "createdAt");

CREATE INDEX "SellerPayout_status_requestedAt_idx"
ON "SellerPayout"("status", "requestedAt");

CREATE INDEX "SellerPayout_createdAt_idx"
ON "SellerPayout"("createdAt");

CREATE UNIQUE INDEX "SellerBalanceLedger_settlementId_type_key"
ON "SellerBalanceLedger"("settlementId", "type");

CREATE INDEX "SellerBalanceLedger_sellerUserId_status_createdAt_idx"
ON "SellerBalanceLedger"("sellerUserId", "status", "createdAt");

CREATE INDEX "SellerBalanceLedger_shopId_status_createdAt_idx"
ON "SellerBalanceLedger"("shopId", "status", "createdAt");

CREATE INDEX "SellerBalanceLedger_payoutId_idx"
ON "SellerBalanceLedger"("payoutId");

CREATE INDEX "SellerBalanceLedger_settlementId_idx"
ON "SellerBalanceLedger"("settlementId");

CREATE INDEX "SellerBalanceLedger_type_status_idx"
ON "SellerBalanceLedger"("type", "status");

ALTER TABLE "SellerPayout"
ADD CONSTRAINT "SellerPayout_sellerUserId_fkey"
FOREIGN KEY ("sellerUserId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "SellerPayout"
ADD CONSTRAINT "SellerPayout_shopId_fkey"
FOREIGN KEY ("shopId")
REFERENCES "PawnShop"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "SellerBalanceLedger"
ADD CONSTRAINT "SellerBalanceLedger_settlementId_fkey"
FOREIGN KEY ("settlementId")
REFERENCES "Settlement"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "SellerBalanceLedger"
ADD CONSTRAINT "SellerBalanceLedger_payoutId_fkey"
FOREIGN KEY ("payoutId")
REFERENCES "SellerPayout"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "SellerBalanceLedger"
ADD CONSTRAINT "SellerBalanceLedger_sellerUserId_fkey"
FOREIGN KEY ("sellerUserId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "SellerBalanceLedger"
ADD CONSTRAINT "SellerBalanceLedger_shopId_fkey"
FOREIGN KEY ("shopId")
REFERENCES "PawnShop"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

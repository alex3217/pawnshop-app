CREATE TYPE "StripeRefundStatus" AS ENUM ('REQUESTED', 'PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TYPE "StripeDisputeStatus" AS ENUM ('WARNING_NEEDS_RESPONSE', 'WARNING_UNDER_REVIEW', 'WARNING_CLOSED', 'NEEDS_RESPONSE', 'UNDER_REVIEW', 'WON', 'LOST', 'PREVENTED', 'UNKNOWN');
CREATE TYPE "StripeRecoveryRequirement" AS ENUM ('NONE', 'TRANSFER_REVERSAL_REQUIRED', 'PLATFORM_RECOVERY_REQUIRED');

ALTER TYPE "SettlementStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

DROP INDEX IF EXISTS "SellerBalanceLedger_settlementId_type_key";

ALTER TABLE "SellerBalanceLedger"
  ADD COLUMN "marketplaceTransactionId" TEXT,
  ADD COLUMN "refundId" TEXT,
  ADD COLUMN "disputeId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

UPDATE "SellerBalanceLedger"
SET "idempotencyKey" = 'settlement-credit:' || "settlementId"
WHERE "type" = 'SETTLEMENT_CREDIT' AND "settlementId" IS NOT NULL;

CREATE TABLE "StripeRefund" (
  "id" TEXT NOT NULL,
  "stripeRefundId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "settlementId" TEXT,
  "marketplaceTransactionId" TEXT,
  "paymentIntentId" TEXT NOT NULL,
  "chargeId" TEXT,
  "buyerUserId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "shopId" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "reason" TEXT NOT NULL,
  "stripeReason" TEXT,
  "status" "StripeRefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "transferAlreadySent" BOOLEAN NOT NULL DEFAULT false,
  "recoveryRequirement" "StripeRecoveryRequirement" NOT NULL DEFAULT 'NONE',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "succeededAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StripeRefund_target_check" CHECK (
    (("settlementId" IS NOT NULL)::int + ("marketplaceTransactionId" IS NOT NULL)::int) = 1
  ),
  CONSTRAINT "StripeRefund_amount_check" CHECK ("amountCents" > 0)
);

CREATE TABLE "StripeRefundAuditEvent" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "stripeEventId" TEXT,
  "actorUserId" TEXT,
  "reason" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeRefundAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeDispute" (
  "id" TEXT NOT NULL,
  "stripeDisputeId" TEXT NOT NULL,
  "settlementId" TEXT,
  "marketplaceTransactionId" TEXT,
  "paymentIntentId" TEXT,
  "chargeId" TEXT NOT NULL,
  "buyerUserId" TEXT,
  "sellerUserId" TEXT NOT NULL,
  "shopId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "reason" TEXT NOT NULL,
  "status" "StripeDisputeStatus" NOT NULL DEFAULT 'UNKNOWN',
  "fundsWithdrawn" BOOLEAN NOT NULL DEFAULT false,
  "fundsReinstated" BOOLEAN NOT NULL DEFAULT false,
  "transferAlreadySent" BOOLEAN NOT NULL DEFAULT false,
  "recoveryRequirement" "StripeRecoveryRequirement" NOT NULL DEFAULT 'NONE',
  "evidenceDueAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeDispute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StripeDispute_target_check" CHECK (
    (("settlementId" IS NOT NULL)::int + ("marketplaceTransactionId" IS NOT NULL)::int) = 1
  ),
  CONSTRAINT "StripeDispute_amount_check" CHECK ("amountCents" > 0)
);

CREATE TABLE "StripeDisputeEvent" (
  "id" TEXT NOT NULL,
  "disputeId" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeDisputeEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeRefund_stripeRefundId_key" ON "StripeRefund"("stripeRefundId");
CREATE UNIQUE INDEX "StripeRefund_idempotencyKey_key" ON "StripeRefund"("idempotencyKey");
CREATE INDEX "StripeRefund_settlementId_status_idx" ON "StripeRefund"("settlementId", "status");
CREATE INDEX "StripeRefund_marketplaceTransactionId_status_idx" ON "StripeRefund"("marketplaceTransactionId", "status");
CREATE INDEX "StripeRefund_paymentIntentId_idx" ON "StripeRefund"("paymentIntentId");
CREATE INDEX "StripeRefund_chargeId_idx" ON "StripeRefund"("chargeId");
CREATE INDEX "StripeRefund_buyerUserId_createdAt_idx" ON "StripeRefund"("buyerUserId", "createdAt");
CREATE INDEX "StripeRefund_sellerUserId_createdAt_idx" ON "StripeRefund"("sellerUserId", "createdAt");
CREATE INDEX "StripeRefund_shopId_createdAt_idx" ON "StripeRefund"("shopId", "createdAt");
CREATE UNIQUE INDEX "StripeRefundAuditEvent_stripeEventId_key" ON "StripeRefundAuditEvent"("stripeEventId");
CREATE INDEX "StripeRefundAuditEvent_refundId_createdAt_idx" ON "StripeRefundAuditEvent"("refundId", "createdAt");
CREATE INDEX "StripeRefundAuditEvent_actorUserId_createdAt_idx" ON "StripeRefundAuditEvent"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "StripeDispute_stripeDisputeId_key" ON "StripeDispute"("stripeDisputeId");
CREATE INDEX "StripeDispute_settlementId_status_idx" ON "StripeDispute"("settlementId", "status");
CREATE INDEX "StripeDispute_marketplaceTransactionId_status_idx" ON "StripeDispute"("marketplaceTransactionId", "status");
CREATE INDEX "StripeDispute_paymentIntentId_idx" ON "StripeDispute"("paymentIntentId");
CREATE INDEX "StripeDispute_chargeId_idx" ON "StripeDispute"("chargeId");
CREATE INDEX "StripeDispute_shopId_createdAt_idx" ON "StripeDispute"("shopId", "createdAt");
CREATE UNIQUE INDEX "StripeDisputeEvent_stripeEventId_key" ON "StripeDisputeEvent"("stripeEventId");
CREATE INDEX "StripeDisputeEvent_disputeId_createdAt_idx" ON "StripeDisputeEvent"("disputeId", "createdAt");
CREATE UNIQUE INDEX "SellerBalanceLedger_refundId_key" ON "SellerBalanceLedger"("refundId");
CREATE UNIQUE INDEX "SellerBalanceLedger_idempotencyKey_key" ON "SellerBalanceLedger"("idempotencyKey");
CREATE INDEX "SellerBalanceLedger_marketplaceTransactionId_idx" ON "SellerBalanceLedger"("marketplaceTransactionId");
CREATE INDEX "SellerBalanceLedger_disputeId_idx" ON "SellerBalanceLedger"("disputeId");

ALTER TABLE "StripeRefund" ADD CONSTRAINT "StripeRefund_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeRefund" ADD CONSTRAINT "StripeRefund_marketplaceTransactionId_fkey" FOREIGN KEY ("marketplaceTransactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeRefund" ADD CONSTRAINT "StripeRefund_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeRefund" ADD CONSTRAINT "StripeRefund_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeRefund" ADD CONSTRAINT "StripeRefund_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StripeRefund" ADD CONSTRAINT "StripeRefund_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeRefundAuditEvent" ADD CONSTRAINT "StripeRefundAuditEvent_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "StripeRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeRefundAuditEvent" ADD CONSTRAINT "StripeRefundAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StripeDispute" ADD CONSTRAINT "StripeDispute_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeDispute" ADD CONSTRAINT "StripeDispute_marketplaceTransactionId_fkey" FOREIGN KEY ("marketplaceTransactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeDispute" ADD CONSTRAINT "StripeDispute_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StripeDispute" ADD CONSTRAINT "StripeDispute_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeDispute" ADD CONSTRAINT "StripeDispute_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StripeDisputeEvent" ADD CONSTRAINT "StripeDisputeEvent_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "StripeDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerBalanceLedger" ADD CONSTRAINT "SellerBalanceLedger_marketplaceTransactionId_fkey" FOREIGN KEY ("marketplaceTransactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerBalanceLedger" ADD CONSTRAINT "SellerBalanceLedger_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "StripeRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SellerBalanceLedger" ADD CONSTRAINT "SellerBalanceLedger_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "StripeDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_financial_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StripeRefundAuditEvent_append_only_trigger"
BEFORE UPDATE OR DELETE ON "StripeRefundAuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_financial_audit_mutation();

CREATE TRIGGER "StripeDisputeEvent_append_only_trigger"
BEFORE UPDATE OR DELETE ON "StripeDisputeEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_financial_audit_mutation();

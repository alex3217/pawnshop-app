CREATE TYPE "BuyerItemSubmissionDistributionMode" AS ENUM ('ONE_SHOP', 'SELECTED_SHOPS', 'NEARBY_SHOPS', 'MARKETPLACE', 'SELECTED_SHOPS_AND_MARKETPLACE', 'NEARBY_SHOPS_AND_MARKETPLACE');
CREATE TYPE "BuyerItemSubmissionTargetStatus" AS ENUM ('PENDING', 'DELIVERED', 'VIEWED', 'RESPONDED', 'DECLINED', 'CLOSED');

ALTER TABLE "BuyerItemSubmission"
  ADD COLUMN "distributionMode" "BuyerItemSubmissionDistributionMode",
  ADD COLUMN "marketplaceListingId" TEXT,
  ADD COLUMN "distributionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3);

ALTER TABLE "BuyerItemSubmissionTarget"
  ADD COLUMN "status" "BuyerItemSubmissionTargetStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "viewedAt" TIMESTAMP(3),
  ADD COLUMN "respondedAt" TIMESTAMP(3),
  ADD COLUMN "declinedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closeReason" TEXT;

DROP INDEX "BuyerItemSubmissionTarget_shopId_createdAt_idx";
CREATE UNIQUE INDEX "BuyerItemSubmission_marketplaceListingId_key" ON "BuyerItemSubmission"("marketplaceListingId");
CREATE INDEX "BuyerItemSubmissionTarget_shopId_status_createdAt_idx" ON "BuyerItemSubmissionTarget"("shopId", "status", "createdAt");
CREATE INDEX "BuyerItemSubmissionTarget_submissionId_status_idx" ON "BuyerItemSubmissionTarget"("submissionId", "status");
CREATE UNIQUE INDEX "ShopConversation_buyerItemSubmissionTargetId_key" ON "ShopConversation"("buyerItemSubmissionTargetId");

CREATE TABLE "BuyerItemSubmissionAuditEvent" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "targetId" TEXT,
  "shopId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyerItemSubmissionAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuyerItemSubmissionAuditEvent_idempotencyKey_key" ON "BuyerItemSubmissionAuditEvent"("idempotencyKey");
CREATE INDEX "BuyerItemSubmissionAuditEvent_submissionId_createdAt_idx" ON "BuyerItemSubmissionAuditEvent"("submissionId", "createdAt");
CREATE INDEX "BuyerItemSubmissionAuditEvent_shopId_createdAt_idx" ON "BuyerItemSubmissionAuditEvent"("shopId", "createdAt");
CREATE INDEX "BuyerItemSubmissionAuditEvent_targetId_createdAt_idx" ON "BuyerItemSubmissionAuditEvent"("targetId", "createdAt");

ALTER TABLE "BuyerItemSubmission" ADD CONSTRAINT "BuyerItemSubmission_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionAuditEvent" ADD CONSTRAINT "BuyerItemSubmissionAuditEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionAuditEvent" ADD CONSTRAINT "BuyerItemSubmissionAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "BuyerItemSubmissionOffer_one_pending_per_shop_submission_key"
ON "BuyerItemSubmissionOffer"("submissionId", "shopId") WHERE "status" = 'PENDING';

CREATE FUNCTION "prevent_submission_audit_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BuyerItemSubmissionAuditEvent is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BuyerItemSubmissionAuditEvent_immutable"
BEFORE UPDATE ON "BuyerItemSubmissionAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_submission_audit_mutation"();

CREATE TYPE "BuyerItemSubmissionDistributionMode" AS ENUM ('ONE_SHOP', 'SELECTED_SHOPS', 'NEARBY_SHOPS', 'MARKETPLACE', 'SELECTED_SHOPS_AND_MARKETPLACE', 'NEARBY_SHOPS_AND_MARKETPLACE');
CREATE TYPE "BuyerItemSubmissionTargetStatus" AS ENUM ('PENDING', 'DELIVERED', 'VIEWED', 'RESPONDED', 'DECLINED', 'CLOSED');

ALTER TABLE "BuyerItemSubmission"
  ADD COLUMN "distributionMode" "BuyerItemSubmissionDistributionMode",
  ADD COLUMN "marketplaceListingId" TEXT,
  ADD COLUMN "distributionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "BuyerItemSubmission_marketplaceListingId_key" ON "BuyerItemSubmission"("marketplaceListingId");

CREATE TABLE "BuyerItemSubmissionTarget" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "status" "BuyerItemSubmissionTargetStatus" NOT NULL DEFAULT 'PENDING',
  "deliveredAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "closeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerItemSubmissionTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuyerItemSubmissionTarget_submissionId_shopId_key" ON "BuyerItemSubmissionTarget"("submissionId", "shopId");
CREATE INDEX "BuyerItemSubmissionTarget_shopId_status_createdAt_idx" ON "BuyerItemSubmissionTarget"("shopId", "status", "createdAt");
CREATE INDEX "BuyerItemSubmissionTarget_submissionId_status_idx" ON "BuyerItemSubmissionTarget"("submissionId", "status");

CREATE TABLE "BuyerItemSubmissionConversation" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerItemSubmissionConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuyerItemSubmissionConversation_targetId_key" ON "BuyerItemSubmissionConversation"("targetId");
CREATE UNIQUE INDEX "BuyerItemSubmissionConversation_submissionId_shopId_key" ON "BuyerItemSubmissionConversation"("submissionId", "shopId");
CREATE INDEX "BuyerItemSubmissionConversation_shopId_updatedAt_idx" ON "BuyerItemSubmissionConversation"("shopId", "updatedAt");

CREATE TABLE "BuyerItemSubmissionMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyerItemSubmissionMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BuyerItemSubmissionMessage_conversationId_createdAt_idx" ON "BuyerItemSubmissionMessage"("conversationId", "createdAt");
CREATE INDEX "BuyerItemSubmissionMessage_senderUserId_createdAt_idx" ON "BuyerItemSubmissionMessage"("senderUserId", "createdAt");

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
ALTER TABLE "BuyerItemSubmissionTarget" ADD CONSTRAINT "BuyerItemSubmissionTarget_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionTarget" ADD CONSTRAINT "BuyerItemSubmissionTarget_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionConversation" ADD CONSTRAINT "BuyerItemSubmissionConversation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionConversation" ADD CONSTRAINT "BuyerItemSubmissionConversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionConversation" ADD CONSTRAINT "BuyerItemSubmissionConversation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "BuyerItemSubmissionTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionMessage" ADD CONSTRAINT "BuyerItemSubmissionMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "BuyerItemSubmissionConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionMessage" ADD CONSTRAINT "BuyerItemSubmissionMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionAuditEvent" ADD CONSTRAINT "BuyerItemSubmissionAuditEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionAuditEvent" ADD CONSTRAINT "BuyerItemSubmissionAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Monetary offers are one active response per shop/submission in V1.
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

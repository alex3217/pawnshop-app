-- Seller-to-pawnshop messaging V1. Every conversation has exactly one shop.
ALTER TABLE "PawnShop"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "ShopConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'BLOCKED');
CREATE TYPE "ShopContactReason" AS ENUM ('SELL_ITEM', 'PAWN_ITEM', 'INVENTORY', 'OFFER', 'VISIT', 'OTHER');

CREATE TABLE "BuyerItemSubmissionTarget" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerItemSubmissionTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopConversation" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "contactReason" "ShopContactReason" NOT NULL,
  "buyerItemSubmissionId" TEXT,
  "buyerItemSubmissionTargetId" TEXT,
  "marketplaceListingId" TEXT,
  "itemId" TEXT,
  "offerId" TEXT,
  "status" "ShopConversationStatus" NOT NULL DEFAULT 'OPEN',
  "sellerLastReadAt" TIMESTAMP(3),
  "shopLastReadAt" TIMESTAMP(3),
  "blockedByUserId" TEXT,
  "blockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "systemMetadata" JSONB,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopConversationAuditEvent" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopConversationAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerItemSubmissionTarget_submissionId_shopId_key" ON "BuyerItemSubmissionTarget"("submissionId", "shopId");
CREATE INDEX "BuyerItemSubmissionTarget_shopId_createdAt_idx" ON "BuyerItemSubmissionTarget"("shopId", "createdAt");
CREATE INDEX "ShopConversation_sellerUserId_status_updatedAt_idx" ON "ShopConversation"("sellerUserId", "status", "updatedAt");
CREATE INDEX "ShopConversation_shopId_status_updatedAt_idx" ON "ShopConversation"("shopId", "status", "updatedAt");
CREATE INDEX "ShopConversation_shopId_sellerUserId_updatedAt_idx" ON "ShopConversation"("shopId", "sellerUserId", "updatedAt");
CREATE UNIQUE INDEX "ShopMessage_conversationId_senderUserId_idempotencyKey_key" ON "ShopMessage"("conversationId", "senderUserId", "idempotencyKey");
CREATE INDEX "ShopMessage_conversationId_createdAt_id_idx" ON "ShopMessage"("conversationId", "createdAt", "id");
CREATE INDEX "ShopMessage_senderUserId_createdAt_idx" ON "ShopMessage"("senderUserId", "createdAt");
CREATE INDEX "ShopConversationAuditEvent_conversationId_createdAt_idx" ON "ShopConversationAuditEvent"("conversationId", "createdAt");
CREATE INDEX "ShopConversationAuditEvent_actorUserId_createdAt_idx" ON "ShopConversationAuditEvent"("actorUserId", "createdAt");
CREATE INDEX "ShopConversationAuditEvent_action_createdAt_idx" ON "ShopConversationAuditEvent"("action", "createdAt");
CREATE INDEX "PawnShop_isDeleted_isActive_isPublic_createdAt_idx" ON "PawnShop"("isDeleted", "isActive", "isPublic", "createdAt");
DROP INDEX IF EXISTS "PawnShop_isDeleted_createdAt_idx";

ALTER TABLE "BuyerItemSubmissionTarget" ADD CONSTRAINT "BuyerItemSubmissionTarget_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerItemSubmissionTarget" ADD CONSTRAINT "BuyerItemSubmissionTarget_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_buyerItemSubmissionId_fkey" FOREIGN KEY ("buyerItemSubmissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_buyerItemSubmissionTargetId_fkey" FOREIGN KEY ("buyerItemSubmissionTargetId") REFERENCES "BuyerItemSubmissionTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopMessage" ADD CONSTRAINT "ShopMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ShopConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopMessage" ADD CONSTRAINT "ShopMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopConversationAuditEvent" ADD CONSTRAINT "ShopConversationAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ShopConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopConversationAuditEvent" ADD CONSTRAINT "ShopConversationAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve explicit granular access while enabling messaging for operational
-- staff roles that receive it by default. Read-only viewers receive read only.
UPDATE "Staff" SET "permissions" = array_append("permissions", 'messages:read')
WHERE "role" IN ('SHOP_ADMIN', 'SHOP_MANAGER', 'SHOP_STAFF', 'SHOP_VIEWER', 'INVENTORY_MANAGER', 'SALES_ASSOCIATE')
  AND NOT ('messages:read' = ANY("permissions"));
UPDATE "Staff" SET "permissions" = array_append("permissions", 'messages:write')
WHERE "role" IN ('SHOP_ADMIN', 'SHOP_MANAGER', 'SHOP_STAFF', 'INVENTORY_MANAGER', 'SALES_ASSOCIATE')
  AND NOT ('messages:write' = ANY("permissions"));

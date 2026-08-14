-- Additive shop-originated messaging support. Reversible with the statements below in reverse order.
ALTER TABLE "User" ADD COLUMN "publicMessageIdentifier" TEXT;
UPDATE "User" SET "publicMessageIdentifier" = 'member-' || substr(md5("id"), 1, 12);
ALTER TABLE "User" ALTER COLUMN "publicMessageIdentifier" SET NOT NULL;
CREATE UNIQUE INDEX "User_publicMessageIdentifier_key" ON "User"("publicMessageIdentifier");

ALTER TABLE "PawnShop" ADD COLUMN "publicMessageIdentifier" TEXT;
UPDATE "PawnShop" SET "publicMessageIdentifier" = 'shop-' || substr(md5("id"), 1, 12);
ALTER TABLE "PawnShop" ALTER COLUMN "publicMessageIdentifier" SET NOT NULL;
CREATE UNIQUE INDEX "PawnShop_publicMessageIdentifier_key" ON "PawnShop"("publicMessageIdentifier");

ALTER TABLE "ShopConversation"
  ADD COLUMN "recipientShopId" TEXT,
  ADD COLUMN "initiatedByShopId" TEXT,
  ADD COLUMN "contextType" TEXT,
  ADD COLUMN "contextReferenceId" TEXT;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_recipientShopId_fkey" FOREIGN KEY ("recipientShopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ShopConversation_recipientShopId_status_updatedAt_idx" ON "ShopConversation"("recipientShopId", "status", "updatedAt");
CREATE INDEX "ShopConversation_shopId_sellerUserId_contextType_contextReferenceId_idx" ON "ShopConversation"("shopId", "sellerUserId", "contextType", "contextReferenceId");
CREATE UNIQUE INDEX "ShopMessage_senderUserId_idempotencyKey_key" ON "ShopMessage"("senderUserId", "idempotencyKey");

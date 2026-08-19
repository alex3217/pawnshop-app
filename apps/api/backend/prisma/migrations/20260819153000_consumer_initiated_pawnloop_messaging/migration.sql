-- Consumer-initiated PawnLoop messaging. Additive and safe for the existing
-- shop messaging application; no existing column or constraint is changed.
ALTER TABLE "User"
  ADD COLUMN "sellerDiscoverable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowMarketplaceFirstContact" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ShopConversation"
  ALTER COLUMN "shopId" DROP NOT NULL,
  ADD COLUMN "recipientUserId" TEXT,
  ADD COLUMN "sellerMutedAt" TIMESTAMP(3),
  ADD COLUMN "recipientMutedAt" TIMESTAMP(3),
  ADD COLUMN "sellerArchivedAt" TIMESTAMP(3),
  ADD COLUMN "recipientArchivedAt" TIMESTAMP(3);

ALTER TABLE "ShopConversation"
  ADD CONSTRAINT "ShopConversation_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ShopConversation_recipientUserId_status_updatedAt_idx"
  ON "ShopConversation"("recipientUserId", "status", "updatedAt");
CREATE INDEX "ShopConversation_sellerUserId_recipientUserId_contextType_contextReferenceId_idx"
  ON "ShopConversation"("sellerUserId", "recipientUserId", "contextType", "contextReferenceId");

ALTER TABLE "User"
  ADD COLUMN "publicDisplayName" TEXT,
  ADD COLUMN "messageDiscoverable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowShopFirstContact" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowTransactionalMessages" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "BuyerMessagingShopBlock" (
  "id" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyerMessagingShopBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuyerMessagingShopBlock_buyerUserId_shopId_key" ON "BuyerMessagingShopBlock"("buyerUserId", "shopId");
CREATE INDEX "BuyerMessagingShopBlock_shopId_createdAt_idx" ON "BuyerMessagingShopBlock"("shopId", "createdAt");
ALTER TABLE "BuyerMessagingShopBlock" ADD CONSTRAINT "BuyerMessagingShopBlock_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerMessagingShopBlock" ADD CONSTRAINT "BuyerMessagingShopBlock_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerMessagingShopBlock" ADD CONSTRAINT "BuyerMessagingShopBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BuyerMessagingProfileAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyerMessagingProfileAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BuyerMessagingProfileAudit_userId_createdAt_idx" ON "BuyerMessagingProfileAudit"("userId", "createdAt");
CREATE INDEX "BuyerMessagingProfileAudit_action_createdAt_idx" ON "BuyerMessagingProfileAudit"("action", "createdAt");
ALTER TABLE "BuyerMessagingProfileAudit" ADD CONSTRAINT "BuyerMessagingProfileAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

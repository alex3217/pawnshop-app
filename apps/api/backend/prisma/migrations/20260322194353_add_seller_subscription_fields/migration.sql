-- AlterTable
ALTER TABLE "public"."PawnShop" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "subscriptionPlan" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Auction_status_startsAt_idx" ON "public"."Auction"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Auction_createdAt_idx" ON "public"."Auction"("createdAt");

-- CreateIndex
CREATE INDEX "Bid_auctionId_createdAt_idx" ON "public"."Bid"("auctionId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_itemId_createdAt_idx" ON "public"."Inquiry"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_consumerEmail_idx" ON "public"."Inquiry"("consumerEmail");

-- CreateIndex
CREATE INDEX "Item_pawnShopId_status_isDeleted_idx" ON "public"."Item"("pawnShopId", "status", "isDeleted");

-- CreateIndex
CREATE INDEX "Item_category_status_isDeleted_idx" ON "public"."Item"("category", "status", "isDeleted");

-- CreateIndex
CREATE INDEX "Item_createdAt_idx" ON "public"."Item"("createdAt");

-- CreateIndex
CREATE INDEX "PawnShop_ownerId_isDeleted_idx" ON "public"."PawnShop"("ownerId", "isDeleted");

-- CreateIndex
CREATE INDEX "PawnShop_isDeleted_createdAt_idx" ON "public"."PawnShop"("isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "Settlement_winnerUserId_status_idx" ON "public"."Settlement"("winnerUserId", "status");

-- CreateIndex
CREATE INDEX "Settlement_createdAt_idx" ON "public"."Settlement"("createdAt");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "public"."User"("role", "isActive");

-- AddForeignKey
ALTER TABLE "public"."Settlement" ADD CONSTRAINT "Settlement_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "MarketplaceListingType" AS ENUM ('CUSTOMER_TO_CUSTOMER', 'CUSTOMER_TO_SHOP', 'SHOP_TO_CUSTOMER', 'SHOP_TO_SHOP');

-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RESERVED', 'SOLD', 'PAUSED', 'EXPIRED', 'CANCELED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MarketplaceTransactionType" AS ENUM ('DIRECT_PURCHASE', 'ACCEPTED_OFFER', 'DEALER_TRANSFER', 'CUSTOMER_SELL_TO_SHOP');

-- CreateEnum
CREATE TYPE "MarketplaceTransactionStatus" AS ENUM ('PENDING', 'PAYMENT_PROCESSING', 'PAID', 'FULFILLING', 'COMPLETED', 'CANCELED', 'REFUNDED', 'DISPUTED');

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "sellerUserId" TEXT NOT NULL,
    "sellerShopId" TEXT,
    "listingType" "MarketplaceListingType" NOT NULL,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "condition" TEXT,
    "price" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowOffers" BOOLEAN NOT NULL DEFAULT true,
    "pickupAvailable" BOOLEAN NOT NULL DEFAULT true,
    "shippingAvailable" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceTransaction" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "buyerShopId" TEXT,
    "sellerUserId" TEXT NOT NULL,
    "sellerShopId" TEXT,
    "type" "MarketplaceTransactionType" NOT NULL,
    "status" "MarketplaceTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentIntentId" TEXT,
    "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerUserId_status_createdAt_idx" ON "MarketplaceListing"("sellerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerShopId_status_createdAt_idx" ON "MarketplaceListing"("sellerShopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_listingType_status_createdAt_idx" ON "MarketplaceListing"("listingType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_category_status_createdAt_idx" ON "MarketplaceListing"("category", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_publishedAt_idx" ON "MarketplaceListing"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_featuredUntil_idx" ON "MarketplaceListing"("featuredUntil");

-- CreateIndex
CREATE INDEX "MarketplaceListing_itemId_idx" ON "MarketplaceListing"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceTransaction_paymentIntentId_key" ON "MarketplaceTransaction"("paymentIntentId");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_listingId_status_idx" ON "MarketplaceTransaction"("listingId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_buyerUserId_status_createdAt_idx" ON "MarketplaceTransaction"("buyerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_sellerUserId_status_createdAt_idx" ON "MarketplaceTransaction"("sellerUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_buyerShopId_status_createdAt_idx" ON "MarketplaceTransaction"("buyerShopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_sellerShopId_status_createdAt_idx" ON "MarketplaceTransaction"("sellerShopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_type_status_createdAt_idx" ON "MarketplaceTransaction"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_createdAt_idx" ON "MarketplaceTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_sellerShopId_fkey" FOREIGN KEY ("sellerShopId") REFERENCES "PawnShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_buyerShopId_fkey" FOREIGN KEY ("buyerShopId") REFERENCES "PawnShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceTransaction" ADD CONSTRAINT "MarketplaceTransaction_sellerShopId_fkey" FOREIGN KEY ("sellerShopId") REFERENCES "PawnShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

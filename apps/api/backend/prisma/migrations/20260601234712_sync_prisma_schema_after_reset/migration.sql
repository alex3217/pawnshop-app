/*
  Warnings:

  - The values [MANAGER,STAFF,CASHIER,INVENTORY,AUCTION,VIEWER] on the enum `StaffRole` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `PawnShop` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripePaymentIntent]` on the table `Settlement` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BuyerSubscriptionPlan" AS ENUM ('FREE', 'PLUS', 'PREMIUM', 'ULTRA');

-- CreateEnum
CREATE TYPE "BuyerSubscriptionStatus" AS ENUM ('UNKNOWN', 'ACTIVE', 'TRIALING', 'PAST_DUE', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'CANCELED', 'PAUSED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "InventoryImportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'CANCELED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SettlementStatus" ADD VALUE 'CANCELED';
ALTER TYPE "SettlementStatus" ADD VALUE 'REFUNDED';

-- AlterEnum
BEGIN;
CREATE TYPE "StaffRole_new" AS ENUM ('SHOP_ADMIN', 'SHOP_MANAGER', 'SHOP_STAFF', 'SHOP_VIEWER', 'INVENTORY_MANAGER', 'AUCTION_MANAGER', 'SALES_ASSOCIATE', 'FINANCE_VIEWER');
ALTER TABLE "public"."Staff" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Staff" ALTER COLUMN "role" TYPE "StaffRole_new" USING ("role"::text::"StaffRole_new");
ALTER TYPE "StaffRole" RENAME TO "StaffRole_old";
ALTER TYPE "StaffRole_new" RENAME TO "StaffRole";
DROP TYPE "public"."StaffRole_old";
ALTER TABLE "Staff" ALTER COLUMN "role" SET DEFAULT 'SHOP_STAFF';
COMMIT;

-- AlterTable
ALTER TABLE "AutoBid" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExternalInventoryMapping" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InventoryFieldMapping" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InventoryIntegration" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InventorySyncJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "PawnShop" ADD COLUMN     "stripeCheckoutSessionId" TEXT,
ADD COLUMN     "stripeLatestInvoiceId" TEXT,
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "subscriptionBillingInterval" "BillingInterval",
ADD COLUMN     "subscriptionCanceledAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "chargedAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureMessage" TEXT;

-- AlterTable
ALTER TABLE "Staff" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "BuyerSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "BuyerSubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "BuyerSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingInterval" "BillingInterval",
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "stripeLatestInvoiceId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "message" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "counterAmount" DECIMAL(10,2),
    "counterMessage" TEXT,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerItemSubmission" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "condition" TEXT,
    "estimatedValue" DECIMAL(10,2),
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "intent" TEXT NOT NULL DEFAULT 'PAWN_OFFERS',
    "radiusMiles" INTEGER NOT NULL DEFAULT 25,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewMessage" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerItemSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerItemSubmissionOffer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerItemSubmissionOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" "InventoryImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuyerSubscription_userId_key" ON "BuyerSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerSubscription_stripeSubscriptionId_key" ON "BuyerSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "BuyerSubscription_plan_status_idx" ON "BuyerSubscription"("plan", "status");

-- CreateIndex
CREATE INDEX "BuyerSubscription_status_currentPeriodEnd_idx" ON "BuyerSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "BuyerSubscription_createdAt_idx" ON "BuyerSubscription"("createdAt");

-- CreateIndex
CREATE INDEX "Offer_buyerId_createdAt_idx" ON "Offer"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_ownerId_createdAt_idx" ON "Offer"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_itemId_status_idx" ON "Offer"("itemId", "status");

-- CreateIndex
CREATE INDEX "Watchlist_userId_createdAt_idx" ON "Watchlist"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Watchlist_itemId_idx" ON "Watchlist"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_itemId_key" ON "Watchlist"("userId", "itemId");

-- CreateIndex
CREATE INDEX "SavedSearch_userId_createdAt_idx" ON "SavedSearch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerItemSubmission_buyerId_createdAt_idx" ON "BuyerItemSubmission"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerItemSubmission_status_createdAt_idx" ON "BuyerItemSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerItemSubmission_intent_status_idx" ON "BuyerItemSubmission"("intent", "status");

-- CreateIndex
CREATE INDEX "BuyerItemSubmissionOffer_submissionId_status_idx" ON "BuyerItemSubmissionOffer"("submissionId", "status");

-- CreateIndex
CREATE INDEX "BuyerItemSubmissionOffer_shopId_createdAt_idx" ON "BuyerItemSubmissionOffer"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerItemSubmissionOffer_ownerId_createdAt_idx" ON "BuyerItemSubmissionOffer"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerItemSubmissionOffer_status_createdAt_idx" ON "BuyerItemSubmissionOffer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryImportJob_userId_createdAt_idx" ON "InventoryImportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryImportJob_shopId_createdAt_idx" ON "InventoryImportJob"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");

-- CreateIndex
CREATE INDEX "PlatformSetting_key_idx" ON "PlatformSetting"("key");

-- CreateIndex
CREATE INDEX "PlatformSetting_updatedByUserId_idx" ON "PlatformSetting"("updatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PawnShop_stripeSubscriptionId_key" ON "PawnShop"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "PawnShop_subscriptionPlan_subscriptionStatus_idx" ON "PawnShop"("subscriptionPlan", "subscriptionStatus");

-- CreateIndex
CREATE INDEX "PawnShop_subscriptionStatus_subscriptionCurrentPeriodEnd_idx" ON "PawnShop"("subscriptionStatus", "subscriptionCurrentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_stripePaymentIntent_key" ON "Settlement"("stripePaymentIntent");

-- CreateIndex
CREATE INDEX "Settlement_status_createdAt_idx" ON "Settlement"("status", "createdAt");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- AddForeignKey
ALTER TABLE "BuyerSubscription" ADD CONSTRAINT "BuyerSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerItemSubmission" ADD CONSTRAINT "BuyerItemSubmission_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerItemSubmissionOffer" ADD CONSTRAINT "BuyerItemSubmissionOffer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerItemSubmissionOffer" ADD CONSTRAINT "BuyerItemSubmissionOffer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerItemSubmissionOffer" ADD CONSTRAINT "BuyerItemSubmissionOffer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryImportJob" ADD CONSTRAINT "InventoryImportJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryImportJob" ADD CONSTRAINT "InventoryImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSetting" ADD CONSTRAINT "PlatformSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "InventoryFieldMapping_integrationId_externalField_internalField" RENAME TO "InventoryFieldMapping_integrationId_externalField_internalF_key";

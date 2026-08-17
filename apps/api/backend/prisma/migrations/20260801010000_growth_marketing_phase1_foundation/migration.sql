-- Phase 1 owner marketing foundation. Existing Growth Center tables are reused unchanged.
ALTER TABLE "PawnShop" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "PawnShop_slug_key" ON "PawnShop"("slug");

CREATE TYPE "ShopMarketingDestinationType" AS ENUM (
  'STOREFRONT',
  'INVENTORY',
  'NEW_ARRIVALS',
  'AUCTIONS',
  'DEALS',
  'ITEM',
  'CATEGORY',
  'SELL_ITEM',
  'PAWN_INQUIRY',
  'FOLLOW_SHOP',
  'REVIEW_REQUEST',
  'CUSTOMER_REGISTRATION',
  'BUYER_REFERRAL',
  'PAWNSHOP_REFERRAL'
);

CREATE TABLE "ShopMarketingCampaign" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortCode" TEXT NOT NULL,
  "destinationType" "ShopMarketingDestinationType" NOT NULL DEFAULT 'STOREFRONT',
  "resourceId" TEXT,
  "placementLabel" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopMarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopMarketingCampaignScan" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referrerHost" TEXT,
  "userAgentClass" TEXT,
  CONSTRAINT "ShopMarketingCampaignScan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopMarketingCampaign_shortCode_key" ON "ShopMarketingCampaign"("shortCode");
CREATE INDEX "ShopMarketingCampaign_shopId_isActive_idx" ON "ShopMarketingCampaign"("shopId", "isActive");
CREATE INDEX "ShopMarketingCampaign_shopId_createdAt_idx" ON "ShopMarketingCampaign"("shopId", "createdAt");
CREATE INDEX "ShopMarketingCampaignScan_campaignId_occurredAt_idx" ON "ShopMarketingCampaignScan"("campaignId", "occurredAt");

ALTER TABLE "ShopMarketingCampaign" ADD CONSTRAINT "ShopMarketingCampaign_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopMarketingCampaignScan" ADD CONSTRAINT "ShopMarketingCampaignScan_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "ShopMarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

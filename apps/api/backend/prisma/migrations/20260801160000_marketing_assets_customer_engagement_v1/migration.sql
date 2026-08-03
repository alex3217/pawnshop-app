-- Marketing Assets & Customer Engagement V1.
-- Nondestructive foundation only; generated assets remain on demand.
CREATE TABLE "ShopFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FOLLOWING',
    "newArrivalNotifications" BOOLEAN NOT NULL DEFAULT false,
    "dealNotifications" BOOLEAN NOT NULL DEFAULT false,
    "auctionNotifications" BOOLEAN NOT NULL DEFAULT false,
    "generalShopNotifications" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopFollow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "shopId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralAttribution" (
    "id" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "attributedUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopFollow_userId_shopId_key" ON "ShopFollow"("userId", "shopId");
CREATE INDEX "ShopFollow_shopId_status_idx" ON "ShopFollow"("shopId", "status");
CREATE INDEX "ShopFollow_userId_status_updatedAt_idx" ON "ShopFollow"("userId", "status", "updatedAt");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE UNIQUE INDEX "ReferralCode_ownerUserId_type_key" ON "ReferralCode"("ownerUserId", "type");
CREATE UNIQUE INDEX "ReferralCode_shopId_type_key" ON "ReferralCode"("shopId", "type");
CREATE INDEX "ReferralCode_type_isActive_idx" ON "ReferralCode"("type", "isActive");
CREATE UNIQUE INDEX "ReferralAttribution_eventKey_key" ON "ReferralAttribution"("eventKey");
CREATE INDEX "ReferralAttribution_referralCodeId_eventType_occurredAt_idx" ON "ReferralAttribution"("referralCodeId", "eventType", "occurredAt");
CREATE INDEX "ReferralAttribution_attributedUserId_occurredAt_idx" ON "ReferralAttribution"("attributedUserId", "occurredAt");

ALTER TABLE "ShopFollow" ADD CONSTRAINT "ShopFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopFollow" ADD CONSTRAINT "ShopFollow_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_attributedUserId_fkey" FOREIGN KEY ("attributedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

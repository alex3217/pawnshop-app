CREATE TABLE "BuyerPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phone" TEXT,
  "locationLabel" TEXT,
  "searchRadiusMiles" INTEGER NOT NULL DEFAULT 25,
  "savedSearchNotifications" BOOLEAN NOT NULL DEFAULT true,
  "priceDropAlerts" BOOLEAN NOT NULL DEFAULT true,
  "auctionAlerts" BOOLEAN NOT NULL DEFAULT true,
  "followedShopAlerts" BOOLEAN NOT NULL DEFAULT true,
  "marketingCommunications" BOOLEAN NOT NULL DEFAULT false,
  "recentlyViewedEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuyerPreference_userId_key" ON "BuyerPreference"("userId");
CREATE INDEX "BuyerPreference_updatedAt_idx" ON "BuyerPreference"("updatedAt");
ALTER TABLE "BuyerPreference" ADD CONSTRAINT "BuyerPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

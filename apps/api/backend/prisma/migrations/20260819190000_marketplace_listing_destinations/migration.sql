ALTER TABLE "MarketplaceListing"
ADD COLUMN "destinationUserId" TEXT,
ADD COLUMN "destinationShopId" TEXT;

ALTER TABLE "MarketplaceListing"
ADD CONSTRAINT "MarketplaceListing_destinationUserId_fkey"
FOREIGN KEY ("destinationUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListing"
ADD CONSTRAINT "MarketplaceListing_destinationShopId_fkey"
FOREIGN KEY ("destinationShopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "MarketplaceListing_destinationUserId_status_createdAt_idx"
ON "MarketplaceListing"("destinationUserId", "status", "createdAt");

CREATE INDEX "MarketplaceListing_destinationShopId_status_createdAt_idx"
ON "MarketplaceListing"("destinationShopId", "status", "createdAt");

ALTER TABLE "MarketplaceListing"
ADD CONSTRAINT "MarketplaceListing_destination_type_check" CHECK (
  ("listingType" = 'CUSTOMER_TO_CUSTOMER' AND "destinationShopId" IS NULL)
  OR ("listingType" = 'CUSTOMER_TO_SHOP' AND "destinationUserId" IS NULL AND "destinationShopId" IS NOT NULL)
  OR ("listingType" IN ('SHOP_TO_CUSTOMER', 'SHOP_TO_SHOP') AND "destinationUserId" IS NULL AND "destinationShopId" IS NULL)
) NOT VALID;

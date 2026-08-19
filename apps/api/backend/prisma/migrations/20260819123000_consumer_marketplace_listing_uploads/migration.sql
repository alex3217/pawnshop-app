ALTER TABLE "UploadAsset"
  ALTER COLUMN "shopId" DROP NOT NULL,
  ADD COLUMN "marketplaceListingId" TEXT;

CREATE INDEX "UploadAsset_marketplaceListingId_status_idx"
  ON "UploadAsset"("marketplaceListingId", "status");

ALTER TABLE "UploadAsset"
  ADD CONSTRAINT "UploadAsset_marketplaceListingId_fkey"
  FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

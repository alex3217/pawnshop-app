CREATE TYPE "UploadAssetStatus" AS ENUM ('TEMPORARY', 'ATTACHED', 'DELETE_PENDING', 'DELETED');

CREATE TABLE "UploadAsset" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "deliveryUrl" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" "UploadAssetStatus" NOT NULL DEFAULT 'TEMPORARY',
  "uploaderId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "itemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "attachedAt" TIMESTAMP(3),
  "deleteAfter" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "UploadAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadAsset_objectKey_key" ON "UploadAsset"("objectKey");
CREATE UNIQUE INDEX "UploadAsset_deliveryUrl_key" ON "UploadAsset"("deliveryUrl");
CREATE INDEX "UploadAsset_shopId_status_createdAt_idx" ON "UploadAsset"("shopId", "status", "createdAt");
CREATE INDEX "UploadAsset_uploaderId_status_createdAt_idx" ON "UploadAsset"("uploaderId", "status", "createdAt");
CREATE INDEX "UploadAsset_itemId_status_idx" ON "UploadAsset"("itemId", "status");
CREATE INDEX "UploadAsset_status_deleteAfter_idx" ON "UploadAsset"("status", "deleteAfter");

ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

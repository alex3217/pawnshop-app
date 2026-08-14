-- Additive, audited Super Admin inventory support.
CREATE TYPE "InventoryAvailability" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'PAWNED', 'LAYAWAY', 'UNAVAILABLE', 'ARCHIVED');

ALTER TABLE "Item"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "barcode" TEXT,
  ADD COLUMN "serialNumber" TEXT,
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cost" DECIMAL(10,2),
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "availability" "InventoryAvailability" NOT NULL DEFAULT 'AVAILABLE',
  ADD CONSTRAINT "Item_quantity_nonnegative" CHECK ("quantity" >= 0);

CREATE TABLE "InventoryLocation" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLocation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InventorySupportSession" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "InventorySupportSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventorySupportSession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventorySupportSession_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InventoryAdminEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "itemId" TEXT,
  "actorId" TEXT NOT NULL,
  "supportSessionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestId" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryAdminEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryAdminEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdminEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdminEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdminEvent_supportSessionId_fkey" FOREIGN KEY ("supportSessionId") REFERENCES "InventorySupportSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryLocation_shopId_name_key" ON "InventoryLocation"("shopId", "name");
CREATE INDEX "InventoryLocation_shopId_isArchived_idx" ON "InventoryLocation"("shopId", "isArchived");
CREATE INDEX "InventorySupportSession_actorId_endedAt_startedAt_idx" ON "InventorySupportSession"("actorId", "endedAt", "startedAt");
CREATE INDEX "InventorySupportSession_shopId_startedAt_idx" ON "InventorySupportSession"("shopId", "startedAt");
CREATE UNIQUE INDEX "InventorySupportSession_actorId_active_key" ON "InventorySupportSession"("actorId") WHERE "endedAt" IS NULL;
CREATE INDEX "InventoryAdminEvent_shopId_createdAt_idx" ON "InventoryAdminEvent"("shopId", "createdAt");
CREATE INDEX "InventoryAdminEvent_itemId_createdAt_idx" ON "InventoryAdminEvent"("itemId", "createdAt");
CREATE INDEX "InventoryAdminEvent_supportSessionId_createdAt_idx" ON "InventoryAdminEvent"("supportSessionId", "createdAt");
CREATE INDEX "Item_pawnShopId_sku_idx" ON "Item"("pawnShopId", "sku");
CREATE INDEX "Item_pawnShopId_barcode_idx" ON "Item"("pawnShopId", "barcode");
CREATE INDEX "Item_pawnShopId_serialNumber_idx" ON "Item"("pawnShopId", "serialNumber");
CREATE INDEX "Item_locationId_availability_idx" ON "Item"("locationId", "availability");
ALTER TABLE "Item" ADD CONSTRAINT "Item_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

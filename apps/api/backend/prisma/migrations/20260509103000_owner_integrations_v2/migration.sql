-- Owner Integrations v2 backend models

CREATE TABLE IF NOT EXISTS "public"."InventoryIntegration" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'CSV_UPLOAD',
  "provider" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEEDS_SETUP',
  "baseUrl" TEXT,
  "inventoryEndpoint" TEXT,
  "authType" TEXT NOT NULL DEFAULT 'NONE',
  "credentialHint" TEXT,
  "syncFrequencyMinutes" INTEGER,
  "lastSyncAt" TIMESTAMP(3),
  "nextSyncAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryIntegration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."InventorySyncJob" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventorySyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ExternalInventoryMapping" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "itemId" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalInventoryMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."InventoryFieldMapping" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "externalField" TEXT NOT NULL,
  "internalField" TEXT NOT NULL,
  "transformRule" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryFieldMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."IntegrationWebhookEvent" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "signatureValid" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryIntegration_ownerId_createdAt_idx"
  ON "public"."InventoryIntegration"("ownerId", "createdAt");

CREATE INDEX IF NOT EXISTS "InventoryIntegration_shopId_status_idx"
  ON "public"."InventoryIntegration"("shopId", "status");

CREATE INDEX IF NOT EXISTS "InventoryIntegration_type_status_idx"
  ON "public"."InventoryIntegration"("type", "status");

CREATE INDEX IF NOT EXISTS "InventorySyncJob_integrationId_createdAt_idx"
  ON "public"."InventorySyncJob"("integrationId", "createdAt");

CREATE INDEX IF NOT EXISTS "InventorySyncJob_shopId_createdAt_idx"
  ON "public"."InventorySyncJob"("shopId", "createdAt");

CREATE INDEX IF NOT EXISTS "InventorySyncJob_status_createdAt_idx"
  ON "public"."InventorySyncJob"("status", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalInventoryMapping_integrationId_externalId_key"
  ON "public"."ExternalInventoryMapping"("integrationId", "externalId");

CREATE INDEX IF NOT EXISTS "ExternalInventoryMapping_itemId_idx"
  ON "public"."ExternalInventoryMapping"("itemId");

CREATE INDEX IF NOT EXISTS "ExternalInventoryMapping_lastSeenAt_idx"
  ON "public"."ExternalInventoryMapping"("lastSeenAt");

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryFieldMapping_integrationId_externalField_internalField_key"
  ON "public"."InventoryFieldMapping"("integrationId", "externalField", "internalField");

CREATE INDEX IF NOT EXISTS "InventoryFieldMapping_integrationId_idx"
  ON "public"."InventoryFieldMapping"("integrationId");

CREATE INDEX IF NOT EXISTS "IntegrationWebhookEvent_integrationId_createdAt_idx"
  ON "public"."IntegrationWebhookEvent"("integrationId", "createdAt");

CREATE INDEX IF NOT EXISTS "IntegrationWebhookEvent_status_createdAt_idx"
  ON "public"."IntegrationWebhookEvent"("status", "createdAt");

ALTER TABLE "public"."InventoryIntegration"
  ADD CONSTRAINT "InventoryIntegration_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."InventoryIntegration"
  ADD CONSTRAINT "InventoryIntegration_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "public"."PawnShop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."InventorySyncJob"
  ADD CONSTRAINT "InventorySyncJob_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "public"."InventoryIntegration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."InventorySyncJob"
  ADD CONSTRAINT "InventorySyncJob_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "public"."PawnShop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ExternalInventoryMapping"
  ADD CONSTRAINT "ExternalInventoryMapping_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "public"."InventoryIntegration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."InventoryFieldMapping"
  ADD CONSTRAINT "InventoryFieldMapping_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "public"."InventoryIntegration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."IntegrationWebhookEvent"
  ADD CONSTRAINT "IntegrationWebhookEvent_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "public"."InventoryIntegration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

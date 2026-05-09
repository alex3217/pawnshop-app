ALTER TABLE "public"."InventoryIntegration"
  ADD COLUMN IF NOT EXISTS "encryptedCredentials" JSONB;

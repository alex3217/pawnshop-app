ALTER TABLE "SuperAdminAuditLog"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "SuperAdminAuditLog_idempotencyKey_key"
ON "SuperAdminAuditLog"("idempotencyKey");

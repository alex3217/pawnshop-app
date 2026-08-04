ALTER TABLE "UserMfaRecoveryCode"
ADD COLUMN "invalidatedAt" TIMESTAMP(3);

DROP INDEX "UserMfaRecoveryCode_credentialId_batchId_consumedAt_idx";

CREATE INDEX "UserMfaRecoveryCode_credentialId_batchId_consumedAt_invalidatedAt_idx"
ON "UserMfaRecoveryCode"("credentialId", "batchId", "consumedAt", "invalidatedAt");

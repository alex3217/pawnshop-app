CREATE TYPE "MfaChallengePurpose" AS ENUM (
  'ENROLLMENT_CONFIRMATION',
  'LOGIN',
  'STEP_UP',
  'RECOVERY_CODES_REGENERATION',
  'DISABLE',
  'RESET'
);

CREATE TABLE "UserMfaCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "encryptedTotpSecret" TEXT NOT NULL,
  "enrollmentStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enabledAt" TIMESTAMP(3),
  "lastAcceptedTotpCounter" INTEGER,
  "recoveryCodesGeneratedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserMfaCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserMfaRecoveryCode" (
  "id" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "codeDigest" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialDigest" TEXT NOT NULL,
  "purpose" "MfaChallengePurpose" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attemptsRemaining" INTEGER NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "authVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMfaCredential_userId_key"
ON "UserMfaCredential"("userId");
CREATE INDEX "UserMfaCredential_enabledAt_idx"
ON "UserMfaCredential"("enabledAt");

CREATE UNIQUE INDEX "UserMfaRecoveryCode_codeDigest_key"
ON "UserMfaRecoveryCode"("codeDigest");
CREATE INDEX "UserMfaRecoveryCode_credentialId_batchId_consumedAt_idx"
ON "UserMfaRecoveryCode"("credentialId", "batchId", "consumedAt");

CREATE UNIQUE INDEX "MfaChallenge_credentialDigest_key"
ON "MfaChallenge"("credentialDigest");
CREATE INDEX "MfaChallenge_userId_purpose_consumedAt_expiresAt_idx"
ON "MfaChallenge"("userId", "purpose", "consumedAt", "expiresAt");
CREATE INDEX "MfaChallenge_expiresAt_idx"
ON "MfaChallenge"("expiresAt");

ALTER TABLE "UserMfaCredential"
ADD CONSTRAINT "UserMfaCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserMfaRecoveryCode"
ADD CONSTRAINT "UserMfaRecoveryCode_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "UserMfaCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MfaChallenge"
ADD CONSTRAINT "MfaChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

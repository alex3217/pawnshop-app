ALTER TABLE "MfaChallenge" ADD COLUMN "sessionDigest" TEXT,
ADD COLUMN "operationScope" TEXT;

DROP INDEX IF EXISTS "MfaChallenge_userId_purpose_consumedAt_expiresAt_idx";
CREATE INDEX "MfaChallenge_userId_purpose_sessionDigest_operationScope_consumedAt_expiresAt_idx" ON "MfaChallenge"("userId", "purpose", "sessionDigest", "operationScope", "consumedAt", "expiresAt");
CREATE INDEX "MfaChallenge_expiresAt_idx" ON "MfaChallenge"("expiresAt");

-- CreateTable
CREATE TABLE "MfaStepUpProof" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionDigest" TEXT NOT NULL,
    "operationScope" TEXT NOT NULL,
    "credentialDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaStepUpProof_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MfaStepUpProof_challengeId_key" ON "MfaStepUpProof"("challengeId");
CREATE UNIQUE INDEX "MfaStepUpProof_credentialDigest_key" ON "MfaStepUpProof"("credentialDigest");
CREATE INDEX "MfaStepUpProof_userId_sessionDigest_operationScope_consumedAt_expiresAt_idx" ON "MfaStepUpProof"("userId", "sessionDigest", "operationScope", "consumedAt", "expiresAt");
CREATE INDEX "MfaStepUpProof_expiresAt_idx" ON "MfaStepUpProof"("expiresAt");

ALTER TABLE "MfaStepUpProof" ADD CONSTRAINT "MfaStepUpProof_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "MfaChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaStepUpProof" ADD CONSTRAINT "MfaStepUpProof_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BetaInvite" (
    "id" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "email" TEXT,
    "intendedRole" "Role",
    "cohort" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "issuedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BetaInvite_maxUses_check" CHECK ("maxUses" > 0),
    CONSTRAINT "BetaInvite_redeemedCount_check" CHECK ("redeemedCount" >= 0 AND "redeemedCount" <= "maxUses")
);

CREATE TABLE "BetaInviteRedemption" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaInviteRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BetaInvite_tokenDigest_key" ON "BetaInvite"("tokenDigest");
CREATE INDEX "BetaInvite_cohort_createdAt_idx" ON "BetaInvite"("cohort", "createdAt");
CREATE INDEX "BetaInvite_email_idx" ON "BetaInvite"("email");
CREATE INDEX "BetaInvite_expiresAt_idx" ON "BetaInvite"("expiresAt");
CREATE INDEX "BetaInvite_revokedAt_idx" ON "BetaInvite"("revokedAt");
CREATE INDEX "BetaInvite_issuedByUserId_createdAt_idx" ON "BetaInvite"("issuedByUserId", "createdAt");
CREATE UNIQUE INDEX "BetaInviteRedemption_inviteId_userId_key" ON "BetaInviteRedemption"("inviteId", "userId");
CREATE INDEX "BetaInviteRedemption_inviteId_redeemedAt_idx" ON "BetaInviteRedemption"("inviteId", "redeemedAt");
CREATE INDEX "BetaInviteRedemption_userId_idx" ON "BetaInviteRedemption"("userId");

ALTER TABLE "BetaInvite"
ADD CONSTRAINT "BetaInvite_issuedByUserId_fkey"
FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BetaInvite"
ADD CONSTRAINT "BetaInvite_revokedByUserId_fkey"
FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BetaInviteRedemption"
ADD CONSTRAINT "BetaInviteRedemption_inviteId_fkey"
FOREIGN KEY ("inviteId") REFERENCES "BetaInvite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BetaInviteRedemption"
ADD CONSTRAINT "BetaInviteRedemption_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

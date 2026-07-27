CREATE TYPE "AccountActionTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

CREATE TABLE "AccountActionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AccountActionTokenPurpose" NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountActionToken_tokenDigest_key" ON "AccountActionToken"("tokenDigest");
CREATE INDEX "AccountActionToken_userId_purpose_consumedAt_idx" ON "AccountActionToken"("userId", "purpose", "consumedAt");
CREATE INDEX "AccountActionToken_purpose_expiresAt_idx" ON "AccountActionToken"("purpose", "expiresAt");

ALTER TABLE "AccountActionToken" ADD CONSTRAINT "AccountActionToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

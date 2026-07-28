CREATE TABLE "LegalConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalConsent_userId_termsVersion_privacyVersion_key"
ON "LegalConsent"("userId", "termsVersion", "privacyVersion");

CREATE INDEX "LegalConsent_userId_acceptedAt_idx"
ON "LegalConsent"("userId", "acceptedAt");

ALTER TABLE "LegalConsent"
ADD CONSTRAINT "LegalConsent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

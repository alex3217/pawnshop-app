ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "billingMethodPresent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "billingMethodBrand" TEXT,
ADD COLUMN "billingMethodLast4" TEXT,
ADD COLUMN "billingMethodExpMonth" INTEGER,
ADD COLUMN "billingMethodExpYear" INTEGER,
ADD COLUMN "billingMethodStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
ADD COLUMN "billingMethodSyncedAt" TIMESTAMP(3);
ALTER TABLE "PawnShop" ADD COLUMN "billingMethodPresent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "billingMethodBrand" TEXT,
ADD COLUMN "billingMethodLast4" TEXT,
ADD COLUMN "billingMethodExpMonth" INTEGER,
ADD COLUMN "billingMethodExpYear" INTEGER,
ADD COLUMN "billingMethodStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
ADD COLUMN "billingMethodSyncedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

CREATE TABLE "PaymentMethodConsent" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shopId" TEXT,
  "stripeCustomerId" TEXT NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "stripeSetupIntentId" TEXT,
  "stripeMandateId" TEXT,
  "paymentMethodId" TEXT,
  "termsVersion" TEXT NOT NULL,
  "consentText" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentMethodConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentMethodConsent_idempotencyKey_key" ON "PaymentMethodConsent"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentMethodConsent_stripeCheckoutSessionId_key" ON "PaymentMethodConsent"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "PaymentMethodConsent_stripeSetupIntentId_key" ON "PaymentMethodConsent"("stripeSetupIntentId");
CREATE INDEX "PaymentMethodConsent_userId_createdAt_idx" ON "PaymentMethodConsent"("userId", "createdAt");
CREATE INDEX "PaymentMethodConsent_shopId_createdAt_idx" ON "PaymentMethodConsent"("shopId", "createdAt");
CREATE INDEX "PaymentMethodConsent_stripeCustomerId_status_idx" ON "PaymentMethodConsent"("stripeCustomerId", "status");
ALTER TABLE "PaymentMethodConsent" ADD CONSTRAINT "PaymentMethodConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

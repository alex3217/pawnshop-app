ALTER TYPE "SellerPayoutStatus" ADD VALUE 'TRANSFERRED';

CREATE TABLE "StripeConnectedAccountPayout" (
    "id" TEXT NOT NULL,
    "stripePayoutId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "shopId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "payoutMethod" TEXT,
    "payoutType" TEXT,
    "stripeCreatedAt" TIMESTAMP(3),
    "lastStripeEventId" TEXT NOT NULL,
    "lastStripeEventCreatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeConnectedAccountPayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeConnectedAccountPayoutEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "stripePayoutRecordId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "stripeEventCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeConnectedAccountPayoutEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeConnectedAccountPayout_stripePayoutId_key"
ON "StripeConnectedAccountPayout"("stripePayoutId");
CREATE INDEX "StripeConnectedAccountPayout_stripeAccountId_status_arrivalDate_idx"
ON "StripeConnectedAccountPayout"("stripeAccountId", "status", "arrivalDate");
CREATE INDEX "StripeConnectedAccountPayout_shopId_createdAt_idx"
ON "StripeConnectedAccountPayout"("shopId", "createdAt");
CREATE INDEX "StripeConnectedAccountPayout_status_arrivalDate_idx"
ON "StripeConnectedAccountPayout"("status", "arrivalDate");
CREATE UNIQUE INDEX "StripeConnectedAccountPayoutEvent_stripeEventId_key"
ON "StripeConnectedAccountPayoutEvent"("stripeEventId");
CREATE INDEX "StripeConnectedAccountPayoutEvent_stripePayoutRecordId_stripeEventCreatedAt_idx"
ON "StripeConnectedAccountPayoutEvent"("stripePayoutRecordId", "stripeEventCreatedAt");

ALTER TABLE "StripeConnectedAccountPayout"
ADD CONSTRAINT "StripeConnectedAccountPayout_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StripeConnectedAccountPayoutEvent"
ADD CONSTRAINT "StripeConnectedAccountPayoutEvent_stripePayoutRecordId_fkey"
FOREIGN KEY ("stripePayoutRecordId") REFERENCES "StripeConnectedAccountPayout"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

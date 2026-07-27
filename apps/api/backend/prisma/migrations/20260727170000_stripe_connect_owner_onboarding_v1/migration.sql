ALTER TABLE "PawnShop"
ADD COLUMN "stripeConnectAccountId" TEXT,
ADD COLUMN "stripeConnectDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripeConnectChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripeConnectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripeConnectOnboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN "stripeConnectStatusUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PawnShop_stripeConnectAccountId_key"
ON "PawnShop"("stripeConnectAccountId");

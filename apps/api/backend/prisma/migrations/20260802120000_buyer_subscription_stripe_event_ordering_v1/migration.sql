ALTER TABLE "BuyerSubscription"
  ADD COLUMN "stripeEventCreatedAt" TIMESTAMP(3),
  ADD COLUMN "stripeEventId" TEXT,
  ADD COLUMN "stripeEventType" TEXT;

CREATE INDEX "BuyerSubscription_stripeEventCreatedAt_idx"
  ON "BuyerSubscription"("stripeEventCreatedAt");

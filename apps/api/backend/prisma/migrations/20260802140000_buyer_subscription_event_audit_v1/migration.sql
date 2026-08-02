CREATE TABLE "BuyerSubscriptionEvent" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "buyerSubscriptionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "stripeEventCreatedAt" TIMESTAMP(3) NOT NULL,
  "normalizedStatus" "BuyerSubscriptionStatus" NOT NULL,
  "plan" "BuyerSubscriptionPlan" NOT NULL,
  "billingInterval" "BillingInterval",
  "applied" BOOLEAN NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyerSubscriptionEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuyerSubscriptionEvent_stripeEventId_key" ON "BuyerSubscriptionEvent"("stripeEventId");
CREATE INDEX "BuyerSubscriptionEvent_buyerSubscriptionId_stripeEventCreatedAt_id_idx" ON "BuyerSubscriptionEvent"("buyerSubscriptionId", "stripeEventCreatedAt", "id");
CREATE INDEX "BuyerSubscriptionEvent_userId_createdAt_idx" ON "BuyerSubscriptionEvent"("userId", "createdAt");
ALTER TABLE "BuyerSubscriptionEvent" ADD CONSTRAINT "BuyerSubscriptionEvent_buyerSubscriptionId_fkey" FOREIGN KEY ("buyerSubscriptionId") REFERENCES "BuyerSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerSubscriptionEvent" ADD CONSTRAINT "BuyerSubscriptionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_buyer_subscription_event_mutation()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "BuyerSubscriptionEvent_append_only_trigger" BEFORE UPDATE OR DELETE ON "BuyerSubscriptionEvent" FOR EACH ROW EXECUTE FUNCTION prevent_buyer_subscription_event_mutation();

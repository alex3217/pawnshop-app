ALTER TABLE "PawnShop"
  ADD COLUMN "stripeSubscriptionEventCreatedAt" TIMESTAMP(3),
  ADD COLUMN "stripeSubscriptionEventId" TEXT,
  ADD COLUMN "stripeSubscriptionEventType" TEXT;

CREATE TABLE "StripeSubscriptionBillingEvent" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "stripeEventCreatedAt" TIMESTAMP(3) NOT NULL,
  "shopId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripeInvoiceId" TEXT,
  "applied" BOOLEAN NOT NULL DEFAULT false,
  "previousState" JSONB NOT NULL,
  "resultingState" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeSubscriptionBillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeSubscriptionBillingEvent_stripeEventId_key"
  ON "StripeSubscriptionBillingEvent"("stripeEventId");
CREATE INDEX "StripeSubscriptionBillingEvent_shopId_stripeEventCreatedAt_id_idx"
  ON "StripeSubscriptionBillingEvent"("shopId", "stripeEventCreatedAt", "id");
CREATE INDEX "StripeSubscriptionBillingEvent_stripeSubscriptionId_stripeEventCreatedAt_idx"
  ON "StripeSubscriptionBillingEvent"("stripeSubscriptionId", "stripeEventCreatedAt");
CREATE INDEX "StripeSubscriptionBillingEvent_stripeInvoiceId_idx"
  ON "StripeSubscriptionBillingEvent"("stripeInvoiceId");
CREATE INDEX "StripeSubscriptionBillingEvent_ownerUserId_createdAt_idx"
  ON "StripeSubscriptionBillingEvent"("ownerUserId", "createdAt");

ALTER TABLE "StripeSubscriptionBillingEvent"
  ADD CONSTRAINT "StripeSubscriptionBillingEvent_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeSubscriptionBillingEvent"
  ADD CONSTRAINT "StripeSubscriptionBillingEvent_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_subscription_billing_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StripeSubscriptionBillingEvent_append_only_trigger"
BEFORE UPDATE OR DELETE ON "StripeSubscriptionBillingEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_subscription_billing_audit_mutation();

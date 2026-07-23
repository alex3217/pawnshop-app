BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '2min';

CREATE TYPE "CustomerSellHandoffMethod" AS ENUM ('IN_PERSON');
CREATE TYPE "CustomerSellLifecycleStatus" AS ENUM ('AWAITING_HANDOFF', 'ITEM_RECEIVED', 'INSPECTION_PENDING', 'REVISED_PRICE_AWAITING_CUSTOMER', 'READY_FOR_PAYMENT', 'PAID', 'COMPLETED', 'REJECTED_PENDING_RETURN', 'RETURNED');
CREATE TYPE "CustomerSellInspectionStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'ACCEPTED_ORIGINAL_PRICE', 'REVISED_PRICE_PROPOSED', 'REVISED_PRICE_ACCEPTED', 'REVISED_PRICE_REFUSED', 'REJECTED');
CREATE TYPE "CustomerSellPaymentMethod" AS ENUM ('CASH', 'SHOP_CHECK');
CREATE TYPE "CustomerSellPaymentStatus" AS ENUM ('PENDING', 'COMPLETED');
CREATE TYPE "CustomerSellIdentityResult" AS ENUM ('NOT_CHECKED', 'VERIFIED', 'NOT_VERIFIED');
CREATE TYPE "CustomerSellRevenuePolicy" AS ENUM ('SUBSCRIPTION_COVERED_ZERO_PLATFORM_FEE');

CREATE TABLE "CustomerSellFulfillment" (
  "id" TEXT PRIMARY KEY,
  "transactionId" TEXT NOT NULL UNIQUE,
  "submissionId" TEXT NOT NULL UNIQUE,
  "submissionOfferId" TEXT NOT NULL UNIQUE,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "acceptedShopOwnerId" TEXT NOT NULL,
  "handoffMethod" "CustomerSellHandoffMethod" NOT NULL DEFAULT 'IN_PERSON',
  "lifecycleStatus" "CustomerSellLifecycleStatus" NOT NULL DEFAULT 'AWAITING_HANDOFF',
  "inspectionStatus" "CustomerSellInspectionStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "originalAmount" DECIMAL(10,2) NOT NULL,
  "finalAmount" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "observedCondition" TEXT,
  "verifiedSerial" TEXT,
  "identityVerificationResult" "CustomerSellIdentityResult" NOT NULL DEFAULT 'NOT_CHECKED',
  "mismatchReason" TEXT,
  "rejectionReason" TEXT,
  "evidenceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "itemReceivedAt" TIMESTAMP(3), "inspectionStartedAt" TIMESTAMP(3), "inspectedAt" TIMESTAMP(3),
  "revisedPriceProposedAt" TIMESTAMP(3), "customerDecidedAt" TIMESTAMP(3), "readyForPaymentAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "rejectedAt" TIMESTAMP(3), "returnedAt" TIMESTAMP(3),
  "customerAcknowledgedAt" TIMESTAMP(3), "lastActorUserId" TEXT,
  "transitionIdempotencyKey" TEXT UNIQUE, "version" INTEGER NOT NULL DEFAULT 0,
  "intakeId" TEXT UNIQUE, "inventoryItemId" TEXT UNIQUE,
  "revenuePolicy" "CustomerSellRevenuePolicy" NOT NULL DEFAULT 'SUBSCRIPTION_COVERED_ZERO_PLATFORM_FEE',
  "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSellFulfillment_amount_check" CHECK ("originalAmount" > 0 AND ("finalAmount" IS NULL OR "finalAmount" > 0) AND "platformFee" = 0),
  CONSTRAINT "CustomerSellFulfillment_currency_check" CHECK ("currency" = UPPER("currency") AND length("currency") = 3),
  CONSTRAINT "CustomerSellFulfillment_completion_check" CHECK (
    ("lifecycleStatus" NOT IN ('PAID','COMPLETED') OR ("finalAmount" IS NOT NULL AND "paidAt" IS NOT NULL))
    AND ("lifecycleStatus" <> 'COMPLETED' OR ("completedAt" IS NOT NULL AND "inventoryItemId" IS NOT NULL))
    AND ("lifecycleStatus" <> 'RETURNED' OR "returnedAt" IS NOT NULL)
  ),
  FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("submissionOfferId", "submissionId") REFERENCES "BuyerItemSubmissionOffer"("id","submissionId") ON DELETE RESTRICT,
  FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("acceptedShopOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("lastActorUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  FOREIGN KEY ("intakeId") REFERENCES "ItemIntake"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("inventoryItemId") REFERENCES "Item"("id") ON DELETE RESTRICT
);

CREATE TABLE "CustomerSellPayment" (
  "id" TEXT PRIMARY KEY, "transactionId" TEXT NOT NULL UNIQUE, "fulfillmentId" TEXT NOT NULL UNIQUE,
  "shopId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "method" "CustomerSellPaymentMethod",
  "status" "CustomerSellPaymentStatus" NOT NULL DEFAULT 'PENDING', "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD', "referenceNumber" TEXT, "evidenceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recordedByUserId" TEXT, "idempotencyKey" TEXT UNIQUE, "recordedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSellPayment_method_check" CHECK (
    ("status" = 'PENDING' AND "method" IS NULL AND "recordedAt" IS NULL)
    OR ("status" = 'COMPLETED' AND "method" IS NOT NULL AND "recordedAt" IS NOT NULL)
  ),
  CONSTRAINT "CustomerSellPayment_check_reference_check" CHECK ("method" <> 'SHOP_CHECK' OR length(btrim("referenceNumber")) > 0),
  CONSTRAINT "CustomerSellPayment_amount_check" CHECK ("amount" > 0),
  FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("fulfillmentId") REFERENCES "CustomerSellFulfillment"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE "MarketplaceTransactionEvent" (
  "id" TEXT PRIMARY KEY, "transactionId" TEXT NOT NULL, "fulfillmentId" TEXT, "actorUserId" TEXT,
  "actorRole" TEXT NOT NULL, "eventType" TEXT NOT NULL, "fromStatus" TEXT, "toStatus" TEXT,
  "idempotencyKey" TEXT UNIQUE, "data" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("fulfillmentId") REFERENCES "CustomerSellFulfillment"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE "CustomerSellReceipt" (
  "id" TEXT PRIMARY KEY, "transactionId" TEXT NOT NULL UNIQUE, "fulfillmentId" TEXT NOT NULL UNIQUE,
  "paymentId" TEXT NOT NULL UNIQUE, "shopId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL, "submissionOfferId" TEXT NOT NULL, "inventoryItemId" TEXT NOT NULL UNIQUE,
  "originalAmount" DECIMAL(10,2) NOT NULL, "finalAmount" DECIMAL(10,2) NOT NULL, "currency" TEXT NOT NULL,
  "paymentMethod" "CustomerSellPaymentMethod" NOT NULL, "paymentReferenceNumber" TEXT,
  "shopName" TEXT NOT NULL, "shopAddress" TEXT, "customerName" TEXT NOT NULL, "itemTitle" TEXT NOT NULL,
  "observedCondition" TEXT, "verifiedSerial" TEXT, "revenuePolicy" "CustomerSellRevenuePolicy" NOT NULL,
  "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0, "completedByUserId" TEXT NOT NULL,
  "completedByRole" TEXT NOT NULL, "customerAcknowledgedAt" TIMESTAMP(3), "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSellReceipt_amount_check" CHECK ("originalAmount" > 0 AND "finalAmount" > 0 AND "platformFee" = 0),
  CONSTRAINT "CustomerSellReceipt_check_reference_check" CHECK ("paymentMethod" <> 'SHOP_CHECK' OR length(btrim("paymentReferenceNumber")) > 0),
  FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("fulfillmentId") REFERENCES "CustomerSellFulfillment"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("paymentId") REFERENCES "CustomerSellPayment"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("submissionId") REFERENCES "BuyerItemSubmission"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("submissionOfferId","submissionId") REFERENCES "BuyerItemSubmissionOffer"("id","submissionId") ON DELETE RESTRICT,
  FOREIGN KEY ("inventoryItemId") REFERENCES "Item"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "CustomerSellFulfillment_shopId_lifecycleStatus_createdAt_idx" ON "CustomerSellFulfillment"("shopId","lifecycleStatus","createdAt");
CREATE INDEX "CustomerSellFulfillment_customerId_lifecycleStatus_createdAt_idx" ON "CustomerSellFulfillment"("customerId","lifecycleStatus","createdAt");
CREATE INDEX "CustomerSellFulfillment_transactionId_version_idx" ON "CustomerSellFulfillment"("transactionId","version");
CREATE INDEX "CustomerSellPayment_shopId_status_createdAt_idx" ON "CustomerSellPayment"("shopId","status","createdAt");
CREATE INDEX "CustomerSellPayment_customerId_status_createdAt_idx" ON "CustomerSellPayment"("customerId","status","createdAt");
CREATE INDEX "MarketplaceTransactionEvent_transactionId_createdAt_idx" ON "MarketplaceTransactionEvent"("transactionId","createdAt");
CREATE INDEX "MarketplaceTransactionEvent_fulfillmentId_createdAt_idx" ON "MarketplaceTransactionEvent"("fulfillmentId","createdAt");
CREATE INDEX "MarketplaceTransactionEvent_actorUserId_createdAt_idx" ON "MarketplaceTransactionEvent"("actorUserId","createdAt");
CREATE INDEX "CustomerSellReceipt_shopId_createdAt_idx" ON "CustomerSellReceipt"("shopId","createdAt");
CREATE INDEX "CustomerSellReceipt_customerId_createdAt_idx" ON "CustomerSellReceipt"("customerId","createdAt");

CREATE FUNCTION customer_sell_validate_relationships() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "MarketplaceTransaction"%ROWTYPE; o "BuyerItemSubmissionOffer"%ROWTYPE; i "ItemIntake"%ROWTYPE; item_shop TEXT;
BEGIN
  SELECT * INTO t FROM "MarketplaceTransaction" WHERE id = NEW."transactionId";
  SELECT * INTO o FROM "BuyerItemSubmissionOffer" WHERE id = NEW."submissionOfferId";
  IF t.type <> 'CUSTOMER_SELL_TO_SHOP' OR t."listingId" IS NOT NULL OR t."submissionId" <> NEW."submissionId"
     OR t."submissionOfferId" <> NEW."submissionOfferId" OR t."buyerShopId" <> NEW."shopId"
     OR t."sellerUserId" <> NEW."customerId" OR t."buyerUserId" <> NEW."acceptedShopOwnerId"
     OR o."shopId" <> NEW."shopId" OR o."ownerId" <> NEW."acceptedShopOwnerId"
     OR o.amount <> NEW."originalAmount" OR t."totalAmount" <> NEW."originalAmount"
     OR t.currency <> NEW.currency OR t."platformFee" <> 0 THEN
    RAISE EXCEPTION 'invalid customer-sale fulfillment relationship' USING ERRCODE = '23514';
  END IF;
  IF NEW."intakeId" IS NOT NULL THEN
    SELECT * INTO i FROM "ItemIntake" WHERE id = NEW."intakeId";
    IF i."linkedSubmissionId" IS DISTINCT FROM NEW."submissionId" OR i."shopId" IS DISTINCT FROM NEW."shopId"
       OR i."customerId" IS DISTINCT FROM NEW."customerId" OR i.destination <> 'CUSTOMER_SELL' THEN
      RAISE EXCEPTION 'invalid customer-sale intake relationship' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."inventoryItemId" IS NOT NULL THEN
    SELECT "pawnShopId" INTO item_shop FROM "Item" WHERE id = NEW."inventoryItemId";
    IF item_shop IS DISTINCT FROM NEW."shopId" THEN
      RAISE EXCEPTION 'invalid customer-sale inventory relationship' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CustomerSellFulfillment_relationships_trigger" BEFORE INSERT OR UPDATE ON "CustomerSellFulfillment"
FOR EACH ROW EXECUTE FUNCTION customer_sell_validate_relationships();

CREATE FUNCTION customer_sell_validate_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f "CustomerSellFulfillment"%ROWTYPE;
BEGIN
  SELECT * INTO f FROM "CustomerSellFulfillment" WHERE id = NEW."fulfillmentId";
  IF f."transactionId" <> NEW."transactionId" OR f."shopId" <> NEW."shopId" OR f."customerId" <> NEW."customerId"
     OR NEW.amount <> COALESCE(f."finalAmount", f."originalAmount") OR NEW.currency <> f.currency THEN
    RAISE EXCEPTION 'invalid customer-sale payment relationship or amount' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'COMPLETED' AND f."lifecycleStatus" NOT IN ('READY_FOR_PAYMENT','PAID','COMPLETED') THEN
    RAISE EXCEPTION 'customer-sale payment is not ready' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CustomerSellPayment_relationships_trigger" BEFORE INSERT OR UPDATE ON "CustomerSellPayment"
FOR EACH ROW EXECUTE FUNCTION customer_sell_validate_payment();

CREATE FUNCTION reject_immutable_customer_sell_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'completed customer-sale records are immutable' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER "MarketplaceTransactionEvent_append_only_trigger" BEFORE UPDATE OR DELETE ON "MarketplaceTransactionEvent"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_customer_sell_record();
CREATE TRIGGER "CustomerSellReceipt_immutable_trigger" BEFORE UPDATE OR DELETE ON "CustomerSellReceipt"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_customer_sell_record();

-- Backfill only eligible submission-origin customer sales. PAWN and listing-origin
-- transactions cannot match these predicates.
INSERT INTO "CustomerSellFulfillment" (
  "id","transactionId","submissionId","submissionOfferId","shopId","customerId","acceptedShopOwnerId",
  "originalAmount","currency","createdAt","updatedAt"
)
SELECT concat('csf_', md5(t.id)), t.id, t."submissionId", t."submissionOfferId", t."buyerShopId",
       t."sellerUserId", t."buyerUserId", t."totalAmount", t.currency, t."createdAt", CURRENT_TIMESTAMP
FROM "MarketplaceTransaction" t
JOIN "BuyerItemSubmission" s ON s.id = t."submissionId" AND s.intent IN ('SELL','SELL_OFFERS')
JOIN "BuyerItemSubmissionOffer" o ON o.id = t."submissionOfferId" AND o."submissionId" = s.id
WHERE t.type = 'CUSTOMER_SELL_TO_SHOP' AND t."listingId" IS NULL AND t.status = 'PENDING'
  AND t."buyerShopId" IS NOT NULL AND t."platformFee" = 0
ON CONFLICT ("transactionId") DO NOTHING;

INSERT INTO "CustomerSellPayment" ("id","transactionId","fulfillmentId","shopId","customerId","amount","currency")
SELECT concat('csp_', md5(f.id)), f."transactionId", f.id, f."shopId", f."customerId", f."originalAmount", f.currency
FROM "CustomerSellFulfillment" f ON CONFLICT ("transactionId") DO NOTHING;

INSERT INTO "MarketplaceTransactionEvent" ("id","transactionId","fulfillmentId","actorUserId","actorRole","eventType","toStatus","idempotencyKey","data")
SELECT concat('cse_', md5(f.id)), f."transactionId", f.id, NULL, 'SYSTEM', 'CUSTOMER_SELL_FULFILLMENT_INITIALIZED',
       'AWAITING_HANDOFF', concat('customer-sell-backfill:', f."transactionId"), '{"backfilled":true}'::jsonb
FROM "CustomerSellFulfillment" f ON CONFLICT ("idempotencyKey") DO NOTHING;

COMMIT;

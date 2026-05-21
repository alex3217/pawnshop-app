-- Shop Staff Role Labels Backfill
-- Uses role enum values added by the previous migration after that migration commits.

ALTER TABLE "public"."Staff"
  ALTER COLUMN "role" SET DEFAULT 'SHOP_STAFF';

UPDATE "public"."Staff"
SET "role" = 'SHOP_MANAGER'
WHERE "role" = 'MANAGER';

UPDATE "public"."Staff"
SET "role" = 'SHOP_STAFF'
WHERE "role" = 'STAFF';

UPDATE "public"."Staff"
SET "role" = 'SALES_ASSOCIATE'
WHERE "role" = 'CASHIER';

UPDATE "public"."Staff"
SET "role" = 'INVENTORY_MANAGER'
WHERE "role" = 'INVENTORY';

UPDATE "public"."Staff"
SET "role" = 'AUCTION_MANAGER'
WHERE "role" = 'AUCTION';

UPDATE "public"."Staff"
SET "role" = 'SHOP_VIEWER'
WHERE "role" = 'VIEWER';

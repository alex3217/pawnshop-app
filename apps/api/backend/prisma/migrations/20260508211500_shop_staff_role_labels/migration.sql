-- Shop Staff Role Labels
-- Adds shop-specific staff role enum values and migrates existing Staff rows.
-- Intentionally does not remove old enum labels because PostgreSQL enum value removal is unsafe.

ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SHOP_ADMIN';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SHOP_MANAGER';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SHOP_STAFF';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SHOP_VIEWER';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'INVENTORY_MANAGER';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'AUCTION_MANAGER';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SALES_ASSOCIATE';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'FINANCE_VIEWER';

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

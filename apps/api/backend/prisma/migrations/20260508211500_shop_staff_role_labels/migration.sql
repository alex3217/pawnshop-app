-- Shop Staff Role Labels
-- Adds shop-specific staff role enum values.
-- Do not use the newly added enum values in this same migration.
-- PostgreSQL requires new enum values to be committed before they are used.

ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SHOP_ADMIN';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SHOP_MANAGER';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SHOP_STAFF';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SHOP_VIEWER';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'INVENTORY_MANAGER';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'AUCTION_MANAGER';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'SALES_ASSOCIATE';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'FINANCE_VIEWER';

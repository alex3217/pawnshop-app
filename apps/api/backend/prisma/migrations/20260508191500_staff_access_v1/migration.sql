-- Staff Access v1
-- Adds shop-scoped staff records with role/status/permissions.
-- Safe to run against an existing database.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'StaffRole'
  ) THEN
    CREATE TYPE "public"."StaffRole" AS ENUM (
      'MANAGER',
      'STAFF',
      'CASHIER',
      'INVENTORY',
      'AUCTION',
      'VIEWER'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'StaffStatus'
  ) THEN
    CREATE TYPE "public"."StaffStatus" AS ENUM (
      'INVITED',
      'ACTIVE',
      'INACTIVE',
      'ARCHIVED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."Staff" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "role" "public"."StaffRole" NOT NULL DEFAULT 'STAFF',
  "status" "public"."StaffStatus" NOT NULL DEFAULT 'INVITED',
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Staff_shopId_email_key"
  ON "public"."Staff"("shopId", "email");

CREATE INDEX IF NOT EXISTS "Staff_shopId_status_idx"
  ON "public"."Staff"("shopId", "status");

CREATE INDEX IF NOT EXISTS "Staff_shopId_role_idx"
  ON "public"."Staff"("shopId", "role");

CREATE INDEX IF NOT EXISTS "Staff_userId_idx"
  ON "public"."Staff"("userId");

CREATE INDEX IF NOT EXISTS "Staff_email_idx"
  ON "public"."Staff"("email");

CREATE INDEX IF NOT EXISTS "Staff_createdAt_idx"
  ON "public"."Staff"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Staff_shopId_fkey'
  ) THEN
    ALTER TABLE "public"."Staff"
      ADD CONSTRAINT "Staff_shopId_fkey"
      FOREIGN KEY ("shopId")
      REFERENCES "public"."PawnShop"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Staff_userId_fkey'
  ) THEN
    ALTER TABLE "public"."Staff"
      ADD CONSTRAINT "Staff_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "public"."User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

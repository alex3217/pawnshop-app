-- CreateEnum
CREATE TYPE "OwnerApplicationStatus" AS ENUM (
  'PENDING',
  'IN_REVIEW',
  'INFORMATION_REQUESTED',
  'APPROVED',
  'REJECTED',
  'SUSPENDED'
);

-- CreateTable
CREATE TABLE "OwnerApplication" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" "OwnerApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "businessName" TEXT,
  "businessType" TEXT,
  "businessEmail" TEXT,
  "businessPhone" TEXT,
  "websiteUrl" TEXT,
  "businessAddress" JSONB,
  "licenseNumber" TEXT,
  "licenseState" TEXT,
  "applicationData" JSONB,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "decisionReason" TEXT,
  "adminNotes" TEXT,
  "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OwnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerApplication_ownerId_key"
ON "OwnerApplication"("ownerId");

-- CreateIndex
CREATE INDEX "OwnerApplication_status_createdAt_idx"
ON "OwnerApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OwnerApplication_reviewedById_idx"
ON "OwnerApplication"("reviewedById");

-- AddForeignKey
ALTER TABLE "OwnerApplication"
ADD CONSTRAINT "OwnerApplication_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerApplication"
ADD CONSTRAINT "OwnerApplication_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve access for owners who existed before approval enforcement.
INSERT INTO "OwnerApplication" (
  "id",
  "ownerId",
  "status",
  "submittedAt",
  "reviewedAt",
  "decisionReason",
  "adminNotes",
  "statusChangedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'ownerapp_' || md5(user_row."id"),
  user_row."id",
  'APPROVED'::"OwnerApplicationStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'Existing owner approved during owner-application migration',
  'Automatically backfilled by owner_application_approval_v1',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" AS user_row
WHERE user_row."role" = 'OWNER'::"Role"
ON CONFLICT ("ownerId") DO NOTHING;

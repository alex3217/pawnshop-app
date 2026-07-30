-- CreateEnum
CREATE TYPE "PawnShopLeadBusinessStatus" AS ENUM ('DISCOVERED', 'ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "PawnShopLeadVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PawnShopLeadOutreachStatus" AS ENUM ('NOT_CONTACTED', 'CONTACTED', 'INTERESTED', 'DEMO_SCHEDULED', 'APPLICATION_STARTED', 'ONBOARDING', 'LIVE', 'DECLINED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "PawnShopLeadContactType" AS ENUM ('OWNER', 'MANAGER', 'BUSINESS', 'LICENSING', 'OTHER');

-- CreateEnum
CREATE TYPE "PawnShopLeadActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'STATUS_CHANGE', 'FOLLOW_UP', 'SUPPRESSION');

-- CreateEnum
CREATE TYPE "PawnShopLeadActivityChannel" AS ENUM ('PHONE', 'EMAIL', 'IN_PERSON', 'VIDEO', 'INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PawnShopLeadActivityDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "PawnShopLeadImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PawnShopLeadSourceType" AS ENUM ('MANUAL', 'IMPORT', 'GOVERNMENT_DATASET', 'PUBLIC_WEBSITE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PawnShopLeadCollectionMethod" AS ENUM ('MANUAL_ENTRY', 'FILE_IMPORT', 'APPROVED_DATASET', 'PERMITTED_COLLECTION', 'OTHER');

-- CreateTable
CREATE TABLE "PawnShopLead" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "legalName" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "publicEmail" TEXT,
    "website" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "linkedinUrl" TEXT,
    "licenseNumber" TEXT,
    "licenseAuthority" TEXT,
    "licenseStatus" TEXT,
    "licenseExpirationDate" TIMESTAMP(3),
    "sourceType" "PawnShopLeadSourceType" NOT NULL,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "sourceRecordId" TEXT,
    "businessStatus" "PawnShopLeadBusinessStatus" NOT NULL DEFAULT 'DISCOVERED',
    "verificationStatus" "PawnShopLeadVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "outreachStatus" "PawnShopLeadOutreachStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "assignedUserId" TEXT,
    "claimedShopId" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PawnShopLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PawnShopLeadContact" (
    "id" TEXT NOT NULL,
    "pawnShopLeadId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contactType" "PawnShopLeadContactType" NOT NULL,
    "isPublicBusinessContact" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "PawnShopLeadVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PawnShopLeadContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PawnShopLeadActivity" (
    "id" TEXT NOT NULL,
    "pawnShopLeadId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "activityType" "PawnShopLeadActivityType" NOT NULL,
    "channel" "PawnShopLeadActivityChannel",
    "direction" "PawnShopLeadActivityDirection",
    "status" TEXT,
    "subject" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PawnShopLeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PawnShopLeadSource" (
    "id" TEXT NOT NULL,
    "pawnShopLeadId" TEXT NOT NULL,
    "sourceType" "PawnShopLeadSourceType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceRecordId" TEXT,
    "collectionMethod" "PawnShopLeadCollectionMethod" NOT NULL,
    "rawPayload" JSONB,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "termsReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PawnShopLeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PawnShopLeadImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceType" "PawnShopLeadSourceType" NOT NULL,
    "status" "PawnShopLeadImportStatus" NOT NULL DEFAULT 'PENDING',
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsRejected" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PawnShopLeadImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PawnShopLeadSuppression" (
    "id" TEXT NOT NULL,
    "pawnShopLeadId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "suppressedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PawnShopLeadSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PawnShopLead_claimedShopId_key" ON "PawnShopLead"("claimedShopId");

-- CreateIndex
CREATE INDEX "PawnShopLead_businessName_idx" ON "PawnShopLead"("businessName");

-- CreateIndex
CREATE INDEX "PawnShopLead_city_state_idx" ON "PawnShopLead"("city", "state");

-- CreateIndex
CREATE INDEX "PawnShopLead_verificationStatus_outreachStatus_idx" ON "PawnShopLead"("verificationStatus", "outreachStatus");

-- CreateIndex
CREATE INDEX "PawnShopLead_businessStatus_doNotContact_idx" ON "PawnShopLead"("businessStatus", "doNotContact");

-- CreateIndex
CREATE INDEX "PawnShopLead_assignedUserId_idx" ON "PawnShopLead"("assignedUserId");

-- CreateIndex
CREATE INDEX "PawnShopLead_createdAt_idx" ON "PawnShopLead"("createdAt");

-- CreateIndex
CREATE INDEX "PawnShopLead_updatedAt_idx" ON "PawnShopLead"("updatedAt");

-- CreateIndex
CREATE INDEX "PawnShopLeadContact_pawnShopLeadId_isPrimary_idx" ON "PawnShopLeadContact"("pawnShopLeadId", "isPrimary");

-- CreateIndex
CREATE INDEX "PawnShopLeadActivity_pawnShopLeadId_occurredAt_idx" ON "PawnShopLeadActivity"("pawnShopLeadId", "occurredAt");

-- CreateIndex
CREATE INDEX "PawnShopLeadActivity_nextFollowUpAt_idx" ON "PawnShopLeadActivity"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "PawnShopLeadSource_pawnShopLeadId_collectedAt_idx" ON "PawnShopLeadSource"("pawnShopLeadId", "collectedAt");

-- CreateIndex
CREATE INDEX "PawnShopLeadSource_sourceType_sourceRecordId_idx" ON "PawnShopLeadSource"("sourceType", "sourceRecordId");

-- CreateIndex
CREATE INDEX "PawnShopLeadImport_status_startedAt_idx" ON "PawnShopLeadImport"("status", "startedAt");

-- CreateIndex
CREATE INDEX "PawnShopLeadSuppression_pawnShopLeadId_idx" ON "PawnShopLeadSuppression"("pawnShopLeadId");

-- CreateIndex
CREATE INDEX "PawnShopLeadSuppression_email_idx" ON "PawnShopLeadSuppression"("email");

-- CreateIndex
CREATE INDEX "PawnShopLeadSuppression_phone_idx" ON "PawnShopLeadSuppression"("phone");

-- AddForeignKey
ALTER TABLE "PawnShopLead" ADD CONSTRAINT "PawnShopLead_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PawnShopLead" ADD CONSTRAINT "PawnShopLead_claimedShopId_fkey" FOREIGN KEY ("claimedShopId") REFERENCES "PawnShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PawnShopLeadContact" ADD CONSTRAINT "PawnShopLeadContact_pawnShopLeadId_fkey" FOREIGN KEY ("pawnShopLeadId") REFERENCES "PawnShopLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PawnShopLeadActivity" ADD CONSTRAINT "PawnShopLeadActivity_pawnShopLeadId_fkey" FOREIGN KEY ("pawnShopLeadId") REFERENCES "PawnShopLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PawnShopLeadActivity" ADD CONSTRAINT "PawnShopLeadActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PawnShopLeadSource" ADD CONSTRAINT "PawnShopLeadSource_pawnShopLeadId_fkey" FOREIGN KEY ("pawnShopLeadId") REFERENCES "PawnShopLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PawnShopLeadImport" ADD CONSTRAINT "PawnShopLeadImport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PawnShopLeadSuppression" ADD CONSTRAINT "PawnShopLeadSuppression_pawnShopLeadId_fkey" FOREIGN KEY ("pawnShopLeadId") REFERENCES "PawnShopLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PawnShopLeadSuppression" ADD CONSTRAINT "PawnShopLeadSuppression_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

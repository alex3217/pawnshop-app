-- CreateEnum
CREATE TYPE "ItemIntakeSource" AS ENUM ('CAMERA', 'HARDWARE_SCANNER', 'MANUAL', 'FILE_UPLOAD', 'API');

-- CreateEnum
CREATE TYPE "ItemIntakeDestination" AS ENUM ('SHOP_INVENTORY', 'CUSTOMER_SELL', 'CUSTOMER_PAWN', 'CUSTOMER_MARKETPLACE', 'DEALER_LISTING', 'SHOP_TRANSFER');

-- CreateEnum
CREATE TYPE "ItemIntakeStatus" AS ENUM ('DRAFT', 'SCANNED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ItemIntakeOcrStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ItemIntakeCheckStatus" AS ENUM ('NOT_CHECKED', 'PENDING', 'CLEAR', 'MATCH_FOUND', 'REVIEW_REQUIRED', 'FAILED');

-- CreateTable
CREATE TABLE "ItemIntake" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "capturedByUserId" TEXT,
    "source" "ItemIntakeSource" NOT NULL DEFAULT 'MANUAL',
    "destination" "ItemIntakeDestination" NOT NULL DEFAULT 'SHOP_INVENTORY',
    "status" "ItemIntakeStatus" NOT NULL DEFAULT 'DRAFT',
    "code" TEXT,
    "normalizedCode" TEXT,
    "codeType" TEXT,
    "barcode" TEXT,
    "upc" TEXT,
    "ean" TEXT,
    "sku" TEXT,
    "serialNumber" TEXT,
    "title" TEXT,
    "description" TEXT,
    "category" TEXT,
    "condition" TEXT,
    "estimatedValue" DECIMAL(10,2),
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "documentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "receiptUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ocrStatus" "ItemIntakeOcrStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "ocrText" TEXT,
    "ocrData" JSONB,
    "duplicateStatus" "ItemIntakeCheckStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "duplicateMatches" JSONB,
    "screeningStatus" "ItemIntakeCheckStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "screeningResult" JSONB,
    "reviewMessage" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "linkedItemId" TEXT,
    "linkedSubmissionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemIntake_shopId_status_createdAt_idx" ON "ItemIntake"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ItemIntake_capturedByUserId_createdAt_idx" ON "ItemIntake"("capturedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ItemIntake_destination_status_idx" ON "ItemIntake"("destination", "status");

-- CreateIndex
CREATE INDEX "ItemIntake_normalizedCode_idx" ON "ItemIntake"("normalizedCode");

-- CreateIndex
CREATE INDEX "ItemIntake_barcode_idx" ON "ItemIntake"("barcode");

-- CreateIndex
CREATE INDEX "ItemIntake_upc_idx" ON "ItemIntake"("upc");

-- CreateIndex
CREATE INDEX "ItemIntake_ean_idx" ON "ItemIntake"("ean");

-- CreateIndex
CREATE INDEX "ItemIntake_sku_idx" ON "ItemIntake"("sku");

-- CreateIndex
CREATE INDEX "ItemIntake_serialNumber_idx" ON "ItemIntake"("serialNumber");

-- CreateIndex
CREATE INDEX "ItemIntake_duplicateStatus_createdAt_idx" ON "ItemIntake"("duplicateStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ItemIntake_screeningStatus_createdAt_idx" ON "ItemIntake"("screeningStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ItemIntake_linkedItemId_idx" ON "ItemIntake"("linkedItemId");

-- CreateIndex
CREATE INDEX "ItemIntake_linkedSubmissionId_idx" ON "ItemIntake"("linkedSubmissionId");

-- AddForeignKey
ALTER TABLE "ItemIntake" ADD CONSTRAINT "ItemIntake_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PawnShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemIntake" ADD CONSTRAINT "ItemIntake_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

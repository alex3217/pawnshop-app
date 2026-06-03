/*
  Warnings:

  - A unique constraint covering the columns `[offerId]` on the table `Settlement` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Settlement" DROP CONSTRAINT "Settlement_auctionId_fkey";

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "offerId" TEXT,
ALTER COLUMN "auctionId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_offerId_key" ON "Settlement"("offerId");

-- CreateIndex
CREATE INDEX "Settlement_offerId_idx" ON "Settlement"("offerId");

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

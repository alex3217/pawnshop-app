-- CreateEnum
CREATE TYPE "public"."AuctionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."SettlementStatus" AS ENUM ('PENDING', 'CHARGED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."Auction" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "public"."AuctionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startingPrice" DECIMAL(10,2) NOT NULL,
    "minIncrement" DECIMAL(10,2) NOT NULL,
    "reservePrice" DECIMAL(10,2),
    "buyItNowPrice" DECIMAL(10,2),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "antiSnipeWindowSec" INTEGER NOT NULL DEFAULT 120,
    "extendedEndsAt" TIMESTAMP(3),
    "currentPrice" DECIMAL(10,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Bid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Settlement" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "winnerUserId" TEXT NOT NULL,
    "finalPrice" DECIMAL(10,2) NOT NULL,
    "status" "public"."SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_itemId_key" ON "public"."Auction"("itemId");

-- CreateIndex
CREATE INDEX "Auction_status_endsAt_idx" ON "public"."Auction"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Auction_shopId_status_idx" ON "public"."Auction"("shopId", "status");

-- CreateIndex
CREATE INDEX "Bid_auctionId_amount_idx" ON "public"."Bid"("auctionId", "amount");

-- CreateIndex
CREATE INDEX "Bid_userId_auctionId_idx" ON "public"."Bid"("userId", "auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_auctionId_key" ON "public"."Settlement"("auctionId");

-- AddForeignKey
ALTER TABLE "public"."Auction" ADD CONSTRAINT "Auction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Auction" ADD CONSTRAINT "Auction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."PawnShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bid" ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "public"."Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bid" ADD CONSTRAINT "Bid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Settlement" ADD CONSTRAINT "Settlement_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "public"."Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

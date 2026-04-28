CREATE TABLE IF NOT EXISTS "AutoBid" (
  "id" TEXT NOT NULL,
  "auctionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "maxAmount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutoBid_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutoBid_auctionId_userId_key"
ON "AutoBid"("auctionId", "userId");

CREATE INDEX IF NOT EXISTS "AutoBid_auctionId_maxAmount_idx"
ON "AutoBid"("auctionId", "maxAmount");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AutoBid_auctionId_fkey'
  ) THEN
    ALTER TABLE "AutoBid"
    ADD CONSTRAINT "AutoBid_auctionId_fkey"
    FOREIGN KEY ("auctionId") REFERENCES "Auction"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AutoBid_userId_fkey'
  ) THEN
    ALTER TABLE "AutoBid"
    ADD CONSTRAINT "AutoBid_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

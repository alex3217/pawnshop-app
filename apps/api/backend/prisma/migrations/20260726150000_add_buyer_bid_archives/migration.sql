CREATE TABLE "BidArchive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BidArchive_userId_bidId_key" ON "BidArchive"("userId", "bidId");
CREATE INDEX "BidArchive_userId_archivedAt_idx" ON "BidArchive"("userId", "archivedAt");
CREATE INDEX "BidArchive_bidId_idx" ON "BidArchive"("bidId");

ALTER TABLE "BidArchive"
ADD CONSTRAINT "BidArchive_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BidArchive"
ADD CONSTRAINT "BidArchive_bidId_fkey"
FOREIGN KEY ("bidId") REFERENCES "Bid"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

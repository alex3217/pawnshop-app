CREATE TABLE "OwnerApplicationReviewHistory" (
  "id" TEXT NOT NULL,
  "ownerApplicationId" TEXT NOT NULL,
  "previousStatus" "OwnerApplicationStatus" NOT NULL,
  "newStatus" "OwnerApplicationStatus" NOT NULL,
  "decisionReason" TEXT,
  "adminNotes" TEXT,
  "reviewerId" TEXT NOT NULL,
  "reviewerName" TEXT,
  "reviewerEmail" TEXT,
  "reviewerRole" "Role",
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OwnerApplicationReviewHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnerApplicationReviewHistory_ownerApplicationId_reviewedAt_id_idx"
ON "OwnerApplicationReviewHistory"("ownerApplicationId", "reviewedAt", "id");

CREATE INDEX "OwnerApplicationReviewHistory_reviewerId_reviewedAt_idx"
ON "OwnerApplicationReviewHistory"("reviewerId", "reviewedAt");

ALTER TABLE "OwnerApplicationReviewHistory"
ADD CONSTRAINT "OwnerApplicationReviewHistory_ownerApplicationId_fkey"
FOREIGN KEY ("ownerApplicationId") REFERENCES "OwnerApplication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

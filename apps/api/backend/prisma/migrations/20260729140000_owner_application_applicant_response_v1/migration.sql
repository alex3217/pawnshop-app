CREATE TABLE "OwnerApplicationResubmission" (
  "id" TEXT NOT NULL,
  "ownerApplicationId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "previousStatus" "OwnerApplicationStatus" NOT NULL,
  "newStatus" "OwnerApplicationStatus" NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerApplicationResubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnerApplicationResubmission_ownerApplicationId_submittedAt_id_idx"
ON "OwnerApplicationResubmission"("ownerApplicationId", "submittedAt", "id");

CREATE INDEX "OwnerApplicationResubmission_ownerId_submittedAt_idx"
ON "OwnerApplicationResubmission"("ownerId", "submittedAt");

ALTER TABLE "OwnerApplicationResubmission"
ADD CONSTRAINT "OwnerApplicationResubmission_ownerApplicationId_fkey"
FOREIGN KEY ("ownerApplicationId") REFERENCES "OwnerApplication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OwnerApplicationResubmission"
ADD CONSTRAINT "OwnerApplicationResubmission_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "actionUrl" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_dedupeKey_key"
ON "Notification"("dedupeKey");

CREATE INDEX "Notification_userId_readAt_createdAt_idx"
ON "Notification"("userId", "readAt", "createdAt");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

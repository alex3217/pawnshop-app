ALTER TABLE "ShopConversation"
  ADD COLUMN "moderationState" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3);

CREATE TABLE "UserGovernanceRestriction" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "messagingRestricted" BOOLEAN NOT NULL DEFAULT false,
  "shopInitiatedContactDisabled" BOOLEAN NOT NULL DEFAULT false, "discoverabilityRestricted" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "UserGovernanceRestriction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserGovernanceRestriction_userId_key" ON "UserGovernanceRestriction"("userId");
CREATE INDEX "UserGovernanceRestriction_messagingRestricted_idx" ON "UserGovernanceRestriction"("messagingRestricted");
CREATE INDEX "UserGovernanceRestriction_discoverabilityRestricted_idx" ON "UserGovernanceRestriction"("discoverabilityRestricted");
ALTER TABLE "UserGovernanceRestriction" ADD CONSTRAINT "UserGovernanceRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserGovernanceAction" (
  "id" TEXT NOT NULL, "targetUserId" TEXT NOT NULL, "actorUserId" TEXT, "action" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL, "beforeState" JSONB NOT NULL, "afterState" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UserGovernanceAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserGovernanceAction_targetUserId_createdAt_idx" ON "UserGovernanceAction"("targetUserId", "createdAt");
CREATE INDEX "UserGovernanceAction_actorUserId_createdAt_idx" ON "UserGovernanceAction"("actorUserId", "createdAt");
CREATE INDEX "UserGovernanceAction_correlationId_idx" ON "UserGovernanceAction"("correlationId");
ALTER TABLE "UserGovernanceAction" ADD CONSTRAINT "UserGovernanceAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserGovernanceAction" ADD CONSTRAINT "UserGovernanceAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MessagingAbuseReport" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "reporterUserId" TEXT, "assignedToId" TEXT,
  "category" TEXT NOT NULL DEFAULT 'OTHER', "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingAbuseReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessagingAbuseReport_conversationId_createdAt_idx" ON "MessagingAbuseReport"("conversationId", "createdAt");
CREATE INDEX "MessagingAbuseReport_status_createdAt_idx" ON "MessagingAbuseReport"("status", "createdAt");
ALTER TABLE "MessagingAbuseReport" ADD CONSTRAINT "MessagingAbuseReport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ShopConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingAbuseReport" ADD CONSTRAINT "MessagingAbuseReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessagingAbuseReport" ADD CONSTRAINT "MessagingAbuseReport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

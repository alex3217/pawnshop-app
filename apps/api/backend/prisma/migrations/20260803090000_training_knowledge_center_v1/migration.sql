CREATE TYPE "TrainingContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
CREATE TYPE "TrainingContentType" AS ENUM ('VIDEO', 'TUTORIAL');
CREATE TYPE "TrainingDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

CREATE TABLE "TrainingContent" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL, "category" TEXT NOT NULL,
  "type" "TrainingContentType" NOT NULL,
  "status" "TrainingContentStatus" NOT NULL DEFAULT 'DRAFT',
  "difficulty" "TrainingDifficulty" NOT NULL DEFAULT 'BEGINNER',
  "durationSeconds" INTEGER, "videoUrl" TEXT, "featured" BOOLEAN NOT NULL DEFAULT false,
  "required" BOOLEAN NOT NULL DEFAULT false, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingContent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrainingAudience" (
  "id" TEXT NOT NULL, "contentId" TEXT NOT NULL, "role" "Role" NOT NULL,
  CONSTRAINT "TrainingAudience_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrainingTutorialStep" (
  "id" TEXT NOT NULL, "contentId" TEXT NOT NULL, "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL, "body" TEXT NOT NULL,
  CONSTRAINT "TrainingTutorialStep_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrainingProgress" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "contentId" TEXT NOT NULL,
  "resumePositionSeconds" INTEGER NOT NULL DEFAULT 0, "completedAt" TIMESTAMP(3),
  "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrainingContent_slug_key" ON "TrainingContent"("slug");
CREATE INDEX "TrainingContent_status_sortOrder_createdAt_idx" ON "TrainingContent"("status", "sortOrder", "createdAt");
CREATE INDEX "TrainingContent_category_status_idx" ON "TrainingContent"("category", "status");
CREATE INDEX "TrainingContent_featured_status_sortOrder_idx" ON "TrainingContent"("featured", "status", "sortOrder");
CREATE UNIQUE INDEX "TrainingAudience_contentId_role_key" ON "TrainingAudience"("contentId", "role");
CREATE INDEX "TrainingAudience_role_contentId_idx" ON "TrainingAudience"("role", "contentId");
CREATE UNIQUE INDEX "TrainingTutorialStep_contentId_position_key" ON "TrainingTutorialStep"("contentId", "position");
CREATE INDEX "TrainingTutorialStep_contentId_position_idx" ON "TrainingTutorialStep"("contentId", "position");
CREATE UNIQUE INDEX "TrainingProgress_userId_contentId_key" ON "TrainingProgress"("userId", "contentId");
CREATE INDEX "TrainingProgress_userId_completedAt_updatedAt_idx" ON "TrainingProgress"("userId", "completedAt", "updatedAt");
CREATE INDEX "TrainingProgress_contentId_completedAt_idx" ON "TrainingProgress"("contentId", "completedAt");
ALTER TABLE "TrainingAudience" ADD CONSTRAINT "TrainingAudience_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "TrainingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingTutorialStep" ADD CONSTRAINT "TrainingTutorialStep_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "TrainingContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "TrainingContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

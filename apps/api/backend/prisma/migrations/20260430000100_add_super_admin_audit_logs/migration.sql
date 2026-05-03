CREATE TABLE IF NOT EXISTS public."SuperAdminAuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "routeKey" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "statusCode" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "requestId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SuperAdminAuditLog_actorId_createdAt_idx"
  ON public."SuperAdminAuditLog"("actorId", "createdAt");

CREATE INDEX IF NOT EXISTS "SuperAdminAuditLog_actorEmail_createdAt_idx"
  ON public."SuperAdminAuditLog"("actorEmail", "createdAt");

CREATE INDEX IF NOT EXISTS "SuperAdminAuditLog_action_createdAt_idx"
  ON public."SuperAdminAuditLog"("action", "createdAt");

CREATE INDEX IF NOT EXISTS "SuperAdminAuditLog_targetType_targetId_idx"
  ON public."SuperAdminAuditLog"("targetType", "targetId");

CREATE INDEX IF NOT EXISTS "SuperAdminAuditLog_success_createdAt_idx"
  ON public."SuperAdminAuditLog"("success", "createdAt");

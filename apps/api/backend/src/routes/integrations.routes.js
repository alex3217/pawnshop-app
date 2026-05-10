// File: apps/api/backend/src/routes/integrations.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listMyIntegrations,
  createIntegration,
  updateIntegration,
  testIntegration,
  syncIntegration,
  listIntegrationMappings,
  createIntegrationMapping,
  deleteIntegrationMapping,
  listIntegrationJobs,
  listIntegrationLogs,
  deleteIntegration,
  receiveIntegrationWebhook,
} from "../controllers/integrations.controller.js";

const router = Router();

const OWNER_ADMIN_ROLES = ["OWNER", "ADMIN", "SUPER_ADMIN"];

function asyncRoute(handler) {
  return function wrappedRoute(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.post("/webhooks/:id", asyncRoute(receiveIntegrationWebhook));

router.get(
  "/mine",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(listMyIntegrations),
);

router.post(
  "/",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(createIntegration),
);

router.patch(
  "/:id",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(updateIntegration),
);

router.post(
  "/:id/test",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(testIntegration),
);

router.post(
  "/:id/sync",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(syncIntegration),
);


router.get(
  "/:id/mappings",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(listIntegrationMappings),
);

router.post(
  "/:id/mappings",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(createIntegrationMapping),
);

router.delete(
  "/:id/mappings/:mappingId",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(deleteIntegrationMapping),
);

router.get(
  "/:id/jobs",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(listIntegrationJobs),
);

router.get(
  "/:id/logs",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(listIntegrationLogs),
);

router.delete(
  "/:id",
  authRequired,
  requireRole(...OWNER_ADMIN_ROLES),
  asyncRoute(deleteIntegration),
);

export default router;

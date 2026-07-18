import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import {
  archiveItemIntake,
  getItemIntake,
  listItemIntakes,
  publishItemIntake,
  reviewItemIntake,
} from "../controllers/itemIntakes.controller.js";

const router = Router();

router.get(
  "/",
  authRequired,
  requireOwnerAdminOrStaffPermission("inventory:read"),
  listItemIntakes,
);

router.get(
  "/:id",
  authRequired,
  requireOwnerAdminOrStaffPermission("inventory:read"),
  getItemIntake,
);

router.patch(
  "/:id/review",
  authRequired,
  requireOwnerAdminOrStaffPermission("inventory:write"),
  reviewItemIntake,
);

router.post(
  "/:id/archive",
  authRequired,
  requireOwnerAdminOrStaffPermission("inventory:write"),
  archiveItemIntake,
);

router.post(
  "/:id/publish",
  authRequired,
  requireOwnerAdminOrStaffPermission("inventory:write"),
  publishItemIntake,
);

export default router;

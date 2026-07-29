import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import {
  listMyNotifications,
  markMyNotificationRead,
} from "../controllers/notifications.controller.js";

const router = Router();
router.use(authRequired);
router.get("/", listMyNotifications);
router.patch("/:id/read", markMyNotificationRead);
export default router;

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { requireMfaStepUpWhenRequired } from "../middleware/mfaStepUp.js";
import { createManagedTraining, getTraining, lifecycleManagedTraining, listManagedTraining, listTraining, reorderManagedTraining, updateManagedTraining, updateProgress } from "../controllers/training.controller.js";

const router = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.use(authRequired);
router.get("/", asyncRoute(listTraining));
router.get("/content/:slug", asyncRoute(getTraining));
router.put("/content/:id/progress", asyncRoute(updateProgress));
router.use("/admin", requireRole("SUPER_ADMIN"));
router.get("/admin", asyncRoute(listManagedTraining));
router.post("/admin", requireMfaStepUpWhenRequired("configuration.training.create"), asyncRoute(createManagedTraining));
router.patch("/admin/order", requireMfaStepUpWhenRequired("configuration.training.reorder"), asyncRoute(reorderManagedTraining));
router.patch("/admin/:id", requireMfaStepUpWhenRequired("configuration.training.update"), asyncRoute(updateManagedTraining));
router.post("/admin/:id/lifecycle", requireMfaStepUpWhenRequired("configuration.training.lifecycle"), asyncRoute(lifecycleManagedTraining));
export default router;

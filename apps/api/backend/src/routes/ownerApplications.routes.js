import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import {
  getMyOwnerApplication,
  resubmitMyOwnerApplication,
  submitMyOwnerApplication,
  updateMyOwnerApplication,
} from "../controllers/ownerApplications.controller.js";

const router = Router();
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

router.use(authRequired);
router.get("/me", asyncRoute(getMyOwnerApplication));
router.patch("/me", asyncRoute(updateMyOwnerApplication));
router.post("/me/submit", asyncRoute(submitMyOwnerApplication));
router.post("/me/resubmit", asyncRoute(resubmitMyOwnerApplication));

export default router;

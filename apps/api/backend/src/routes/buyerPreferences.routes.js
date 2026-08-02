import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { patchMyBuyerPreferences, readMyBuyerPreferences } from "../controllers/buyerPreferences.controller.js";

const router = Router();
const buyer = [authRequired, requireRole("CONSUMER", "ADMIN")];
router.get("/", ...buyer, readMyBuyerPreferences);
router.patch("/", ...buyer, patchMyBuyerPreferences);
export default router;

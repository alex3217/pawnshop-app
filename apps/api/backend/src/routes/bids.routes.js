import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { myBids } from "../controllers/bids.controller.js";

const router = Router();

router.get("/mine", authRequired, requireRole("CONSUMER", "ADMIN"), myBids);

export default router;

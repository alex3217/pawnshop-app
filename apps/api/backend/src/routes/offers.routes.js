import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  createOffer,
  listOffersForBuyer,
  listOffersForOwner,
} from "../controllers/offers.controller.js";

const router = Router();

router.get("/mine", authRequired, requireRole("CONSUMER", "ADMIN"), listOffersForBuyer);
router.get("/owner", authRequired, requireRole("OWNER", "ADMIN"), listOffersForOwner);
router.post("/", authRequired, requireRole("CONSUMER", "ADMIN"), createOffer);

export default router;

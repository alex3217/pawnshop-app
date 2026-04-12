import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  createOffer,
  listOffersForBuyer,
  listOffersForOwner,
  acceptOffer,
  rejectOffer,
} from "../controllers/offers.controller.js";

const router = Router();

router.get("/mine", authRequired, requireRole("CONSUMER", "ADMIN"), listOffersForBuyer);
router.get("/owner", authRequired, requireRole("OWNER", "ADMIN"), listOffersForOwner);
router.post("/", authRequired, requireRole("CONSUMER", "ADMIN"), createOffer);
router.patch("/:id/accept", authRequired, requireRole("OWNER", "ADMIN"), acceptOffer);
router.patch("/:id/reject", authRequired, requireRole("OWNER", "ADMIN"), rejectOffer);

export default router;

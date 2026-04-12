import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  acceptCounterOffer,
  acceptOffer,
  counterOffer,
  createOffer,
  declineCounterOffer,
  listOffersForBuyer,
  listOffersForOwner,
  rejectOffer,
} from "../controllers/offers.controller.js";

const router = Router();

router.get("/mine", authRequired, requireRole("CONSUMER", "ADMIN"), listOffersForBuyer);
router.get("/owner", authRequired, requireRole("OWNER", "ADMIN"), listOffersForOwner);

router.post("/", authRequired, requireRole("CONSUMER", "ADMIN"), createOffer);

router.patch("/:id/accept", authRequired, requireRole("OWNER", "ADMIN"), acceptOffer);
router.patch("/:id/reject", authRequired, requireRole("OWNER", "ADMIN"), rejectOffer);
router.patch("/:id/counter", authRequired, requireRole("OWNER", "ADMIN"), counterOffer);

router.patch("/:id/accept-counter", authRequired, requireRole("CONSUMER", "ADMIN"), acceptCounterOffer);
router.patch("/:id/decline-counter", authRequired, requireRole("CONSUMER", "ADMIN"), declineCounterOffer);

export default router;

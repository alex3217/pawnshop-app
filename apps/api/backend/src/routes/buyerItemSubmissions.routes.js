import express from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  acceptBuyerItemSubmissionOffer,
  createBuyerItemSubmission,
  createBuyerItemSubmissionOffer,
  getMyBuyerItemSubmissionOffers,
  rejectBuyerItemSubmissionOffer,
  scanBuyerItemSubmission,
  getMyBuyerItemSubmissions,
  getOwnerBuyerItemSubmissions,
  reviewBuyerItemSubmission,
  withdrawBuyerItemSubmission,
} from "../controllers/buyerItemSubmissions.controller.js";

const router = express.Router();

router.post("/", authRequired, requireRole("CONSUMER", "ADMIN"), createBuyerItemSubmission);

router.post(
  "/scan",
  authRequired,
  requireRole("CONSUMER"),
  scanBuyerItemSubmission,
);

router.get("/mine", authRequired, requireRole("CONSUMER", "ADMIN"), getMyBuyerItemSubmissions);
router.patch("/:id/withdraw", authRequired, requireRole("CONSUMER", "ADMIN"), withdrawBuyerItemSubmission);

router.get("/owner", authRequired, requireRole("OWNER", "ADMIN"), getOwnerBuyerItemSubmissions);
router.patch("/:id/review", authRequired, requireRole("OWNER", "ADMIN"), reviewBuyerItemSubmission);

router.post("/:id/offers", authRequired, requireRole("OWNER", "ADMIN"), createBuyerItemSubmissionOffer);

router.get("/offers/mine", authRequired, requireRole("CONSUMER", "ADMIN"), getMyBuyerItemSubmissionOffers);
router.patch("/offers/:offerId/accept", authRequired, requireRole("CONSUMER", "ADMIN"), acceptBuyerItemSubmissionOffer);
router.patch("/offers/:offerId/reject", authRequired, requireRole("CONSUMER", "ADMIN"), rejectBuyerItemSubmissionOffer);


export default router;

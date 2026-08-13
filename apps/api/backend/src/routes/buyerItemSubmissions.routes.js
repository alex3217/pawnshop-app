import express from "express";
import { rateLimit } from "express-rate-limit";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  acceptBuyerItemSubmissionOffer,
  createBuyerItemSubmission,
  createBuyerItemSubmissionOffer,
  getMyCustomerItemIntakeLinkage,
  getMyBuyerItemSubmissionOffers,
  rejectBuyerItemSubmissionOffer,
  scanBuyerItemSubmission,
  getMyBuyerItemSubmissions,
  getOwnerBuyerItemSubmissions,
  reviewBuyerItemSubmission,
  withdrawBuyerItemSubmission,
} from "../controllers/buyerItemSubmissions.controller.js";
import {
  declineOpportunity, distribute, getConversation, searchShops,
  sellerDashboard, sendMessage, shopOpportunities, viewOpportunity,
} from "../controllers/submissionDistribution.controller.js";

const router = express.Router();
const distributionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const submissionMessageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

router.post("/", authRequired, requireRole("CONSUMER", "ADMIN"), createBuyerItemSubmission);

router.post(
  "/scan",
  authRequired,
  requireRole("CONSUMER"),
  scanBuyerItemSubmission,
);

router.get(
  "/intakes/:intakeId",
  authRequired,
  requireRole("CONSUMER"),
  getMyCustomerItemIntakeLinkage,
);

router.get("/mine", authRequired, requireRole("CONSUMER", "ADMIN"), getMyBuyerItemSubmissions);
router.patch("/:id/withdraw", authRequired, requireRole("CONSUMER", "ADMIN"), withdrawBuyerItemSubmission);
router.get("/distribution/shops", authRequired, requireRole("CONSUMER", "ADMIN"), searchShops);
router.post("/:id/distribute", authRequired, requireRole("CONSUMER", "ADMIN"), distributionLimiter, distribute);
router.get("/:id/dashboard", authRequired, requireRole("CONSUMER", "ADMIN"), sellerDashboard);

router.get("/owner", authRequired, requireRole("OWNER", "ADMIN"), getOwnerBuyerItemSubmissions);
router.get("/owner/opportunities", authRequired, requireRole("OWNER", "ADMIN"), shopOpportunities);
router.get("/:id/opportunity", authRequired, requireRole("OWNER", "ADMIN"), viewOpportunity);
router.patch("/:id/decline", authRequired, requireRole("OWNER", "ADMIN"), declineOpportunity);
router.patch("/:id/review", authRequired, requireRole("OWNER", "ADMIN"), reviewBuyerItemSubmission);

router.post("/:id/offers", authRequired, requireRole("OWNER", "ADMIN"), createBuyerItemSubmissionOffer);

router.get("/offers/mine", authRequired, requireRole("CONSUMER", "ADMIN"), getMyBuyerItemSubmissionOffers);
router.patch("/offers/:offerId/accept", authRequired, requireRole("CONSUMER", "ADMIN"), acceptBuyerItemSubmissionOffer);
router.patch("/offers/:offerId/reject", authRequired, requireRole("CONSUMER", "ADMIN"), rejectBuyerItemSubmissionOffer);
router.get("/conversations/:conversationId", authRequired, getConversation);
router.post("/conversations/:conversationId/messages", authRequired, submissionMessageLimiter, sendMessage);


export default router;

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { createListingAssistantSuggestion } from "../services/aiListingAssistant.service.js";

const router = Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.post(
  "/listing-assistant",
  authRequired,
  requireRole("OWNER", "ADMIN"),
  asyncRoute(createListingAssistantSuggestion)
);

export default router;

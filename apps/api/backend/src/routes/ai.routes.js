import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { createListingAssistantSuggestion } from "../services/aiListingAssistant.service.js";
import { aiListingRateLimit } from "../middleware/aiRateLimit.js";
import { enforceAiDescriptionAuthorization } from "../services/aiDescriptionAuthorization.service.js";

const router = Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.post(
  "/listing-assistant",
  authRequired,
  aiListingRateLimit,
  asyncRoute(enforceAiDescriptionAuthorization),
  asyncRoute(createListingAssistantSuggestion)
);

export default router;

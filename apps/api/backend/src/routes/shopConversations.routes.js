import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { shopMessagingRateLimit } from "../middleware/shopMessagingRateLimit.js";
import {
  blockConversation, closeConversation, createConversation, getConversation,
  listSellerConversations, listShopConversations, markRead, postMessage,
  reopenConversation, reportConversation, unreadCounts,
} from "../controllers/shopConversations.controller.js";

const router = Router();
router.use(authRequired);
router.get("/seller", listSellerConversations);
router.get("/shops", listShopConversations);
router.get("/unread-counts", unreadCounts);
router.post("/", shopMessagingRateLimit, createConversation);
router.get("/:id", getConversation);
router.post("/:id/messages", shopMessagingRateLimit, postMessage);
router.patch("/:id/read", markRead);
router.patch("/:id/close", closeConversation);
router.patch("/:id/reopen", reopenConversation);
router.patch("/:id/block", blockConversation);
router.post("/:id/report", reportConversation);
export default router;

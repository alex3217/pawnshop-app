import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { firstContactRateLimit, shopMessagingRateLimit } from "../middleware/shopMessagingRateLimit.js";
import {
  blockConversation, closeConversation, createConversation, getConversation,
  listSellerConversations, listShopConversations, markRead, postMessage,
  reopenConversation, reportConversation, unreadCounts, searchShopMessageRecipients,
  createShopOutboundConversation,
  archiveConversation, createConsumerSellerConversation, muteConversation,
  searchConsumerRecipients, unarchiveConversation, unmuteConversation,
} from "../controllers/shopConversations.controller.js";

const router = Router();
router.use(authRequired);
router.get("/seller", listSellerConversations);
router.get("/shops", listShopConversations);
router.get("/unread-counts", unreadCounts);
router.get("/shop-recipients", searchShopMessageRecipients);
router.get("/consumer-recipients", searchConsumerRecipients);
router.post("/consumer-compose", firstContactRateLimit, createConsumerSellerConversation);
router.post("/shop-compose", shopMessagingRateLimit, createShopOutboundConversation);
router.post("/", shopMessagingRateLimit, createConversation);
router.get("/:id", getConversation);
router.post("/:id/messages", shopMessagingRateLimit, postMessage);
router.patch("/:id/read", markRead);
router.patch("/:id/close", closeConversation);
router.patch("/:id/reopen", reopenConversation);
router.patch("/:id/block", blockConversation);
router.patch("/:id/mute", muteConversation);
router.patch("/:id/unmute", unmuteConversation);
router.patch("/:id/archive", archiveConversation);
router.patch("/:id/unarchive", unarchiveConversation);
router.post("/:id/report", reportConversation);
export default router;

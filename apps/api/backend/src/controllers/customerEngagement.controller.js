import crypto from "node:crypto";
import { getShopCustomerGrowth, getShopReferralSummary, recordReferralAttribution } from "../services/customerEngagement.service.js";

export async function getCustomerGrowth(req, res) {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const growth = await getShopCustomerGrowth(req.params.shopId, new Date(Date.now() - days * 86_400_000));
  return res.json({ success: true, growth });
}

export async function getShopReferrals(req, res) {
  const referrals = await getShopReferralSummary(req.params.shopId, `${req.protocol}://${req.get("host")}`);
  return res.json({ success: true, referrals });
}

export async function redirectReferral(req, res) {
  try {
    await recordReferralAttribution({ code: req.params.code, eventType: "VISIT", eventKey: `visit:${req.params.code}:${crypto.randomUUID()}`, metadata: { destination: "BUYER_REGISTRATION" } });
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, `/register?ref=${encodeURIComponent(req.params.code)}`);
  } catch (error) { return res.status(error?.statusCode || 500).json({ success: false, error: error.message }); }
}

export async function convertReferral(req, res) {
  const actorId = String(req.user?.sub || req.user?.id || "");
  const eventType = String(req.body?.eventType || "REGISTRATION_COMPLETED").toUpperCase();
  if (!new Set(["REGISTRATION_STARTED", "REGISTRATION_COMPLETED", "BUYER_ACTIVE"]).has(eventType)) return res.status(400).json({ success: false, error: "Unsupported referral event." });
  try {
    const event = await recordReferralAttribution({ code: req.params.code, attributedUserId: actorId, eventType, eventKey: `conversion:${req.params.code}:${actorId}:${eventType}` });
    return res.status(200).json({ success: true, attribution: { id: event.id, eventType: event.eventType, occurredAt: event.occurredAt }, rewardsIssued: 0 });
  } catch (error) { return res.status(error?.statusCode || 500).json({ success: false, error: error.message, code: error.code }); }
}

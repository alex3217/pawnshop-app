import { z } from "zod";
import { disableMarketingCampaign, getMarketingAdministration } from "../services/marketingAdministration.service.js";

export async function listMarketingAdministration(req, res) {
  const active = req.query.active === undefined ? undefined : req.query.active === "true";
  const administration = await getMarketingAdministration({ query: String(req.query.q || "").trim().slice(0, 100), active });
  return res.json({ success: true, administration });
}

export async function patchMarketingCampaignStatus(req, res) {
  const parsed = z.object({ active: z.literal(false), reason: z.string().trim().min(3).max(500) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "Disabling requires active=false and a reason." });
  try {
    const campaign = await disableMarketingCampaign({ campaignId: req.params.campaignId, reason: parsed.data.reason, req });
    return res.json({ success: true, campaign: { id: campaign.id, isActive: campaign.isActive }, audited: true });
  } catch (error) { return res.status(error?.statusCode || 500).json({ success: false, error: error.message }); }
}

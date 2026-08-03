import { getBusinessGrowthOverview, getSellerPlanUsage } from "../services/businessGrowth.service.js";

function sendError(res, error) {
  return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || "Unable to load business growth data." });
}

export async function getShopBusinessGrowth(req, res) {
  try {
    const growth = await getBusinessGrowthOverview(req.params.shopId);
    return res.json({ success: true, growth });
  } catch (error) { return sendError(res, error); }
}

export async function getShopPlanUsage(req, res) {
  try {
    const planUsage = await getSellerPlanUsage(req.params.shopId);
    return res.json({ success: true, planUsage });
  } catch (error) { return sendError(res, error); }
}

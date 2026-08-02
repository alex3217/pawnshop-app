import { getBuyerPreferences, updateBuyerPreferences } from "../services/buyerPreferences.service.js";

function sendError(res, error) {
  return res.status(Number(error?.statusCode) || 500).json({ success: false, error: error?.message || "Unable to manage buyer preferences.", ...(error?.details ? { details: error.details } : {}) });
}
export async function readMyBuyerPreferences(req, res) {
  try { return res.json({ success: true, preferences: await getBuyerPreferences(req.user.sub) }); }
  catch (error) { return sendError(res, error); }
}
export async function patchMyBuyerPreferences(req, res) {
  try { return res.json({ success: true, preferences: await updateBuyerPreferences(req.user.sub, req.body) }); }
  catch (error) { return sendError(res, error); }
}

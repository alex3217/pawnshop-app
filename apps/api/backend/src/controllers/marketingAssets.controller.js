import { listMarketingAssetTemplates, renderMarketingAssetPdf } from "../services/marketingAssets.service.js";

export async function listShopMarketingAssetTemplates(req, res) {
  const templates = await listMarketingAssetTemplates(req.params.shopId);
  return res.json({ success: true, templates });
}

export async function downloadShopMarketingAsset(req, res) {
  try {
    const origin = `${req.protocol}://${req.get("host")}`;
    const rendered = await renderMarketingAssetPdf({
      shopId: req.params.shopId,
      templateType: req.params.templateType,
      campaignId: String(req.query.campaignId || "").trim() || undefined,
      itemId: String(req.query.itemId || "").trim() || undefined,
      origin,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${rendered.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(Buffer.from(rendered.bytes));
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ success: false, error: error.message || "Unable to render marketing asset." });
  }
}

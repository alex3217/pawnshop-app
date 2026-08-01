import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma.js";
import {
  assertMarketingTemplateAccessForShop,
  getMarketingTemplateAccess,
  getSellerEntitlementsForShop,
  marketingTemplateMinimumPlans,
} from "./sellerPlan.service.js";
import { ensureShopReferralCode } from "./customerEngagement.service.js";

const TEMPLATE_DETAILS = Object.freeze({
  STOREFRONT_POSTER: { name: "Storefront poster", size: "LETTER", cta: "Scan to shop this store on PawnLoop" },
  WINDOW_24_7_POSTER: { name: "Shop online 24/7 window poster", size: "LETTER", cta: "Store closed? Shop online 24/7" },
  COUNTER_SIGN: { name: "Counter sign", size: "HALF_LETTER", cta: "Scan to see inventory, photos, and offers" },
  RECEIPT_INSERT: { name: "Receipt insert", size: "HALF_LETTER", cta: "Keep shopping this store on PawnLoop" },
  PRODUCT_DISPLAY_CARD: { name: "Product display card", size: "FOUR_BY_SIX", cta: "Scan for details, photos, availability, and offers" },
  NEW_ARRIVALS_FLYER: { name: "New arrivals flyer", size: "LETTER", cta: "Scan to see this shop's newest arrivals" },
  AUCTION_FLYER: { name: "Auction flyer", size: "LETTER", cta: "Scan to view this shop's public auctions" },
  SELL_OR_PAWN_FLYER: { name: "Sell or pawn flyer", size: "LETTER", cta: "Scan to start a sell or pawn request with this shop" },
  REVIEW_REQUEST_CARD: { name: "Review request card", size: "FOUR_BY_SIX", cta: "Visit this shop's PawnLoop storefront" },
  REFERRAL_CARD: { name: "Referral card", size: "FOUR_BY_SIX", cta: "Share this shop with a friend" },
});

const PAGE_SIZES = { LETTER: [612, 792], HALF_LETTER: [396, 612], FOUR_BY_SIX: [288, 432] };

export async function listMarketingAssetTemplates(shopId) {
  const entitlements = await getSellerEntitlementsForShop(shopId);
  return Object.entries(TEMPLATE_DETAILS).map(([type, detail]) => ({
    type,
    ...detail,
    minimumPlan: marketingTemplateMinimumPlans[type],
    available: getMarketingTemplateAccess(entitlements, type).allowed,
    format: "PDF",
  }));
}

async function loadAssetData(shopId, templateType, { campaignId, itemId } = {}) {
  await assertMarketingTemplateAccessForShop(shopId, templateType);
  const shop = await prisma.pawnShop.findFirst({
    where: { id: shopId, isDeleted: false, subscriptionStatus: "ACTIVE" },
    select: { id: true, name: true, slug: true, address: true, city: true, state: true, zip: true, phone: true },
  });
  if (!shop) throw Object.assign(new Error("Active shop not found."), { statusCode: 404 });

  let item = null;
  if (templateType === "PRODUCT_DISPLAY_CARD") {
    item = await prisma.item.findFirst({
      where: { id: String(itemId || ""), pawnShopId: shopId, isDeleted: false, status: "AVAILABLE" },
      select: { id: true, title: true, price: true },
    });
    if (!item) throw Object.assign(new Error("A public available item owned by this shop is required."), { statusCode: 400 });
  }

  const destinationType = templateType === "PRODUCT_DISPLAY_CARD" ? "ITEM" : {
    NEW_ARRIVALS_FLYER: "NEW_ARRIVALS", AUCTION_FLYER: "AUCTIONS", SELL_OR_PAWN_FLYER: "SELL_ITEM",
  }[templateType];
  const campaign = await prisma.shopMarketingCampaign.findFirst({
    where: {
      shopId,
      isActive: true,
      ...(campaignId ? { id: campaignId } : {}),
      ...(destinationType ? { destinationType, ...(item ? { resourceId: item.id } : {}) } : { isDefault: true }),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!campaign) throw Object.assign(new Error("Create or activate a campaign for this asset destination first."), { statusCode: 409 });
  if (item && campaign.resourceId !== item.id) throw Object.assign(new Error("Campaign does not target the selected public item."), { statusCode: 400 });
  if (templateType === "AUCTION_FLYER") {
    const publicAuctions = await prisma.auction.count({ where: { shopId, item: { isDeleted: false, status: "AVAILABLE" }, status: "LIVE" } });
    if (publicAuctions === 0) throw Object.assign(new Error("This shop has no public active auction to promote."), { statusCode: 409 });
  }
  return { shop, item, campaign };
}

function safeText(value, maximum = 120) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

export async function renderMarketingAssetPdf({ shopId, templateType, campaignId, itemId, origin }) {
  const normalized = String(templateType || "").toUpperCase();
  const detail = TEMPLATE_DETAILS[normalized];
  if (!detail) throw Object.assign(new Error("Unknown marketing template."), { statusCode: 404 });
  const { shop, item, campaign } = await loadAssetData(shopId, normalized, { campaignId, itemId });
  const referral = normalized === "REFERRAL_CARD" ? await ensureShopReferralCode(shopId) : null;
  const destinationUrl = referral ? `${String(origin).replace(/\/$/, "")}/ref/${referral.code}` : `${String(origin).replace(/\/$/, "")}/r/${campaign.shortCode}`;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(PAGE_SIZES[detail.size]);
  const { width, height } = page.getSize();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.04, 0.09, 0.12) });
  page.drawText("PAWNLOOP", { x: 36, y: height - 48, size: 14, font: bold, color: rgb(0.18, 0.82, 0.68) });
  page.drawText(safeText(shop.name, 55), { x: 36, y: height - 92, size: Math.min(26, width / 16), font: bold, color: rgb(1, 1, 1) });
  page.drawText(safeText(item?.title || detail.name, 62), { x: 36, y: height - 130, size: 16, font: bold, color: rgb(0.92, 0.95, 0.97) });
  if (item) page.drawText(`$${Number(item.price).toFixed(2)}  |  Item ${safeText(item.id, 28)}`, { x: 36, y: height - 158, size: 12, font: regular, color: rgb(0.85, 0.9, 0.92) });
  const qrBytes = await QRCode.toBuffer(destinationUrl, { type: "png", errorCorrectionLevel: "M", margin: 4, width: 900 });
  const qr = await pdf.embedPng(qrBytes);
  const qrSize = Math.min(width - 72, height * 0.43);
  page.drawRectangle({ x: (width - qrSize) / 2 - 8, y: height * 0.24 - 8, width: qrSize + 16, height: qrSize + 16, color: rgb(1, 1, 1) });
  page.drawImage(qr, { x: (width - qrSize) / 2, y: height * 0.24, width: qrSize, height: qrSize });
  page.drawText(safeText(detail.cta, 80), { x: 36, y: height * 0.17, size: 13, font: bold, color: rgb(1, 1, 1), maxWidth: width - 72 });
  const location = [shop.address, [shop.city, shop.state, shop.zip].filter(Boolean).join(" "), shop.phone].filter(Boolean).join(" | ");
  if (location) page.drawText(safeText(location, 100), { x: 36, y: height * 0.11, size: 9, font: regular, color: rgb(0.8, 0.85, 0.87), maxWidth: width - 72 });
  page.drawText(safeText(destinationUrl, 90), { x: 36, y: 24, size: 7, font: regular, color: rgb(0.65, 0.72, 0.75), maxWidth: width - 72 });
  return { bytes: await pdf.save(), filename: `pawnloop-${shop.slug || shop.id}-${normalized.toLowerCase().replaceAll("_", "-")}.pdf`, campaignId: campaign.id, destinationUrl };
}

export const marketingAssetTemplates = TEMPLATE_DETAILS;

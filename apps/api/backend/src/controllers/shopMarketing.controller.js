import crypto from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { canAccessShopWithStaffPermission } from "../middleware/staffAccess.middleware.js";
import { assertCanCreateQrCampaignForShop } from "../services/sellerPlan.service.js";

export const DESTINATION_TYPES = [
  "STOREFRONT", "INVENTORY", "NEW_ARRIVALS", "AUCTIONS", "DEALS", "ITEM",
  "CATEGORY", "SELL_ITEM", "PAWN_INQUIRY", "FOLLOW_SHOP", "REVIEW_REQUEST",
  "CUSTOMER_REGISTRATION", "BUYER_REFERRAL", "PAWNSHOP_REFERRAL",
];

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(160),
  destinationType: z.enum(DESTINATION_TYPES).default("STOREFRONT"),
  resourceId: z.string().trim().min(1).max(128).nullable().optional(),
  placementLabel: z.string().trim().min(1).max(160).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

const updateCampaignSchema = campaignSchema.partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

const scanWindows = new Map();
const SCAN_WINDOW_MS = 60_000;
const SCAN_WINDOW_MAX = 30;
const processHashKey = crypto.randomBytes(32);

function userId(req) {
  return String(req?.user?.sub || req?.user?.id || "").trim();
}

function role(req) {
  return String(req?.user?.role || "").trim().toUpperCase();
}

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: "Validation failed",
    details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

async function accessibleShop(req, shopId, permission) {
  const shop = await prisma.pawnShop.findFirst({
    where: { id: shopId, isDeleted: false },
    select: { id: true, name: true, slug: true, ownerId: true, subscriptionStatus: true },
  });
  if (!shop) return null;
  if (["ADMIN", "SUPER_ADMIN"].includes(role(req))) return shop;
  if (role(req) === "OWNER" && shop.ownerId === userId(req)) return shop;
  if (canAccessShopWithStaffPermission(req, permission, shop.id)) return shop;
  return null;
}

function slugBase(name) {
  return String(name || "shop").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 48) || "shop";
}

async function ensureShopSlug(shop) {
  if (shop.slug) return shop.slug;
  const base = slugBase(shop.name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? shop.id.slice(-6).toLowerCase() : crypto.randomBytes(3).toString("hex");
    const slug = `${base}-${suffix}`;
    try {
      await prisma.pawnShop.update({ where: { id: shop.id }, data: { slug }, select: { id: true } });
      return slug;
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
  }
  throw new Error("Unable to allocate a unique shop slug.");
}

function shortCode() {
  return crypto.randomBytes(9).toString("base64url");
}

async function createUniqueCampaign(data) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.shopMarketingCampaign.create({ data: { ...data, shortCode: shortCode() } });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
  }
  throw new Error("Unable to allocate a unique campaign code.");
}

async function ensureDefaultCampaign(shop) {
  const existing = await prisma.shopMarketingCampaign.findFirst({
    where: { shopId: shop.id, isDefault: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return createUniqueCampaign({
    shopId: shop.id,
    name: "Shop storefront",
    destinationType: "STOREFRONT",
    resourceId: null,
    placementLabel: "Permanent shop QR",
    isActive: true,
    isDefault: true,
  });
}

async function validateResource(shopId, destinationType, resourceId) {
  if (destinationType === "ITEM") {
    if (!resourceId) return false;
    return Boolean(await prisma.item.findFirst({
      where: { id: resourceId, pawnShopId: shopId, isDeleted: false, status: "AVAILABLE" },
      select: { id: true },
    }));
  }
  if (destinationType === "CATEGORY") return Boolean(resourceId);
  return resourceId == null;
}

function serializeCampaign(campaign, scanCount = undefined) {
  return {
    ...campaign,
    redirectPath: `/r/${campaign.shortCode}`,
    svgPath: `/api/shops/${campaign.shopId}/marketing/campaigns/${campaign.id}/qr.svg`,
    pngPath: `/api/shops/${campaign.shopId}/marketing/campaigns/${campaign.id}/qr.png`,
    ...(scanCount === undefined ? {} : { scanCount }),
  };
}

export async function listShopMarketingCampaigns(req, res) {
  const shop = await accessibleShop(req, req.params.shopId, "marketing:read");
  if (!shop) return res.status(404).json({ success: false, error: "Shop not found" });
  const slug = await ensureShopSlug(shop);
  await ensureDefaultCampaign({ ...shop, slug });
  const campaigns = await prisma.shopMarketingCampaign.findMany({
    where: { shopId: shop.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { scans: true } } },
  });
  return res.json({
    success: true,
    shop: { id: shop.id, name: shop.name, slug },
    campaigns: campaigns.map(({ _count, ...campaign }) => serializeCampaign(campaign, _count.scans)),
  });
}

export async function createShopMarketingCampaign(req, res) {
  const shop = await accessibleShop(req, req.params.shopId, "marketing:write");
  if (!shop) return res.status(404).json({ success: false, error: "Shop not found" });
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    await ensureDefaultCampaign(shop);
    await assertCanCreateQrCampaignForShop(shop.id);
  } catch (error) {
    return res.status(error?.statusCode || 403).json({ success: false, error: error.message, code: error.code, details: error.details });
  }
  const data = { ...parsed.data, resourceId: parsed.data.resourceId || null };
  if (!(await validateResource(shop.id, data.destinationType, data.resourceId))) {
    return res.status(400).json({ success: false, error: "Destination is not a public resource owned by this shop." });
  }
  const campaign = await createUniqueCampaign({ ...data, shopId: shop.id, isDefault: false });
  return res.status(201).json({ success: true, campaign: serializeCampaign(campaign, 0) });
}

export async function updateShopMarketingCampaign(req, res) {
  const shop = await accessibleShop(req, req.params.shopId, "marketing:write");
  if (!shop) return res.status(404).json({ success: false, error: "Shop not found" });
  const campaign = await prisma.shopMarketingCampaign.findFirst({ where: { id: req.params.campaignId, shopId: shop.id } });
  if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const destinationType = parsed.data.destinationType || campaign.destinationType;
  const resourceId = Object.hasOwn(parsed.data, "resourceId") ? parsed.data.resourceId || null : campaign.resourceId;
  if (!(await validateResource(shop.id, destinationType, resourceId))) {
    return res.status(400).json({ success: false, error: "Destination is not a public resource owned by this shop." });
  }
  const updated = await prisma.shopMarketingCampaign.update({
    where: { id: campaign.id },
    data: { ...parsed.data, resourceId, destinationType },
  });
  return res.json({ success: true, campaign: serializeCampaign(updated) });
}

export async function deleteShopMarketingCampaign(req, res) {
  const shop = await accessibleShop(req, req.params.shopId, "marketing:write");
  if (!shop) return res.status(404).json({ success: false, error: "Shop not found" });
  const campaign = await prisma.shopMarketingCampaign.findFirst({ where: { id: req.params.campaignId, shopId: shop.id } });
  if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });
  if (campaign.isDefault) return res.status(409).json({ success: false, error: "The permanent shop campaign cannot be deleted; deactivate it instead." });
  await prisma.shopMarketingCampaign.delete({ where: { id: campaign.id } });
  return res.json({ success: true, deleted: true });
}

function absoluteRedirectUrl(req, campaign) {
  return `${req.protocol}://${req.get("host")}/r/${campaign.shortCode}`;
}

async function campaignForAsset(req, permission) {
  const shop = await accessibleShop(req, req.params.shopId, permission);
  if (!shop) return null;
  return prisma.shopMarketingCampaign.findFirst({ where: { id: req.params.campaignId, shopId: shop.id } });
}

export async function getCampaignQrSvg(req, res) {
  const campaign = await campaignForAsset(req, "marketing:read");
  if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });
  const svg = await QRCode.toString(absoluteRedirectUrl(req, campaign), { type: "svg", errorCorrectionLevel: "M", margin: 2, width: 640 });
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaign.shortCode}.svg"`);
  return res.send(svg);
}

export async function getCampaignQrPng(req, res) {
  const campaign = await campaignForAsset(req, "marketing:read");
  if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });
  const png = await QRCode.toBuffer(absoluteRedirectUrl(req, campaign), { type: "png", errorCorrectionLevel: "M", margin: 2, width: 1024 });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaign.shortCode}.png"`);
  return res.send(png);
}

function userAgentClass(value) {
  const agent = String(value || "").toLowerCase();
  if (!agent) return null;
  if (/bot|crawler|spider/.test(agent)) return "BOT";
  if (/mobile|android|iphone|ipad/.test(agent)) return "MOBILE";
  return "DESKTOP";
}

function referrerHost(value) {
  if (!value) return null;
  try { return new URL(value).hostname.slice(0, 255) || null; } catch { return null; }
}

function allowScan(req, campaignId) {
  const source = `${req.ip || req.socket?.remoteAddress || "unknown"}|${campaignId}`;
  const key = crypto.createHmac("sha256", processHashKey).update(source).digest("hex");
  const now = Date.now();
  const current = scanWindows.get(key);
  if (!current || now - current.startedAt >= SCAN_WINDOW_MS) {
    scanWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= SCAN_WINDOW_MAX;
}

export function destinationPath(campaign) {
  const shopPath = `/shops/${encodeURIComponent(campaign.shop.slug || campaign.shop.id)}`;
  const paths = {
    STOREFRONT: shopPath,
    INVENTORY: `${shopPath}#inventory`,
    NEW_ARRIVALS: `${shopPath}?view=new-arrivals`,
    AUCTIONS: `/auctions?shopId=${encodeURIComponent(campaign.shop.id)}`,
    DEALS: `${shopPath}?view=deals`,
    ITEM: `/items/${encodeURIComponent(campaign.resourceId || "")}`,
    CATEGORY: `${shopPath}?category=${encodeURIComponent(campaign.resourceId || "")}`,
    SELL_ITEM: `/buyer/sell-item?shopId=${encodeURIComponent(campaign.shop.id)}`,
    PAWN_INQUIRY: `/buyer/sell-item?mode=pawn&shopId=${encodeURIComponent(campaign.shop.id)}`,
    FOLLOW_SHOP: `${shopPath}?action=follow`,
    REVIEW_REQUEST: shopPath,
    CUSTOMER_REGISTRATION: `/register?shopId=${encodeURIComponent(campaign.shop.id)}`,
    BUYER_REFERRAL: `/register?refShop=${encodeURIComponent(campaign.shop.id)}`,
    PAWNSHOP_REFERRAL: `/for-pawn-shops?refShop=${encodeURIComponent(campaign.shop.id)}`,
  };
  return paths[campaign.destinationType] || shopPath;
}

export async function redirectMarketingCampaign(req, res) {
  const campaign = await prisma.shopMarketingCampaign.findUnique({
    where: { shortCode: req.params.shortCode },
    include: { shop: { select: { id: true, slug: true, isDeleted: true, subscriptionStatus: true } } },
  });
  if (!campaign || !campaign.isActive || !campaign.shop || campaign.shop.isDeleted || campaign.shop.subscriptionStatus !== "ACTIVE") {
    return res.status(404).json({ success: false, error: "Campaign not found" });
  }
  if (!(await validateResource(campaign.shopId, campaign.destinationType, campaign.resourceId))) {
    return res.status(410).json({ success: false, error: "Campaign destination is no longer available" });
  }
  if (allowScan(req, campaign.id)) {
    await prisma.shopMarketingCampaignScan.create({
      data: {
        campaignId: campaign.id,
        referrerHost: referrerHost(req.get("referer")),
        userAgentClass: userAgentClass(req.get("user-agent")),
      },
    });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, destinationPath(campaign));
}

export const shopMarketingSchemas = { campaignSchema, updateCampaignSchema };

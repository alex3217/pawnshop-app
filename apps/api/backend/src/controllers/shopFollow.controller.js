import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getBuyerEntitlementsForUser } from "../services/buyerEntitlements.service.js";
import { followShop, serializeShopFollow, unfollowShop, updateShopFollowPreferences } from "../services/shopFollow.service.js";

const preferencesSchema = z.object({
  newArrivals: z.boolean().optional(), deals: z.boolean().optional(), auctions: z.boolean().optional(),
  general: z.boolean().optional(), paused: z.boolean().optional(),
}).strict();
const userId = (req) => String(req.user?.sub || req.user?.id || "");

export async function getShopFollowStatus(req, res) {
  const row = await prisma.shopFollow.findUnique({ where: { userId_shopId: { userId: userId(req), shopId: req.params.shopId } } });
  return res.json({ success: true, follow: serializeShopFollow(row) });
}

export async function createShopFollow(req, res) {
  try {
    await getBuyerEntitlementsForUser(userId(req));
    const row = await followShop(userId(req), req.params.shopId);
    return res.status(200).json({ success: true, follow: serializeShopFollow(row) });
  } catch (error) { return res.status(error?.statusCode || 500).json({ success: false, error: error.message }); }
}

export async function deleteShopFollow(req, res) {
  const row = await unfollowShop(userId(req), req.params.shopId);
  return res.json({ success: true, follow: serializeShopFollow(row) });
}

export async function patchShopFollowPreferences(req, res) {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid alert preferences." });
  try {
    const row = await updateShopFollowPreferences(userId(req), req.params.shopId, parsed.data);
    return res.json({ success: true, follow: serializeShopFollow(row) });
  } catch (error) { return res.status(error?.statusCode || 500).json({ success: false, error: error.message }); }
}

export async function listMyFollowedShops(req, res) {
  const rows = await prisma.shopFollow.findMany({
    where: { userId: userId(req), status: "FOLLOWING", shop: { isDeleted: false, subscriptionStatus: "ACTIVE" } },
    orderBy: { updatedAt: "desc" },
    include: { shop: { select: { id: true, name: true, slug: true, city: true, state: true } } },
  });
  return res.json({ success: true, followedShops: rows.map((row) => ({ shop: row.shop, follow: serializeShopFollow(row) })) });
}

export const shopFollowSchemas = { preferencesSchema };

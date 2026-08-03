import { prisma } from "../lib/prisma.js";

export const SHOP_ALERT_FIELDS = Object.freeze({
  newArrivals: "newArrivalNotifications",
  deals: "dealNotifications",
  auctions: "auctionNotifications",
  general: "generalShopNotifications",
});

export async function assertFollowableShop(shopId, prismaClient = prisma) {
  const shop = await prismaClient.pawnShop.findFirst({
    where: { id: shopId, isDeleted: false, subscriptionStatus: "ACTIVE" },
    select: { id: true, name: true, slug: true },
  });
  if (!shop) throw Object.assign(new Error("Active public shop not found."), { statusCode: 404 });
  return shop;
}

export async function followShop(userId, shopId, prismaClient = prisma) {
  await assertFollowableShop(shopId, prismaClient);
  return prismaClient.shopFollow.upsert({
    where: { userId_shopId: { userId, shopId } },
    create: { userId, shopId },
    update: { status: "FOLLOWING", pausedAt: null, unsubscribedAt: null },
  });
}

export async function unfollowShop(userId, shopId, prismaClient = prisma) {
  const existing = await prismaClient.shopFollow.findUnique({ where: { userId_shopId: { userId, shopId } } });
  if (!existing || existing.status === "UNFOLLOWED") return existing;
  return prismaClient.shopFollow.update({
    where: { id: existing.id },
    data: {
      status: "UNFOLLOWED", unsubscribedAt: new Date(), pausedAt: null,
      newArrivalNotifications: false, dealNotifications: false,
      auctionNotifications: false, generalShopNotifications: false,
    },
  });
}

export async function updateShopFollowPreferences(userId, shopId, input, prismaClient = prisma) {
  await assertFollowableShop(shopId, prismaClient);
  const existing = await prismaClient.shopFollow.findUnique({ where: { userId_shopId: { userId, shopId } } });
  if (!existing || existing.status !== "FOLLOWING") throw Object.assign(new Error("Follow this shop before managing alerts."), { statusCode: 409 });
  const data = {};
  for (const [apiField, modelField] of Object.entries(SHOP_ALERT_FIELDS)) {
    if (Object.hasOwn(input, apiField)) data[modelField] = input[apiField] === true;
  }
  if (Object.hasOwn(input, "paused")) data.pausedAt = input.paused ? new Date() : null;
  if (Object.keys(data).length === 0) throw Object.assign(new Error("At least one preference is required."), { statusCode: 400 });
  return prismaClient.shopFollow.update({ where: { id: existing.id }, data });
}

export function serializeShopFollow(row) {
  if (!row) return { following: false, paused: false, preferences: { newArrivals: false, deals: false, auctions: false, general: false } };
  return {
    id: row.id,
    following: row.status === "FOLLOWING",
    paused: Boolean(row.pausedAt),
    preferences: {
      newArrivals: row.newArrivalNotifications,
      deals: row.dealNotifications,
      auctions: row.auctionNotifications,
      general: row.generalShopNotifications,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function dispatchShopAlert({ shopId, alertType, eventKey, title, message, actionUrl }) {
  const preferenceField = SHOP_ALERT_FIELDS[alertType];
  if (!preferenceField) throw new Error("Unsupported shop alert type.");
  const follows = await prisma.shopFollow.findMany({
    where: { shopId, status: "FOLLOWING", pausedAt: null, [preferenceField]: true },
    select: { userId: true },
  });
  const results = await Promise.all(follows.map(({ userId }) => prisma.notification.upsert({
    where: { dedupeKey: `shop-alert:${shopId}:${alertType}:${eventKey}:${userId}` },
    create: { userId, type: "SHOP_MARKETING", title, message, actionUrl, dedupeKey: `shop-alert:${shopId}:${alertType}:${eventKey}:${userId}` },
    update: {},
  })));
  return { eligible: follows.length, delivered: results.length, channel: "IN_APP" };
}

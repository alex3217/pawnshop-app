import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const optionalText = (max) => z.union([z.string().trim().max(max), z.null()]).transform((value) => value || null);
const phone = optionalText(30).refine((value) => value === null || /^[+()\-\.\s0-9]{7,30}$/.test(value), "Phone number contains unsupported characters.");

export const buyerPreferencePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  phone: phone.optional(),
  locationLabel: optionalText(120).optional(),
  searchRadiusMiles: z.number().int().min(1).max(250).optional(),
  savedSearchNotifications: z.boolean().optional(),
  priceDropAlerts: z.boolean().optional(),
  auctionAlerts: z.boolean().optional(),
  followedShopAlerts: z.boolean().optional(),
  marketingCommunications: z.boolean().optional(),
  recentlyViewedEnabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one preference is required.");

const preferenceSelect = {
  phone: true, locationLabel: true, searchRadiusMiles: true,
  savedSearchNotifications: true, priceDropAlerts: true, auctionAlerts: true,
  followedShopAlerts: true, marketingCommunications: true,
  recentlyViewedEnabled: true, updatedAt: true,
};

function response(user, preference) {
  return {
    displayName: user.name,
    email: user.email,
    phone: preference?.phone ?? null,
    locationLabel: preference?.locationLabel ?? null,
    searchRadiusMiles: preference?.searchRadiusMiles ?? 25,
    savedSearchNotifications: preference?.savedSearchNotifications ?? true,
    priceDropAlerts: preference?.priceDropAlerts ?? true,
    auctionAlerts: preference?.auctionAlerts ?? true,
    followedShopAlerts: preference?.followedShopAlerts ?? true,
    marketingCommunications: preference?.marketingCommunications ?? false,
    recentlyViewedEnabled: preference?.recentlyViewedEnabled ?? true,
    updatedAt: preference?.updatedAt ?? null,
  };
}

export async function getBuyerPreferences(userId, prismaClient = prisma) {
  const user = await prismaClient.user.findUnique({ where: { id: userId }, select: { name: true, email: true, buyerPreference: { select: preferenceSelect } } });
  if (!user) { const error = new Error("User not found."); error.statusCode = 404; throw error; }
  return response(user, user.buyerPreference);
}

export async function updateBuyerPreferences(userId, input, prismaClient = prisma) {
  const parsed = buyerPreferencePatchSchema.safeParse(input);
  if (!parsed.success) { const error = new Error("Invalid buyer preferences."); error.statusCode = 400; error.details = parsed.error.flatten(); throw error; }
  const { displayName, ...preferenceData } = parsed.data;
  return prismaClient.$transaction(async (tx) => {
    if (displayName !== undefined) await tx.user.update({ where: { id: userId }, data: { name: displayName } });
    if (Object.keys(preferenceData).length) await tx.buyerPreference.upsert({ where: { userId }, create: { userId, ...preferenceData }, update: preferenceData });
    return getBuyerPreferences(userId, tx);
  });
}

import { prisma } from "../lib/prisma.js";

const SAFE_SHOP_SELECT = {
  id: true,
  name: true,
  address: true,
  phone: true,
  description: true,
  hours: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
};

function sendError(res, error, fallback = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error?.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallback,
  });
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const next = String(value).trim();
  return next.length ? next : null;
}

export async function getMyWatchlist(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const rows = await prisma.watchlist.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        item: {
          select: {
            id: true,
            pawnShopId: true,
            title: true,
            description: true,
            price: true,
            currency: true,
            images: true,
            category: true,
            condition: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            isDeleted: true,
            shop: { select: SAFE_SHOP_SELECT },
          },
        },
      },
    });

    return res.json(rows);
  } catch (error) {
    return sendError(res, error, "Failed to load watchlist");
  }
}

export async function addToWatchlist(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const itemId = normalizeString(req.body?.itemId);
    if (!itemId) {
      return res.status(400).json({ success: false, error: "itemId is required" });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        status: true,
        isDeleted: true,
      },
    });

    if (!item || item.isDeleted || item.status !== "AVAILABLE") {
      return res.status(404).json({ success: false, error: "Available item not found" });
    }

    const entry = await prisma.watchlist.upsert({
      where: {
        userId_itemId: {
          userId,
          itemId,
        },
      },
      update: {},
      create: {
        userId,
        itemId,
      },
      include: {
        item: {
          select: {
            id: true,
            pawnShopId: true,
            title: true,
            description: true,
            price: true,
            currency: true,
            images: true,
            category: true,
            condition: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            isDeleted: true,
            shop: { select: SAFE_SHOP_SELECT },
          },
        },
      },
    });

    return res.status(201).json(entry);
  } catch (error) {
    return sendError(res, error, "Failed to add item to watchlist");
  }
}

export async function removeFromWatchlist(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const itemId = normalizeString(req.params?.itemId);
    if (!itemId) {
      return res.status(400).json({ success: false, error: "itemId is required" });
    }

    await prisma.watchlist.delete({
      where: {
        userId_itemId: {
          userId,
          itemId,
        },
      },
    });

    return res.json({ success: true, itemId });
  } catch (error) {
    return sendError(res, error, "Failed to remove item from watchlist");
  }
}

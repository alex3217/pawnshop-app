import { prisma } from "../lib/prisma.js";

function sendError(res, error, fallback = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
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

function normalizeAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export async function listOffersForBuyer(req, res) {
  try {
    const buyerId = req?.user?.sub;
    if (!buyerId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const offers = await prisma.offer.findMany({
      where: { buyerId },
      orderBy: { createdAt: "desc" },
      include: {
        item: {
          include: {
            shop: true,
          },
        },
      },
    });

    return res.json(offers);
  } catch (error) {
    return sendError(res, error, "Failed to load offers");
  }
}

export async function createOffer(req, res) {
  try {
    const buyerId = req?.user?.sub;
    if (!buyerId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const itemId = normalizeString(req.body?.itemId);
    const amount = normalizeAmount(req.body?.amount);
    const message = normalizeString(req.body?.message);

    if (!itemId || !amount) {
      return res.status(400).json({
        success: false,
        error: "itemId and amount are required",
      });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        shop: true,
      },
    });

    if (!item || item.isDeleted || item.status !== "AVAILABLE") {
      return res.status(404).json({
        success: false,
        error: "Available item not found",
      });
    }

    const offer = await prisma.offer.create({
      data: {
        itemId,
        buyerId,
        ownerId: item.shop.ownerId,
        amount,
        message,
        status: "PENDING",
      },
      include: {
        item: {
          include: {
            shop: true,
          },
        },
      },
    });

    return res.status(201).json(offer);
  } catch (error) {
    return sendError(res, error, "Failed to create offer");
  }
}

export async function listOffersForOwner(req, res) {
  try {
    const ownerId = req?.user?.sub;
    if (!ownerId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const offers = await prisma.offer.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include: {
        item: {
          include: {
            shop: true,
          },
        },
      },
    });

    return res.json(offers);
  } catch (error) {
    return sendError(res, error, "Failed to load owner offers");
  }
}

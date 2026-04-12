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
          select: {
            id: true,
            title: true,
            price: true,
            pawnShopId: true,
            shop: { select: SAFE_SHOP_SELECT },
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
        shop: {
          select: SAFE_SHOP_SELECT,
        },
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
          select: {
            id: true,
            title: true,
            price: true,
            pawnShopId: true,
            shop: { select: SAFE_SHOP_SELECT },
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
          select: {
            id: true,
            title: true,
            price: true,
            pawnShopId: true,
            shop: { select: SAFE_SHOP_SELECT },
          },
        },
      },
    });

    return res.json(offers);
  } catch (error) {
    return sendError(res, error, "Failed to load owner offers");
  }
}


async function getOwnerOfferOrThrow(offerId, ownerId) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          price: true,
          pawnShopId: true,
          shop: { select: SAFE_SHOP_SELECT },
        },
      },
    },
  });

  if (!offer) {
    const err = new Error("Offer not found");
    err.statusCode = 404;
    throw err;
  }

  if (offer.ownerId !== ownerId) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }

  return offer;
}

export async function acceptOffer(req, res) {
  try {
    const ownerId = req?.user?.sub;
    if (!ownerId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const offerId = normalizeString(req.params?.id);
    if (!offerId) {
      return res.status(400).json({ success: false, error: "Offer id is required" });
    }

    await getOwnerOfferOrThrow(offerId, ownerId);

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: { status: "ACCEPTED" },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            pawnShopId: true,
            shop: { select: SAFE_SHOP_SELECT },
          },
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    return sendError(res, error, "Failed to accept offer");
  }
}

export async function rejectOffer(req, res) {
  try {
    const ownerId = req?.user?.sub;
    if (!ownerId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const offerId = normalizeString(req.params?.id);
    if (!offerId) {
      return res.status(400).json({ success: false, error: "Offer id is required" });
    }

    await getOwnerOfferOrThrow(offerId, ownerId);

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: { status: "REJECTED" },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            price: true,
            pawnShopId: true,
            shop: { select: SAFE_SHOP_SELECT },
          },
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    return sendError(res, error, "Failed to reject offer");
  }
}

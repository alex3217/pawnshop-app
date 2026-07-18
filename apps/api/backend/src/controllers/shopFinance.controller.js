import { prisma } from "../lib/prisma.js";
import {
  getSellerBalance,
} from "../services/payouts/sellerBalance.service.js";
import {
  getSellerLedgerHistory,
} from "../services/payouts/sellerLedgerHistory.service.js";
import {
  getSellerPayoutHistory,
} from "../services/payouts/sellerPayoutHistory.service.js";

function normalizeId(value) {
  const id = String(value || "").trim();
  return id || null;
}

function isAdminRequest(req) {
  return String(req?.user?.role || "")
    .trim()
    .toUpperCase() === "ADMIN";
}

function sendError(res, error) {
  const statusCode =
    Number.isInteger(error?.statusCode)
      ? error.statusCode
      : Number.isInteger(error?.status)
        ? error.status
        : 500;

  return res.status(statusCode).json({
    success: false,
    error:
      statusCode >= 500
        ? "Failed to load shop finance balance"
        : error?.message || "Request failed",
  });
}

export async function getShopFinanceBalance(req, res) {
  try {
    const shopId = normalizeId(req?.params?.id);
    const requesterId = normalizeId(req?.user?.sub);

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: "Shop id is required",
      });
    }

    const shop = await prisma.pawnShop.findUnique({
      where: {
        id: shopId,
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        isDeleted: true,
      },
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({
        success: false,
        error: "Shop not found",
      });
    }

    if (!isAdminRequest(req) && shop.ownerId !== requesterId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
      });
    }

    const balance = await getSellerBalance({
      sellerUserId: shop.ownerId,
      shopId: shop.id,
      currency: "USD",
      prismaClient: prisma,
    });

    return res.status(200).json({
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        ownerId: shop.ownerId,
      },
      balance,
    });
  } catch (error) {
    console.error("[shopFinance.getShopFinanceBalance]", error);
    return sendError(res, error);
  }
}

export async function getShopFinanceLedger(req, res) {
  try {
    const shopId = normalizeId(req?.params?.id);
    const requesterId = normalizeId(req?.user?.sub);

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: "Shop id is required",
      });
    }

    const shop = await prisma.pawnShop.findUnique({
      where: {
        id: shopId,
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        isDeleted: true,
      },
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({
        success: false,
        error: "Shop not found",
      });
    }

    if (!isAdminRequest(req) && shop.ownerId !== requesterId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
      });
    }

    const ledger = await getSellerLedgerHistory({
      sellerUserId: shop.ownerId,
      shopId: shop.id,
      page: req?.query?.page,
      limit: req?.query?.limit,
      type: req?.query?.type,
      status: req?.query?.status,
      from: req?.query?.from,
      to: req?.query?.to,
      prismaClient: prisma,
    });

    return res.status(200).json({
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        ownerId: shop.ownerId,
      },
      ...ledger,
    });
  } catch (error) {
    console.error(
      "[shopFinance.getShopFinanceLedger]",
      error,
    );

    if (
      String(error?.message || "").includes("Unsupported") ||
      String(error?.message || "").includes("valid date") ||
      String(error?.message || "").includes(
        "from must be before",
      )
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    return sendError(res, error);
  }
}

export async function getShopFinancePayouts(req, res) {
  try {
    const shopId = normalizeId(req?.params?.id);
    const requesterId = normalizeId(req?.user?.sub);

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: "Shop id is required",
      });
    }

    const shop = await prisma.pawnShop.findUnique({
      where: {
        id: shopId,
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        isDeleted: true,
      },
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({
        success: false,
        error: "Shop not found",
      });
    }

    if (!isAdminRequest(req) && shop.ownerId !== requesterId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
      });
    }

    const payouts = await getSellerPayoutHistory({
      sellerUserId: shop.ownerId,
      shopId: shop.id,
      page: req?.query?.page,
      limit: req?.query?.limit,
      status: req?.query?.status,
      from: req?.query?.from,
      to: req?.query?.to,
      prismaClient: prisma,
    });

    return res.status(200).json({
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        ownerId: shop.ownerId,
      },
      ...payouts,
    });
  } catch (error) {
    console.error(
      "[shopFinance.getShopFinancePayouts]",
      error,
    );

    if (
      String(error?.message || "").includes(
        "Unsupported payout status",
      ) ||
      String(error?.message || "").includes(
        "valid date",
      ) ||
      String(error?.message || "").includes(
        "from must be before",
      )
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    return sendError(res, error);
  }
}


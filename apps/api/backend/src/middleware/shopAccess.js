import { prisma } from "../lib/prisma.js";
import {
  assertShopPermission,
} from "../services/shopAccess.service.js";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function sendError(res, error) {
  const status =
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error:
      error?.message ||
      "Shop authorization failed.",
    ...(error?.details
      ? {
          details: error.details,
        }
      : {}),
  });
}

export function shopIdFromParam(
  paramName = "shopId",
) {
  return async function resolveFromParam(req) {
    return normalizeString(
      req.params?.[paramName],
    );
  };
}

export function shopIdFromBody(
  fieldName = "shopId",
) {
  return async function resolveFromBody(req) {
    return normalizeString(
      req.body?.[fieldName],
    );
  };
}

export function shopIdFromStaffParam(
  paramName = "id",
) {
  return async function resolveFromStaff(req) {
    const staffId = normalizeString(
      req.params?.[paramName],
    );

    if (!staffId) {
      const error = new Error(
        "Staff id is required.",
      );

      error.statusCode = 400;
      throw error;
    }

    const staff =
      await prisma.staff.findUnique({
        where: {
          id: staffId,
        },
        select: {
          shopId: true,
        },
      });

    if (!staff) {
      const error = new Error(
        "Staff member not found.",
      );

      error.statusCode = 404;
      throw error;
    }

    return staff.shopId;
  };
}

export function shopIdFromAuctionParam(
  paramName = "id",
) {
  return async function resolveFromAuction(req) {
    const auctionId = normalizeString(
      req.params?.[paramName],
    );

    if (!auctionId) {
      const error = new Error(
        "Auction id is required.",
      );

      error.statusCode = 400;
      throw error;
    }

    const auction =
      await prisma.auction.findUnique({
        where: {
          id: auctionId,
        },
        select: {
          shopId: true,
        },
      });

    if (!auction) {
      const error = new Error(
        "Auction not found.",
      );

      error.statusCode = 404;
      throw error;
    }

    return auction.shopId;
  };
}

async function defaultShopIdResolver(req) {
  return normalizeString(
    req.params?.shopId ||
      req.body?.shopId ||
      req.query?.shopId,
  );
}

export function requireShopPermission(
  permission,
  options = {},
) {
  const resolveShopId =
    options.resolveShopId ||
    defaultShopIdResolver;

  return async function shopPermissionMiddleware(
    req,
    res,
    next,
  ) {
    try {
      const shopId =
        await resolveShopId(req);

      if (!shopId) {
        return res.status(400).json({
          success: false,
          error: "Shop id is required.",
        });
      }

      req.shopAccess =
        await assertShopPermission({
          user: req.user,
          shopId,
          permission,
        });

      return next();
    } catch (error) {
      return sendError(res, error);
    }
  };
}

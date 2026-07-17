import { prisma } from "../lib/prisma.js";
import {
  canAccessShopWithStaffPermission,
  getStaffAccessibleShopIds,
} from "../middleware/staffAccess.middleware.js";

const VALID_STATUSES = new Set([
  "DRAFT",
  "SCANNED",
  "NEEDS_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "ARCHIVED",
]);

const REVIEW_STATUSES = new Set([
  "NEEDS_REVIEW",
  "APPROVED",
  "REJECTED",
]);

const VALID_DESTINATIONS = new Set([
  "SHOP_INVENTORY",
  "CUSTOMER_SELL",
  "CUSTOMER_PAWN",
  "CUSTOMER_MARKETPLACE",
  "DEALER_LISTING",
  "SHOP_TRANSFER",
]);

const intakeSelect = {
  id: true,
  shopId: true,
  capturedByUserId: true,
  source: true,
  destination: true,
  status: true,

  code: true,
  normalizedCode: true,
  codeType: true,
  barcode: true,
  upc: true,
  ean: true,
  sku: true,
  serialNumber: true,

  title: true,
  description: true,
  category: true,
  condition: true,
  estimatedValue: true,

  images: true,
  documentUrls: true,
  receiptUrls: true,

  ocrStatus: true,
  ocrText: true,
  ocrData: true,

  duplicateStatus: true,
  duplicateMatches: true,
  screeningStatus: true,
  screeningResult: true,

  reviewMessage: true,
  reviewedAt: true,
  reviewedById: true,

  linkedItemId: true,
  linkedSubmissionId: true,
  metadata: true,

  createdAt: true,
  updatedAt: true,

  shop: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zip: true,
    },
  },
};

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeString(value) {
  return String(value || "").trim();
}

function getUserId(req) {
  return (
    req?.user?.sub ||
    req?.user?.id ||
    req?.user?.userId ||
    ""
  );
}

function getUserRole(req) {
  return normalizeUpper(req?.user?.role);
}

function isPlatformAdmin(req) {
  const role = getUserRole(req);
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function isOwner(req) {
  return getUserRole(req) === "OWNER";
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

async function getAccessibleShopIds(req, permission) {
  if (isPlatformAdmin(req)) {
    return null;
  }

  if (isOwner(req)) {
    const userId = getUserId(req);

    if (!userId) {
      return [];
    }

    const rows = await prisma.pawnShop.findMany({
      where: {
        ownerId: userId,
        isDeleted: false,
      },
      select: {
        id: true,
      },
    });

    return rows.map((row) => row.id);
  }

  return getStaffAccessibleShopIds(req, permission);
}

async function canAccessIntake(req, intake, permission) {
  if (isPlatformAdmin(req)) {
    return true;
  }

  const userId = getUserId(req);

  /*
   * Access must follow the current shop permission.
   * Capturing an intake previously must not provide permanent
   * access after a staff member loses access to that shop.
   */
  if (!intake.shopId) {
    return false;
  }

  if (
    canAccessShopWithStaffPermission(
      req,
      permission,
      intake.shopId,
    )
  ) {
    return true;
  }

  if (!isOwner(req)) {
    return false;
  }

  const shop = await prisma.pawnShop.findFirst({
    where: {
      id: intake.shopId,
      ownerId: userId,
      isDeleted: false,
    },
    select: {
      id: true,
    },
  });

  return Boolean(shop);
}

function sendUnexpectedError(res, error, fallbackMessage) {
  console.error("[item-intakes:error]", {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
  });

  return res.status(500).json({
    error: fallbackMessage,
  });
}

export async function listItemIntakes(req, res) {
  try {
    const page = parsePositiveInteger(req.query.page, 1, 100000);
    const limit = parsePositiveInteger(req.query.limit, 50, 100);

    const requestedShopId = normalizeString(req.query.shopId);
    const requestedStatus = normalizeUpper(req.query.status);
    const requestedDestination = normalizeUpper(
      req.query.destination,
    );
    const query = normalizeString(req.query.q);

    if (
      requestedStatus &&
      requestedStatus !== "ALL" &&
      !VALID_STATUSES.has(requestedStatus)
    ) {
      return res.status(400).json({
        error: "Invalid item intake status.",
      });
    }

    if (
      requestedDestination &&
      requestedDestination !== "ALL" &&
      !VALID_DESTINATIONS.has(requestedDestination)
    ) {
      return res.status(400).json({
        error: "Invalid item intake destination.",
      });
    }

    const accessibleShopIds = await getAccessibleShopIds(
      req,
      "inventory:read",
    );

    if (
      requestedShopId &&
      Array.isArray(accessibleShopIds) &&
      !accessibleShopIds.includes(requestedShopId)
    ) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    const where = {};

    if (requestedShopId) {
      where.shopId = requestedShopId;
    } else if (Array.isArray(accessibleShopIds)) {
      where.shopId = {
        in: accessibleShopIds,
      };
    }

    if (requestedStatus && requestedStatus !== "ALL") {
      where.status = requestedStatus;
    }

    if (
      requestedDestination &&
      requestedDestination !== "ALL"
    ) {
      where.destination = requestedDestination;
    }

    if (query) {
      where.OR = [
        {
          title: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          code: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          normalizedCode: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          sku: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          serialNumber: {
            contains: query,
            mode: "insensitive",
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.itemIntake.findMany({
        where,
        select: intakeSelect,
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.itemIntake.count({
        where,
      }),
    ]);

    return res.json({
      rows,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return sendUnexpectedError(
      res,
      error,
      "Failed to load item intakes.",
    );
  }
}

export async function getItemIntake(req, res) {
  try {
    const intake = await prisma.itemIntake.findUnique({
      where: {
        id: req.params.id,
      },
      select: intakeSelect,
    });

    if (!intake) {
      return res.status(404).json({
        error: "Item intake not found.",
      });
    }

    const allowed = await canAccessIntake(
      req,
      intake,
      "inventory:read",
    );

    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    return res.json({
      data: intake,
    });
  } catch (error) {
    return sendUnexpectedError(
      res,
      error,
      "Failed to load item intake.",
    );
  }
}

export async function reviewItemIntake(req, res) {
  try {
    const status = normalizeUpper(req.body?.status);
    const reviewMessage = normalizeString(
      req.body?.reviewMessage,
    );

    if (!REVIEW_STATUSES.has(status)) {
      return res.status(400).json({
        error:
          "Review status must be NEEDS_REVIEW, APPROVED, or REJECTED.",
      });
    }

    if (reviewMessage.length > 2000) {
      return res.status(400).json({
        error: "Review message must be 2000 characters or fewer.",
      });
    }

    const existing = await prisma.itemIntake.findUnique({
      where: {
        id: req.params.id,
      },
      select: {
        id: true,
        shopId: true,
        capturedByUserId: true,
        status: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        error: "Item intake not found.",
      });
    }

    const allowed = await canAccessIntake(
      req,
      existing,
      "inventory:write",
    );

    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    if (
      existing.status === "PUBLISHED" ||
      existing.status === "ARCHIVED"
    ) {
      return res.status(409).json({
        error:
          "Published or archived intake records cannot be reviewed.",
      });
    }

    const intake = await prisma.itemIntake.update({
      where: {
        id: existing.id,
      },
      data: {
        status,
        reviewMessage: reviewMessage || null,
        reviewedAt: new Date(),
        reviewedById: getUserId(req) || null,
      },
      select: intakeSelect,
    });

    return res.json({
      data: intake,
    });
  } catch (error) {
    return sendUnexpectedError(
      res,
      error,
      "Failed to review item intake.",
    );
  }
}

export async function archiveItemIntake(req, res) {
  try {
    const reviewMessage = normalizeString(
      req.body?.reviewMessage,
    );

    if (reviewMessage.length > 2000) {
      return res.status(400).json({
        error: "Archive message must be 2000 characters or fewer.",
      });
    }

    const existing = await prisma.itemIntake.findUnique({
      where: {
        id: req.params.id,
      },
      select: {
        id: true,
        shopId: true,
        capturedByUserId: true,
        status: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        error: "Item intake not found.",
      });
    }

    const allowed = await canAccessIntake(
      req,
      existing,
      "inventory:write",
    );

    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    if (existing.status === "PUBLISHED") {
      return res.status(409).json({
        error: "Published intake records cannot be archived.",
      });
    }

    const intake = await prisma.itemIntake.update({
      where: {
        id: existing.id,
      },
      data: {
        status: "ARCHIVED",
        ...(reviewMessage
          ? { reviewMessage }
          : {}),
        reviewedAt: new Date(),
        reviewedById: getUserId(req) || null,
      },
      select: intakeSelect,
    });

    return res.json({
      data: intake,
    });
  } catch (error) {
    return sendUnexpectedError(
      res,
      error,
      "Failed to archive item intake.",
    );
  }
}

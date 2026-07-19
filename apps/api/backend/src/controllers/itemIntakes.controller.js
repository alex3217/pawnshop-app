import { prisma } from "../lib/prisma.js";
import { assertCanCreateListingForShop } from "../services/sellerPlan.service.js";
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

const PUBLISHABLE_DESTINATIONS = new Set([
  "SHOP_INVENTORY",
  "CUSTOMER_SELL",
  "CUSTOMER_PAWN",
]);

const CUSTOMER_SUBMISSION_DESTINATIONS = new Set([
  "CUSTOMER_SELL",
  "CUSTOMER_PAWN",
]);

const intakeSelect = {
  id: true,
  shopId: true,
  capturedByUserId: true,
  customerId: true,
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
  linkedMarketplaceListingId:
    true,
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

  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  },
};

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeString(value) {
  return String(value || "").trim();
}

function createHttpError(statusCode, message, code = "") {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (code) {
    error.code = code;
  }

  return error;
}

function normalizePublishPrice(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed.toFixed(2);
}

function isCustomerSubmissionDestination(
  destination,
) {
  return CUSTOMER_SUBMISSION_DESTINATIONS.has(
    destination,
  );
}

function getCustomerSubmissionIntent(destination) {
  if (destination === "CUSTOMER_SELL") {
    return "SELL_OFFERS";
  }

  if (destination === "CUSTOMER_PAWN") {
    return "PAWN_OFFERS";
  }

  return "";
}

async function runSerializableTransaction(callback) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      lastError = error;

      if (error?.code !== "P2034" || attempt === 3) {
        throw error;
      }
    }
  }

  throw lastError;
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

function sendControllerError(res, error, fallbackMessage) {
  const statusCode = Number(error?.statusCode);

  if (
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 599
  ) {
    return res.status(statusCode).json({
      error: error?.message || fallbackMessage,
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.details ? { details: error.details } : {}),
    });
  }

  return sendUnexpectedError(
    res,
    error,
    fallbackMessage,
  );
}


export async function searchItemIntakeCustomers(req, res) {
  try {
    const query = normalizeString(req.query?.q);

    if (query.length < 2) {
      return res.json({
        rows: [],
        total: 0,
        query,
      });
    }

    const rows = await prisma.user.findMany({
      where: {
        role: "CONSUMER",
        isActive: true,
        OR: [
          {
            id: query,
          },
          {
            name: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: query,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: [
        {
          name: "asc",
        },
        {
          email: "asc",
        },
      ],
      take: 20,
    });

    return res.json({
      rows,
      total: rows.length,
      query,
    });
  } catch (error) {
    return sendUnexpectedError(
      res,
      error,
      "Failed to search customers.",
    );
  }
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

export async function publishItemIntake(req, res) {
  try {
    const intakeId = normalizeString(req.params?.id);

    if (!intakeId) {
      return res.status(400).json({
        error: "Missing item intake ID.",
      });
    }

    const existing = await prisma.itemIntake.findUnique({
      where: {
        id: intakeId,
      },
      select: {
        id: true,
        shopId: true,
        capturedByUserId: true,
        customerId: true,
        destination: true,
        status: true,
        linkedItemId: true,
        linkedSubmissionId: true,
        title: true,
        description: true,
        category: true,
        condition: true,
        estimatedValue: true,
        images: true,
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
      !PUBLISHABLE_DESTINATIONS.has(
        existing.destination,
      )
    ) {
      return res.status(422).json({
        error:
          "Publishing for this intake destination is not available yet.",
        destination: existing.destination,
        supportedDestinations: [
          "SHOP_INVENTORY",
          "CUSTOMER_SELL",
          "CUSTOMER_PAWN",
        ],
      });
    }

    if (
      existing.status !== "APPROVED" &&
      existing.status !== "PUBLISHED"
    ) {
      return res.status(409).json({
        error:
          "Only approved item intake records can be published.",
        status: existing.status,
      });
    }

    if (!existing.shopId) {
      return res.status(400).json({
        error:
          "A shop must be assigned before this intake can be published.",
      });
    }

    const customerDestination =
      isCustomerSubmissionDestination(
        existing.destination,
      );

    if (
      customerDestination &&
      !existing.customerId
    ) {
      return res.status(400).json({
        error:
          "A customer must be assigned before this intake can be published.",
      });
    }

    if (
      existing.status === "PUBLISHED" &&
      existing.destination === "SHOP_INVENTORY" &&
      !existing.linkedItemId
    ) {
      return res.status(409).json({
        error:
          "This published intake does not have a linked inventory item.",
      });
    }

    if (
      existing.status === "PUBLISHED" &&
      customerDestination &&
      !existing.linkedSubmissionId
    ) {
      return res.status(409).json({
        error:
          "This published intake does not have a linked customer submission.",
      });
    }

    if (
      existing.status === "APPROVED" &&
      existing.destination === "SHOP_INVENTORY" &&
      !existing.linkedItemId
    ) {
      const title = normalizeString(existing.title);
      const price = normalizePublishPrice(
        existing.estimatedValue,
      );

      if (!title) {
        return res.status(400).json({
          error:
            "An item title is required before publishing.",
        });
      }

      if (price === null) {
        return res.status(400).json({
          error:
            "A valid estimated value is required before publishing.",
        });
      }

      await assertCanCreateListingForShop(
        existing.shopId,
      );
    }

    if (
      existing.status === "APPROVED" &&
      customerDestination
    ) {
      const title = normalizeString(existing.title);

      if (!title) {
        return res.status(400).json({
          error:
            "An item title is required before publishing.",
        });
      }

      const customer = await prisma.user.findFirst({
        where: {
          id: existing.customerId,
          role: "CONSUMER",
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (!customer) {
        return res.status(409).json({
          error:
            "The assigned customer account is no longer active.",
        });
      }
    }

    const result = await runSerializableTransaction(
      async (tx) => {
        const current = await tx.itemIntake.findUnique({
          where: {
            id: intakeId,
          },
          select: {
            id: true,
            shopId: true,
            customerId: true,
            destination: true,
            status: true,
            linkedItemId: true,
            linkedSubmissionId: true,
            title: true,
            description: true,
            category: true,
            condition: true,
            estimatedValue: true,
            images: true,
          },
        });

        if (!current) {
          throw createHttpError(
            404,
            "Item intake not found.",
            "ITEM_INTAKE_NOT_FOUND",
          );
        }

        if (
          !PUBLISHABLE_DESTINATIONS.has(
            current.destination,
          )
        ) {
          throw createHttpError(
            422,
            "Publishing for this intake destination is not available yet.",
            "ITEM_INTAKE_DESTINATION_NOT_SUPPORTED",
          );
        }

        const currentCustomerDestination =
          isCustomerSubmissionDestination(
            current.destination,
          );

        if (
          current.status === "PUBLISHED" &&
          current.destination === "SHOP_INVENTORY" &&
          current.linkedItemId
        ) {
          const [intake, item] = await Promise.all([
            tx.itemIntake.findUnique({
              where: {
                id: current.id,
              },
              select: intakeSelect,
            }),
            tx.item.findFirst({
              where: {
                id: current.linkedItemId,
                isDeleted: false,
              },
            }),
          ]);

          return {
            intake,
            item,
            submission: null,
            alreadyPublished: true,
            reusedExistingItem: true,
            reusedExistingSubmission: false,
          };
        }

        if (
          current.status === "PUBLISHED" &&
          currentCustomerDestination &&
          current.linkedSubmissionId
        ) {
          const [intake, submission] =
            await Promise.all([
              tx.itemIntake.findUnique({
                where: {
                  id: current.id,
                },
                select: intakeSelect,
              }),
              tx.buyerItemSubmission.findFirst({
                where: {
                  id: current.linkedSubmissionId,
                  buyerId: current.customerId,
                },
              }),
            ]);

          if (!submission) {
            throw createHttpError(
              409,
              "The linked customer submission no longer exists.",
              "LINKED_SUBMISSION_NOT_FOUND",
            );
          }

          return {
            intake,
            item: null,
            submission,
            alreadyPublished: true,
            reusedExistingItem: false,
            reusedExistingSubmission: true,
          };
        }

        if (current.status !== "APPROVED") {
          throw createHttpError(
            409,
            "Only approved item intake records can be published.",
            "ITEM_INTAKE_NOT_APPROVED",
          );
        }

        if (!current.shopId) {
          throw createHttpError(
            400,
            "A shop must be assigned before this intake can be published.",
            "ITEM_INTAKE_SHOP_REQUIRED",
          );
        }

        if (
          current.destination === "SHOP_INVENTORY"
        ) {
          if (current.linkedItemId) {
            const linkedItem = await tx.item.findFirst({
              where: {
                id: current.linkedItemId,
                pawnShopId: current.shopId,
                isDeleted: false,
              },
            });

            if (!linkedItem) {
              throw createHttpError(
                409,
                "The linked inventory item no longer exists.",
                "LINKED_ITEM_NOT_FOUND",
              );
            }

            const updated =
              await tx.itemIntake.updateMany({
                where: {
                  id: current.id,
                  status: "APPROVED",
                  linkedItemId:
                    current.linkedItemId,
                },
                data: {
                  status: "PUBLISHED",
                },
              });

            if (updated.count !== 1) {
              throw createHttpError(
                409,
                "The intake changed while it was being published. Reload and try again.",
                "ITEM_INTAKE_PUBLISH_CONFLICT",
              );
            }

            const intake =
              await tx.itemIntake.findUnique({
                where: {
                  id: current.id,
                },
                select: intakeSelect,
              });

            return {
              intake,
              item: linkedItem,
              submission: null,
              alreadyPublished: false,
              reusedExistingItem: true,
              reusedExistingSubmission: false,
            };
          }

          const title = normalizeString(
            current.title,
          );
          const price = normalizePublishPrice(
            current.estimatedValue,
          );

          if (!title) {
            throw createHttpError(
              400,
              "An item title is required before publishing.",
              "ITEM_INTAKE_TITLE_REQUIRED",
            );
          }

          if (price === null) {
            throw createHttpError(
              400,
              "A valid estimated value is required before publishing.",
              "ITEM_INTAKE_VALUE_REQUIRED",
            );
          }

          const item = await tx.item.create({
            data: {
              pawnShopId: current.shopId,
              title,
              description:
                normalizeString(
                  current.description,
                ) || null,
              price,
              images: Array.isArray(
                current.images,
              )
                ? current.images
                : [],
              category:
                normalizeString(
                  current.category,
                ) || null,
              condition:
                normalizeString(
                  current.condition,
                ) || null,
              status: "AVAILABLE",
              currency: "USD",
            },
          });

          const updated =
            await tx.itemIntake.updateMany({
              where: {
                id: current.id,
                status: "APPROVED",
                linkedItemId: null,
              },
              data: {
                status: "PUBLISHED",
                linkedItemId: item.id,
              },
            });

          if (updated.count !== 1) {
            throw createHttpError(
              409,
              "The intake changed while it was being published. Reload and try again.",
              "ITEM_INTAKE_PUBLISH_CONFLICT",
            );
          }

          const intake =
            await tx.itemIntake.findUnique({
              where: {
                id: current.id,
              },
              select: intakeSelect,
            });

          return {
            intake,
            item,
            submission: null,
            alreadyPublished: false,
            reusedExistingItem: false,
            reusedExistingSubmission: false,
          };
        }

        if (!current.customerId) {
          throw createHttpError(
            400,
            "A customer must be assigned before this intake can be published.",
            "ITEM_INTAKE_CUSTOMER_REQUIRED",
          );
        }

        const customer = await tx.user.findFirst({
          where: {
            id: current.customerId,
            role: "CONSUMER",
            isActive: true,
          },
          select: {
            id: true,
          },
        });

        if (!customer) {
          throw createHttpError(
            409,
            "The assigned customer account is no longer active.",
            "ITEM_INTAKE_CUSTOMER_INACTIVE",
          );
        }

        if (current.linkedSubmissionId) {
          const linkedSubmission =
            await tx.buyerItemSubmission.findFirst({
              where: {
                id: current.linkedSubmissionId,
                buyerId: current.customerId,
              },
            });

          if (!linkedSubmission) {
            throw createHttpError(
              409,
              "The linked customer submission no longer exists.",
              "LINKED_SUBMISSION_NOT_FOUND",
            );
          }

          const updated =
            await tx.itemIntake.updateMany({
              where: {
                id: current.id,
                status: "APPROVED",
                customerId: current.customerId,
                linkedSubmissionId:
                  current.linkedSubmissionId,
              },
              data: {
                status: "PUBLISHED",
              },
            });

          if (updated.count !== 1) {
            throw createHttpError(
              409,
              "The intake changed while it was being published. Reload and try again.",
              "ITEM_INTAKE_PUBLISH_CONFLICT",
            );
          }

          const intake =
            await tx.itemIntake.findUnique({
              where: {
                id: current.id,
              },
              select: intakeSelect,
            });

          return {
            intake,
            item: null,
            submission: linkedSubmission,
            alreadyPublished: false,
            reusedExistingItem: false,
            reusedExistingSubmission: true,
          };
        }

        const title = normalizeString(
          current.title,
        );

        if (!title) {
          throw createHttpError(
            400,
            "An item title is required before publishing.",
            "ITEM_INTAKE_TITLE_REQUIRED",
          );
        }

        const submission =
          await tx.buyerItemSubmission.create({
            data: {
              buyerId: current.customerId,
              title,
              description:
                normalizeString(
                  current.description,
                ) || null,
              category:
                normalizeString(
                  current.category,
                ) || null,
              condition:
                normalizeString(
                  current.condition,
                ) || null,
              estimatedValue:
                normalizePublishPrice(
                  current.estimatedValue,
                ),
              images: Array.isArray(
                current.images,
              )
                ? current.images
                : [],
              intent:
                getCustomerSubmissionIntent(
                  current.destination,
                ),
              radiusMiles: 25,
              status: "SUBMITTED",
            },
          });

        const updated =
          await tx.itemIntake.updateMany({
            where: {
              id: current.id,
              status: "APPROVED",
              customerId: current.customerId,
              linkedSubmissionId: null,
            },
            data: {
              status: "PUBLISHED",
              linkedSubmissionId:
                submission.id,
            },
          });

        if (updated.count !== 1) {
          throw createHttpError(
            409,
            "The intake changed while it was being published. Reload and try again.",
            "ITEM_INTAKE_PUBLISH_CONFLICT",
          );
        }

        const intake =
          await tx.itemIntake.findUnique({
            where: {
              id: current.id,
            },
            select: intakeSelect,
          });

        return {
          intake,
          item: null,
          submission,
          alreadyPublished: false,
          reusedExistingItem: false,
          reusedExistingSubmission: false,
        };
      },
    );

    return res
      .status(result.alreadyPublished ? 200 : 201)
      .json({
        data: result.intake,
        item: result.item,
        submission: result.submission,
        alreadyPublished:
          result.alreadyPublished,
        reusedExistingItem:
          result.reusedExistingItem,
        reusedExistingSubmission:
          result.reusedExistingSubmission,
      });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Failed to publish item intake.",
    );
  }
}

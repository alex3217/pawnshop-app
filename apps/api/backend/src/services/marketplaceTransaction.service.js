import { prisma } from "../lib/prisma.js";
import {
  calculateSettlementRevenueContext,
} from "./revenue/settlementRevenueAdapter.service.js";

const TRANSACTION_TYPES = new Set([
  "DIRECT_PURCHASE",
  "ACCEPTED_OFFER",
  "DEALER_TRANSFER",
  "CUSTOMER_SELL_TO_SHOP",
]);

const TRANSACTION_STATUSES = new Set([
  "PENDING",
  "PAYMENT_PROCESSING",
  "PAID",
  "FULFILLING",
  "COMPLETED",
  "CANCELED",
  "REFUNDED",
  "DISPUTED",
]);

const SELLER_FULFILLMENT_TARGETS =
  new Set([
    "READY_FOR_PICKUP",
    "PICKED_UP",
    "SHIPPED",
    "COMPLETED",
  ]);

const FULFILLMENT_TRANSITIONS =
  Object.freeze({
    PAYMENT_PENDING:
      new Set([
        "READY_FOR_PICKUP",
        "SHIPPED",
      ]),

    READY_FOR_PICKUP:
      new Set([
        "PICKED_UP",
      ]),

    PICKED_UP:
      new Set([
        "COMPLETED",
      ]),

    SHIPPED:
      new Set([
        "COMPLETED",
      ]),

    COMPLETED:
      new Set([
        "COMPLETED",
      ]),
  });

const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  role: true,
};

const SHOP_SUMMARY_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  phone: true,
  ownerId: true,
};

const LISTING_SUMMARY_SELECT = {
  id: true,
  itemId: true,
  sellerUserId: true,
  sellerShopId: true,
  listingType: true,
  status: true,
  title: true,
  description: true,
  category: true,
  condition: true,
  price: true,
  currency: true,
  quantity: true,
  images: true,
  pickupAvailable: true,
  shippingAvailable: true,
  createdAt: true,
  updatedAt: true,
};

const TRANSACTION_INCLUDE = {
  listing: {
    select: LISTING_SUMMARY_SELECT,
  },
  buyer: {
    select: USER_SUMMARY_SELECT,
  },
  buyerShop: {
    select: SHOP_SUMMARY_SELECT,
  },
  seller: {
    select: USER_SUMMARY_SELECT,
  },
  sellerShop: {
    select: SHOP_SUMMARY_SELECT,
  },
};

function httpError(
  message,
  statusCode,
  code = undefined,
) {
  const error =
    new Error(
      message,
    );

  error.statusCode =
    statusCode;

  if (code) {
    error.code =
      code;
  }

  return error;
}

function normalizeEnum(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  return normalized || null;
}

function normalizePagination(query = {}) {
  const requestedPage = Number(query.page);
  const requestedLimit = Number(query.limit);

  const page =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 25;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function isAdminRole(role) {
  const normalizedRole = normalizeEnum(role);

  return (
    normalizedRole === "ADMIN" ||
    normalizedRole === "SUPER_ADMIN"
  );
}

function metadataObject(
  value,
) {
  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  ) {
    return value;
  }

  return {};
}

function normalizeFulfillmentText(
  value,
  {
    field,
    maxLength,
  },
) {
  const normalized =
    String(
      value ??
      "",
    ).trim();

  if (
    normalized.length >
    maxLength
  ) {
    throw httpError(
      `${field} cannot exceed ${maxLength} characters`,
      400,
      "MARKETPLACE_FULFILLMENT_FIELD_TOO_LONG",
    );
  }

  return normalized;
}

function mayManageMarketplaceFulfillment({
  transaction,
  actorUserId,
  role,
}) {
  return (
    isAdminRole(
      role,
    ) ||
    transaction
      .sellerUserId ===
      actorUserId ||
    transaction
      .sellerShop
      ?.ownerId ===
      actorUserId
  );
}

function validateFilters(query = {}) {
  const status = normalizeEnum(query.status);
  const type = normalizeEnum(query.type);

  if (status && !TRANSACTION_STATUSES.has(status)) {
    throw httpError(
      "Invalid marketplace transaction status",
      400,
    );
  }

  if (type && !TRANSACTION_TYPES.has(type)) {
    throw httpError(
      "Invalid marketplace transaction type",
      400,
    );
  }

  return {
    status,
    type,
  };
}

async function listTransactions({
  userId,
  participantField,
  query = {},
}) {
  if (!userId) {
    throw httpError("Unauthorized", 401);
  }

  const { page, limit, skip } =
    normalizePagination(query);

  const { status, type } = validateFilters(query);

  const where = {
    [participantField]: userId,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.marketplaceTransaction.findMany({
      where,
      include: TRANSACTION_INCLUDE,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),

    prisma.marketplaceTransaction.count({
      where,
    }),
  ]);

  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      pages:
        total === 0
          ? 0
          : Math.ceil(total / limit),
    },
  };
}

export async function listMarketplacePurchases({
  userId,
  query = {},
}) {
  return listTransactions({
    userId,
    participantField: "buyerUserId",
    query,
  });
}

export async function listMarketplaceSales({
  userId,
  query = {},
}) {
  return listTransactions({
    userId,
    participantField: "sellerUserId",
    query,
  });
}

export async function getMarketplaceTransaction({
  transactionId,
  userId,
  role,
}) {
  if (!userId) {
    throw httpError("Unauthorized", 401);
  }

  const id = String(transactionId || "").trim();

  if (!id) {
    throw httpError(
      "Marketplace transaction ID is required",
      400,
    );
  }

  const transaction =
    await prisma.marketplaceTransaction.findUnique({
      where: {
        id,
      },
      include: TRANSACTION_INCLUDE,
    });

  if (!transaction) {
    throw httpError(
      "Marketplace transaction not found",
      404,
    );
  }

  const mayAccess =
    isAdminRole(role) ||
    transaction.buyerUserId === userId ||
    transaction.sellerUserId === userId ||
    transaction.buyerShop?.ownerId === userId ||
    transaction.sellerShop?.ownerId === userId;

  if (!mayAccess) {
    throw httpError("Forbidden", 403);
  }

  return transaction;
}

const ACTIVE_PURCHASE_STATUSES = [
  "PENDING",
  "PAYMENT_PROCESSING",
  "PAID",
  "FULFILLING",
];

function normalizePurchaseQuantity(value) {
  const quantity = Number(value ?? 1);

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 100
  ) {
    throw httpError(
      "Purchase quantity must be an integer between 1 and 100",
      400,
    );
  }

  return quantity;
}

function amountFromCents(cents) {
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0
  ) {
    throw httpError(
      "Marketplace amount is outside the supported range",
      400,
    );
  }

  return (cents / 100).toFixed(2);
}

function getPurchaseFlow(listingType) {
  switch (normalizeEnum(listingType)) {
    case "CUSTOMER_TO_CUSTOMER":
    case "SHOP_TO_CUSTOMER":
      return {
        transactionType: "DIRECT_PURCHASE",
        revenueType: "MARKETPLACE",
        buyerShopRequired: false,
      };

    case "SHOP_TO_SHOP":
      return {
        transactionType: "DEALER_TRANSFER",
        revenueType: "DEALER",
        buyerShopRequired: true,
      };

    case "CUSTOMER_TO_SHOP":
      return {
        transactionType: "CUSTOMER_SELL_TO_SHOP",
        revenueType: "PAWN",
        buyerShopRequired: true,
      };

    default:
      throw httpError(
        "Unsupported marketplace listing type",
        400,
      );
  }
}

async function loadBuyerShop({
  tx,
  buyerShopId,
  buyer,
  required,
}) {
  const id = String(buyerShopId || "").trim();

  if (!id) {
    if (required) {
      throw httpError(
        "A buyer shop is required for this transaction",
        400,
      );
    }

    return null;
  }

  const shop = await tx.pawnShop.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      ownerId: true,
      isDeleted: true,
    },
  });

  if (!shop || shop.isDeleted) {
    throw httpError(
      "Buyer shop not found",
      404,
    );
  }

  if (
    !isAdminRole(buyer.role) &&
    shop.ownerId !== buyer.id
  ) {
    throw httpError(
      "Forbidden",
      403,
    );
  }

  return shop;
}

function assertListingCanBePurchased({
  listing,
  buyer,
  buyerShop,
  quantity,
}) {
  if (!listing) {
    throw httpError(
      "Marketplace listing not found",
      404,
    );
  }

  if (listing.status !== "ACTIVE") {
    throw httpError(
      "Marketplace listing is not available",
      409,
    );
  }

  if (
    listing.expiresAt &&
    new Date(listing.expiresAt) <= new Date()
  ) {
    throw httpError(
      "Marketplace listing has expired",
      409,
    );
  }

  if (
    listing.sellerUserId === buyer.id ||
    listing.sellerShop?.ownerId === buyer.id ||
    (
      buyerShop &&
      listing.sellerShopId === buyerShop.id
    )
  ) {
    throw httpError(
      "You cannot purchase your own marketplace listing",
      409,
    );
  }

  if (
    listing.sellerShop &&
    listing.sellerShop.isDeleted
  ) {
    throw httpError(
      "Seller shop is unavailable",
      409,
    );
  }

  if (
    !Number.isSafeInteger(listing.quantity) ||
    listing.quantity < quantity
  ) {
    throw httpError(
      "Requested quantity is not available",
      409,
    );
  }

  const unitPrice = Number(listing.price);

  if (
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    throw httpError(
      "Marketplace listing does not have a valid fixed price",
      409,
    );
  }
}

export async function reserveMarketplacePurchase({
  listingId,
  buyerUserId,
  buyerShopId = null,
  quantity: requestedQuantity = 1,
}) {
  const normalizedListingId =
    String(listingId || "").trim();

  const normalizedBuyerUserId =
    String(buyerUserId || "").trim();

  if (!normalizedBuyerUserId) {
    throw httpError("Unauthorized", 401);
  }

  if (!normalizedListingId) {
    throw httpError(
      "Marketplace listing ID is required",
      400,
    );
  }

  const quantity =
    normalizePurchaseQuantity(requestedQuantity);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const buyer = await tx.user.findUnique({
          where: {
            id: normalizedBuyerUserId,
          },
          select: {
            id: true,
            role: true,
            isActive: true,
          },
        });

        if (!buyer || !buyer.isActive) {
          throw httpError(
            "Buyer account is unavailable",
            403,
          );
        }

        const listing =
          await tx.marketplaceListing.findUnique({
            where: {
              id: normalizedListingId,
            },
            include: {
              sellerShop: {
                select: {
                  id: true,
                  ownerId: true,
                  subscriptionPlan: true,
                  isDeleted: true,
                },
              },
            },
          });

        if (!listing) {
          throw httpError(
            "Marketplace listing not found",
            404,
          );
        }

        const flow =
          getPurchaseFlow(listing.listingType);

        const buyerShop = await loadBuyerShop({
          tx,
          buyerShopId,
          buyer,
          required: flow.buyerShopRequired,
        });

        assertListingCanBePurchased({
          listing,
          buyer,
          buyerShop,
          quantity,
        });

        const existingTransaction =
          await tx.marketplaceTransaction.findFirst({
            where: {
              listingId: listing.id,
              buyerUserId: buyer.id,
              status: {
                in: ACTIVE_PURCHASE_STATUSES,
              },
            },
            select: {
              id: true,
            },
          });

        if (existingTransaction) {
          throw httpError(
            "An active transaction already exists for this listing",
            409,
          );
        }

        const unitPriceCents = Math.round(
          Number(listing.price) * 100,
        );

        const subtotalCents =
          unitPriceCents * quantity;

        if (
          !Number.isSafeInteger(unitPriceCents) ||
          unitPriceCents <= 0 ||
          !Number.isSafeInteger(subtotalCents) ||
          subtotalCents <= 0
        ) {
          throw httpError(
            "Marketplace purchase amount is invalid",
            400,
          );
        }

        const sellerPlanCode =
          listing.sellerShop?.subscriptionPlan ||
          "FREE";

        const revenueContext =
          await calculateSettlementRevenueContext({
            amount: amountFromCents(subtotalCents),
            sellerPlanCode,
            transactionType: flow.revenueType,
            currency: listing.currency || "USD",
          });

        const revenue = revenueContext.revenue;

        const reservation =
          await tx.marketplaceListing.updateMany({
            where: {
              id: listing.id,
              status: "ACTIVE",
              quantity: {
                gte: quantity,
              },
            },
            data: {
              quantity: {
                decrement: quantity,
              },
            },
          });

        if (reservation.count !== 1) {
          throw httpError(
            "Marketplace listing changed while it was being reserved",
            409,
          );
        }

        const remainingListing =
          await tx.marketplaceListing.findUnique({
            where: {
              id: listing.id,
            },
            select: {
              quantity: true,
            },
          });

        if (!remainingListing) {
          throw httpError(
            "Marketplace listing became unavailable",
            409,
          );
        }

        if (remainingListing.quantity === 0) {
          await tx.marketplaceListing.updateMany({
            where: {
              id: listing.id,
              status: "ACTIVE",
              quantity: 0,
            },
            data: {
              status: "RESERVED",
            },
          });
        }

        return tx.marketplaceTransaction.create({
          data: {
            listingId: listing.id,
            buyerUserId: buyer.id,
            buyerShopId: buyerShop?.id || null,
            sellerUserId: listing.sellerUserId,
            sellerShopId:
              listing.sellerShopId || null,
            type: flow.transactionType,
            status: "PENDING",
            quantity,
            subtotal:
              amountFromCents(subtotalCents),
            platformFee:
              amountFromCents(
                revenue.platformFeeCents,
              ),
            shippingFee: "0.00",
            taxAmount: "0.00",
            totalAmount:
              amountFromCents(subtotalCents),
            currency:
              String(listing.currency || "USD")
                .trim()
                .toUpperCase(),
            fulfillmentStatus:
              "PAYMENT_PENDING",
            metadata: {
              source:
                "MARKETPLACE_PURCHASE_RESERVATION",
              reservedAt:
                new Date().toISOString(),
              listingType:
                listing.listingType,
              unitPriceCents,
              grossAmountCents:
                revenue.grossAmountCents,
              platformFeeCents:
                revenue.platformFeeCents,
              sellerNetCents:
                revenue.sellerNetCents,
              processorFeeCents:
                revenue.processorFeeCents,
              platformNetCents:
                revenue.platformNetCents,
              sellerPlanCode:
                revenueContext.sellerPlanCode,
              revenueTransactionType:
                revenueContext.transactionType,
              pricingRuleSnapshot:
                revenue.pricingRuleSnapshot,
            },
          },
          include: TRANSACTION_INCLUDE,
        });
      },
      {
        isolationLevel: "Serializable",
        maxWait: 5000,
        timeout: 10000,
      },
    );
  } catch (error) {
    if (error?.code === "P2034") {
      throw httpError(
        "Marketplace listing changed while it was being reserved; please try again",
        409,
      );
    }

    throw error;
  }
}

export async function updateMarketplaceTransactionFulfillment({
  transactionId,
  actorUserId,
  role,
  fulfillmentStatus,
  trackingNumber,
  carrier,
  note,
}) {
  const id =
    String(
      transactionId ||
      "",
    ).trim();

  const userId =
    String(
      actorUserId ||
      "",
    ).trim();

  const targetStatus =
    normalizeEnum(
      fulfillmentStatus,
    );

  if (!userId) {
    throw httpError(
      "Unauthorized",
      401,
      "MARKETPLACE_FULFILLMENT_AUTH_REQUIRED",
    );
  }

  if (!id) {
    throw httpError(
      "Marketplace transaction ID is required",
      400,
      "MARKETPLACE_TRANSACTION_ID_REQUIRED",
    );
  }

  if (
    !targetStatus ||
    !SELLER_FULFILLMENT_TARGETS
      .has(
        targetStatus,
      )
  ) {
    throw httpError(
      "Invalid marketplace fulfillment status",
      400,
      "MARKETPLACE_FULFILLMENT_STATUS_INVALID",
    );
  }

  const normalizedTrackingNumber =
    normalizeFulfillmentText(
      trackingNumber,
      {
        field:
          "Tracking number",

        maxLength:
          120,
      },
    );

  const normalizedCarrier =
    normalizeFulfillmentText(
      carrier,
      {
        field:
          "Carrier",

        maxLength:
          80,
      },
    );

  const normalizedNote =
    normalizeFulfillmentText(
      note,
      {
        field:
          "Fulfillment note",

        maxLength:
          500,
      },
    );

  const transaction =
    await prisma
      .marketplaceTransaction
      .findUnique({
        where: {
          id,
        },

        include:
          TRANSACTION_INCLUDE,
      });

  if (!transaction) {
    throw httpError(
      "Marketplace transaction not found",
      404,
      "MARKETPLACE_TRANSACTION_NOT_FOUND",
    );
  }

  if (
    !mayManageMarketplaceFulfillment({
      transaction,
      actorUserId:
        userId,
      role,
    })
  ) {
    throw httpError(
      "Forbidden",
      403,
      "MARKETPLACE_FULFILLMENT_FORBIDDEN",
    );
  }

  if (
    transaction
      .fulfillmentStatus ===
    targetStatus
  ) {
    return {
      handled:
        true,

      idempotent:
        true,

      transaction,
    };
  }

  if (
    ![
      "PAID",
      "FULFILLING",
    ].includes(
      transaction.status,
    )
  ) {
    throw httpError(
      "Marketplace fulfillment can only be updated after payment",
      409,
      "MARKETPLACE_FULFILLMENT_PAYMENT_REQUIRED",
    );
  }

  const transitions =
    FULFILLMENT_TRANSITIONS[
      transaction
        .fulfillmentStatus
    ];

  if (
    !transitions ||
    !transitions.has(
      targetStatus,
    )
  ) {
    throw httpError(
      `Marketplace fulfillment cannot move from ${transaction.fulfillmentStatus} to ${targetStatus}`,
      409,
      "MARKETPLACE_FULFILLMENT_TRANSITION_INVALID",
    );
  }

  if (
    targetStatus ===
      "READY_FOR_PICKUP" &&
    !transaction
      .listing
      ?.pickupAvailable
  ) {
    throw httpError(
      "Pickup is not available for this marketplace listing",
      409,
      "MARKETPLACE_FULFILLMENT_METHOD_UNAVAILABLE",
    );
  }

  if (
    targetStatus ===
    "SHIPPED"
  ) {
    if (
      !transaction
        .listing
        ?.shippingAvailable
    ) {
      throw httpError(
        "Shipping is not available for this marketplace listing",
        409,
        "MARKETPLACE_FULFILLMENT_METHOD_UNAVAILABLE",
      );
    }

    if (
      !normalizedTrackingNumber
    ) {
      throw httpError(
        "A tracking number is required before marking the transaction shipped",
        400,
        "MARKETPLACE_FULFILLMENT_TRACKING_REQUIRED",
      );
    }

    if (
      !normalizedCarrier
    ) {
      throw httpError(
        "A carrier is required before marking the transaction shipped",
        400,
        "MARKETPLACE_FULFILLMENT_CARRIER_REQUIRED",
      );
    }
  }

  const updatedAt =
    new Date();

  const metadata =
    metadataObject(
      transaction.metadata,
    );

  const previousFulfillment =
    metadataObject(
      metadata.fulfillment,
    );

  const previousHistory =
    Array.isArray(
      previousFulfillment
        .history,
    )
      ? previousFulfillment
          .history
          .filter(
            (entry) =>
              entry &&
              typeof entry ===
                "object" &&
              !Array.isArray(
                entry,
              ),
          )
          .slice(
            -19,
          )
      : [];

  const fulfillmentEvent = {
    status:
      targetStatus,

    at:
      updatedAt
        .toISOString(),

    actorUserId:
      userId,

    trackingNumber:
      normalizedTrackingNumber ||
      null,

    carrier:
      normalizedCarrier ||
      null,

    note:
      normalizedNote ||
      null,
  };

  const nextMetadata = {
    ...metadata,

    fulfillment: {
      ...previousFulfillment,

      status:
        targetStatus,

      trackingNumber:
        normalizedTrackingNumber ||
        previousFulfillment
          .trackingNumber ||
        null,

      carrier:
        normalizedCarrier ||
        previousFulfillment
          .carrier ||
        null,

      note:
        normalizedNote ||
        previousFulfillment
          .note ||
        null,

      updatedAt:
        updatedAt
          .toISOString(),

      updatedByUserId:
        userId,

      history: [
        ...previousHistory,
        fulfillmentEvent,
      ],
    },
  };

  const updateData = {
    status:
      targetStatus ===
        "COMPLETED"
        ? "COMPLETED"
        : "FULFILLING",

    fulfillmentStatus:
      targetStatus,

    metadata:
      nextMetadata,
  };

  if (
    targetStatus ===
    "COMPLETED"
  ) {
    updateData.completedAt =
      updatedAt;
  }

  return prisma.$transaction(
    async (tx) => {
      const updateResult =
        await tx
          .marketplaceTransaction
          .updateMany({
            where: {
              id:
                transaction.id,

              status:
                transaction.status,

              fulfillmentStatus:
                transaction
                  .fulfillmentStatus,
            },

            data:
              updateData,
          });

      if (
        updateResult.count !==
        1
      ) {
        throw httpError(
          "Marketplace fulfillment changed while it was being updated",
          409,
          "MARKETPLACE_FULFILLMENT_STATE_CONFLICT",
        );
      }

      const updatedTransaction =
        await tx
          .marketplaceTransaction
          .findUnique({
            where: {
              id:
                transaction.id,
            },

            include:
              TRANSACTION_INCLUDE,
          });

      if (!updatedTransaction) {
        throw httpError(
          "Marketplace transaction became unavailable",
          409,
          "MARKETPLACE_TRANSACTION_UNAVAILABLE",
        );
      }

      return {
        handled:
          true,

        idempotent:
          false,

        transaction:
          updatedTransaction,
      };
    },
    {
      isolationLevel:
        "Serializable",

      maxWait:
        5000,

      timeout:
        10000,
    },
  );
}

// File: apps/api/backend/src/controllers/superAdmin.controller.js

import { prisma } from "../lib/prisma.js";
import {
  SELLER_PLANS,
  getSellerPlanCodes,
  getPaidSellerPlanCodes,
} from "../config/sellerPlans.js";

const BUYER_PLAN_CATALOG = Object.freeze([
  {
    code: "FREE",
    label: "Free",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    features: ["Browse marketplace", "Watchlist", "Saved searches"],
  },
  {
    code: "PLUS",
    label: "Plus",
    monthlyPriceCents: 999,
    yearlyPriceCents: 9990,
    features: ["Everything in Free", "Priority alerts", "Enhanced saved searches"],
  },
  {
    code: "PREMIUM",
    label: "Premium",
    monthlyPriceCents: 1999,
    yearlyPriceCents: 19990,
    features: ["Everything in Plus", "Advanced notifications", "Priority support"],
  },
  {
    code: "ULTRA",
    label: "Ultra",
    monthlyPriceCents: 2999,
    yearlyPriceCents: 29990,
    features: ["Everything in Premium", "VIP access features", "Early feature access"],
  },
]);

const USER_ROLE_CODES = new Set(["CONSUMER", "OWNER", "ADMIN", "SUPER_ADMIN"]);

const SUBSCRIPTION_STATUSES = new Set([
  "UNKNOWN",
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "CANCELED",
  "PAUSED",
]);

const SETTLEMENT_STATUSES = new Set([
  "PENDING",
  "CHARGED",
  "FAILED",
  "CANCELED",
  "REFUNDED",
]);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 250;

function createHttpError(message, statusCode = 500, details = undefined) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (details !== undefined) err.details = details;
  return err;
}

function badRequest(message, details = undefined) {
  return createHttpError(message, 400, details);
}

function forbidden(message = "Forbidden") {
  return createHttpError(message, 403);
}

function notFound(message = "Not found") {
  return createHttpError(message, 404);
}

function serviceUnavailable(message = "Service unavailable") {
  return createHttpError(message, 503);
}

function sendError(res, error, fallbackMessage = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallbackMessage,
    ...(error?.details ? { details: error.details } : {}),
  });
}

function assertSuperAdmin(req) {
  const role = normalizeUpper(req?.user?.role);
  if (role !== "SUPER_ADMIN") {
    throw forbidden("Super Admin access required.");
  }
}

function hasModel(modelName) {
  return Boolean(prisma?.[modelName]);
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

function normalizeNullableString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function normalizeUpper(value, fallback = "") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeBoolean(value, fallback = undefined) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const lowered = String(value).trim().toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return fallback;
}

function normalizeDateOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw badRequest("Invalid date value.");
  }

  return date;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toMoneyNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCents(value) {
  return Math.round(toMoneyNumber(value) * 100);
}

function countBy(items, predicate) {
  return items.reduce((sum, item) => sum + (predicate(item) ? 1 : 0), 0);
}

function paginationFromQuery(query = {}) {
  const page = Math.max(Number.parseInt(query.page || "1", 10) || 1, 1);
  const requestedLimit =
    Number.parseInt(query.limit || String(DEFAULT_PAGE_SIZE), 10) ||
    DEFAULT_PAGE_SIZE;
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function makePagedResponse(key, rows, total, page, limit) {
  return {
    success: true,
    [key]: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
}

function buildSearchFilter(fields, value) {
  const search = normalizeString(value);
  if (!search) return undefined;

  return {
    OR: fields.map((field) => ({
      [field]: {
        contains: search,
        mode: "insensitive",
      },
    })),
  };
}

function normalizeBuyerPlanCode(value, fallback = "FREE") {
  const planCode = normalizeUpper(value, fallback);
  const allowedPlanCodes = BUYER_PLAN_CATALOG.map((plan) => plan.code);

  if (!allowedPlanCodes.includes(planCode)) {
    throw badRequest("Invalid buyer plan code.", { allowedPlanCodes });
  }

  return planCode;
}

function normalizeSellerPlanCode(value, fallback = "FREE") {
  const planCode = normalizeUpper(value, fallback);
  const allowedPlanCodes = getSellerPlanCodes();

  if (!allowedPlanCodes.includes(planCode)) {
    throw badRequest("Invalid seller plan code.", { allowedPlanCodes });
  }

  return planCode;
}

function normalizeSubscriptionStatus(value, fallback = "ACTIVE") {
  const status = normalizeUpper(value, fallback);

  if (!SUBSCRIPTION_STATUSES.has(status)) {
    throw badRequest("Invalid subscription status.", {
      allowedStatuses: [...SUBSCRIPTION_STATUSES],
    });
  }

  return status;
}

function normalizeSettlementStatus(value, fallback = "PENDING") {
  const aliases = {
    COMPLETE: "CHARGED",
    COMPLETED: "CHARGED",
    PAID: "CHARGED",
    SUCCESS: "CHARGED",
    SUCCEEDED: "CHARGED",
    CANCELLED: "CANCELED",
    ERROR: "FAILED",
  };

  const raw = normalizeUpper(value, fallback);
  const normalized = aliases[raw] || raw;

  if (!SETTLEMENT_STATUSES.has(normalized)) {
    throw badRequest("Invalid settlement status.", {
      allowedStatuses: [...SETTLEMENT_STATUSES],
    });
  }

  return normalized;
}

function mapUserRow(user) {
  return {
    id: user.id,
    name: user.name || null,
    email: user.email,
    role: normalizeUpper(user.role, "CONSUMER"),
    isActive: Boolean(user.isActive),
    createdAt: toIsoOrNull(user.createdAt),
    updatedAt: toIsoOrNull(user.updatedAt),
  };
}

function mapShopRow(shop) {
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address || null,
    phone: shop.phone || null,
    description: shop.description || null,
    hours: shop.hours || null,
    ownerId: shop.ownerId || null,
    ownerName: shop.owner?.name || null,
    ownerEmail: shop.owner?.email || null,
    isDeleted: Boolean(shop.isDeleted),
    subscriptionPlan: normalizeUpper(shop.subscriptionPlan, "FREE"),
    subscriptionStatus: normalizeUpper(shop.subscriptionStatus, "UNKNOWN"),
    subscriptionCurrentPeriodEnd: toIsoOrNull(shop.subscriptionCurrentPeriodEnd),
    cancelAtPeriodEnd: Boolean(shop.cancelAtPeriodEnd),
    stripeCustomerId: shop.stripeCustomerId || null,
    stripeSubscriptionId: shop.stripeSubscriptionId || null,
    createdAt: toIsoOrNull(shop.createdAt),
    updatedAt: toIsoOrNull(shop.updatedAt),
  };
}

function mapSettlementRow(settlement) {
  return {
    id: settlement.id,
    auctionId: settlement.auctionId,
    winnerUserId: settlement.winnerUserId,
    winnerName: settlement.winner?.name || null,
    winnerEmail: settlement.winner?.email || null,
    finalPrice: toMoneyNumber(settlement.finalPrice),
    finalAmountCents: toCents(settlement.finalPrice),
    currency: normalizeUpper(settlement.currency, "USD"),
    status: normalizeUpper(settlement.status, "UNKNOWN"),
    stripePaymentIntent: settlement.stripePaymentIntent || null,
    createdAt: toIsoOrNull(settlement.createdAt),
    updatedAt: toIsoOrNull(settlement.updatedAt),
    auction: settlement.auction
      ? {
          id: settlement.auction.id,
          itemId: settlement.auction.itemId || null,
          shopId: settlement.auction.shopId || null,
          status: settlement.auction.status || null,
          endsAt: toIsoOrNull(settlement.auction.endsAt),
        }
      : null,
  };
}

function mapBuyerSubscriptionRow(record) {
  return {
    id: record.id,
    userId: record.userId,
    userName: record.user?.name || null,
    userEmail: record.user?.email || null,
    planCode: normalizeUpper(record.plan || record.planCode, "FREE"),
    status: normalizeUpper(record.status, "ACTIVE"),
    billingInterval: record.billingInterval || null,
    cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
    currentPeriodStart: toIsoOrNull(record.currentPeriodStart),
    currentPeriodEnd: toIsoOrNull(record.currentPeriodEnd),
    startedAt: toIsoOrNull(record.startedAt),
    canceledAt: toIsoOrNull(record.canceledAt),
    trialEndsAt: toIsoOrNull(record.trialEndsAt),
    stripeCustomerId: record.stripeCustomerId || null,
    stripeSubscriptionId: record.stripeSubscriptionId || null,
    stripePriceId: record.stripePriceId || null,
    stripeLatestInvoiceId: record.stripeLatestInvoiceId || null,
    stripeCheckoutSessionId: record.stripeCheckoutSessionId || null,
    createdAt: toIsoOrNull(record.createdAt),
    updatedAt: toIsoOrNull(record.updatedAt),
  };
}

function mapSellerPlanCatalog() {
  return getSellerPlanCodes().map((code) => {
    const plan = SELLER_PLANS[code];

    return {
      code: plan.code,
      label: plan.label,
      monthlyPriceCents: Number(plan.monthlyPriceCents || 0),
      yearlyPriceCents: Number(plan.yearlyPriceCents || 0),
      maxActiveListings:
        plan.maxActiveListings === null ? null : Number(plan.maxActiveListings || 0),
      maxLocations: plan.maxLocations === null ? null : Number(plan.maxLocations || 0),
      maxStaffUsers:
        plan.maxStaffUsers === null ? null : Number(plan.maxStaffUsers || 0),
      canCreateAuctions: Boolean(plan.canCreateAuctions),
      canFeatureListings: Boolean(plan.canFeatureListings),
      analyticsLevel: plan.analyticsLevel || "none",
      commissionBps: Number(plan.commissionBps || 0),
      commissionPercent: Number((Number(plan.commissionBps || 0) / 100).toFixed(2)),
      features: Array.isArray(plan.features) ? plan.features : [],
      isPaid: getPaidSellerPlanCodes().includes(plan.code),
    };
  });
}

function mapBuyerPlanCatalog() {
  return BUYER_PLAN_CATALOG.map((plan) => ({
    ...plan,
    yearlyPriceCents: Number(
      plan.yearlyPriceCents ?? Math.round(Number(plan.monthlyPriceCents || 0) * 10)
    ),
  }));
}

async function requireUser(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found.");
  return user;
}

async function requireShop(id) {
  const shop = await prisma.pawnShop.findUnique({
    where: { id },
    include: {
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!shop) throw notFound("Shop not found.");
  return shop;
}

async function requireSettlement(id) {
  const settlement = await prisma.settlement.findUnique({
    where: { id },
    include: {
      winner: {
        select: { id: true, name: true, email: true },
      },
      auction: true,
    },
  });

  if (!settlement) throw notFound("Settlement not found.");
  return settlement;
}

export async function getSuperAdminOverview(req, res) {
  try {
    assertSuperAdmin(req);

    const [
      users,
      shops,
      itemsCount,
      auctions,
      offersCount,
      settlements,
      buyerSubscriptions,
    ] = await Promise.all([
      prisma.user.findMany({ select: { id: true, role: true, isActive: true } }),
      prisma.pawnShop.findMany({
        select: {
          id: true,
          isDeleted: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
        },
      }),
      prisma.item.count(),
      prisma.auction.findMany({
        select: { id: true, status: true, currentPrice: true, updatedAt: true },
      }),
      prisma.offer.count(),
      prisma.settlement.findMany({
        select: { id: true, finalPrice: true, status: true },
      }),
      hasModel("buyerSubscription")
        ? prisma.buyerSubscription.findMany({
            select: { id: true, plan: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const chargedSettlements = settlements.filter(
      (row) => normalizeUpper(row.status) === "CHARGED"
    );

    const sellerPlanCatalog = mapSellerPlanCatalog();
    const buyerPlanCatalog = mapBuyerPlanCatalog();

    const projectedSellerMrrCents = shops.reduce((sum, shop) => {
      const plan = sellerPlanCatalog.find(
        (candidate) => candidate.code === normalizeUpper(shop.subscriptionPlan, "FREE")
      );
      return sum + Number(plan?.monthlyPriceCents || 0);
    }, 0);

    const projectedBuyerMrrCents = buyerSubscriptions.reduce((sum, subscription) => {
      const plan = buyerPlanCatalog.find(
        (candidate) => candidate.code === normalizeUpper(subscription.plan, "FREE")
      );
      return sum + Number(plan?.monthlyPriceCents || 0);
    }, 0);

    return res.json({
      success: true,
      overview: {
        users: {
          total: users.length,
          owners: countBy(users, (u) => normalizeUpper(u.role) === "OWNER"),
          consumers: countBy(users, (u) => normalizeUpper(u.role) === "CONSUMER"),
          admins: countBy(users, (u) => normalizeUpper(u.role) === "ADMIN"),
          superAdmins: countBy(users, (u) => normalizeUpper(u.role) === "SUPER_ADMIN"),
          active: countBy(users, (u) => u.isActive === true),
          blocked: countBy(users, (u) => u.isActive === false),
        },
        shops: {
          total: shops.length,
          active: countBy(shops, (s) => s.isDeleted !== true),
          deleted: countBy(shops, (s) => s.isDeleted === true),
        },
        inventory: { itemsCount },
        auctions: {
          total: auctions.length,
          live: countBy(auctions, (a) => normalizeUpper(a.status) === "LIVE"),
          ended: countBy(auctions, (a) => normalizeUpper(a.status) === "ENDED"),
          canceled: countBy(auctions, (a) => normalizeUpper(a.status) === "CANCELED"),
        },
        offers: { total: offersCount },
        settlements: {
          total: settlements.length,
          charged: chargedSettlements.length,
          pending: countBy(
            settlements,
            (row) => normalizeUpper(row.status) === "PENDING"
          ),
          chargedGrossCents: chargedSettlements.reduce(
            (sum, row) => sum + toCents(row.finalPrice),
            0
          ),
        },
        subscriptions: {
          seller: {
            total: shops.length,
            projectedMrrCents: projectedSellerMrrCents,
          },
          buyer: {
            total: buyerSubscriptions.length,
            projectedMrrCents: projectedBuyerMrrCents,
          },
          projectedTotalMrrCents: projectedSellerMrrCents + projectedBuyerMrrCents,
        },
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listSuperAdminUsers(req, res) {
  try {
    assertSuperAdmin(req);

    const { page, limit, skip } = paginationFromQuery(req.query);
    const role = normalizeUpper(req.query?.role);
    const active = normalizeBoolean(req.query?.isActive);
    const searchFilter = buildSearchFilter(["name", "email"], req.query?.q);

    const where = {
      ...(role ? { role } : {}),
      ...(typeof active === "boolean" ? { isActive: active } : {}),
      ...(searchFilter || {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return res.json(
      makePagedResponse("users", users.map(mapUserRow), total, page, limit)
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSuperAdminUser(req, res) {
  try {
    assertSuperAdmin(req);

    const userId = normalizeString(req.params?.id);
    if (!userId) throw badRequest("User id is required.");

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : null;

    if (!body) throw badRequest("Request body must be a JSON object.");

    const update = {};

    if (body.isActive !== undefined) {
      const normalized = normalizeBoolean(body.isActive);
      if (typeof normalized !== "boolean") {
        throw badRequest("isActive must be a boolean.");
      }
      update.isActive = normalized;
    }

    if (body.role !== undefined) {
      const role = normalizeUpper(body.role);
      if (!USER_ROLE_CODES.has(role)) {
        throw badRequest("Invalid role.", { allowedRoles: [...USER_ROLE_CODES] });
      }
      update.role = role;
    }

    if (Object.keys(update).length === 0) {
      throw badRequest("No valid user updates provided.");
    }

    await requireUser(userId);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: update,
    });

    return res.json({
      success: true,
      user: mapUserRow(updated),
    });
  } catch (error) {
    return sendError(res, error);
  }
}


async function writeSuperAdminGovernanceAudit(
  req,
  {
    action,
    targetType,
    targetId,
    statusCode = 200,
    success = true,
    metadata = {},
  }
) {
  try {
    await prisma.superAdminAuditLog.create({
      data: {
        actorId: req?.user?.sub ?? null,
        actorEmail: req?.user?.email ?? req?.user?.username ?? null,
        actorRole: req?.user?.role ?? null,
        action,
        method: req?.method ?? "UNKNOWN",
        path: req?.originalUrl ?? req?.url ?? "",
        routeKey: req?.route?.path ? String(req.route.path) : null,
        targetType,
        targetId,
        statusCode,
        success,
        requestId: req?.id ?? req?.requestId ?? null,
        ipAddress: req?.ip ?? null,
        userAgent: typeof req?.get === "function" ? req.get("user-agent") : null,
        metadata,
      },
    });
  } catch (auditError) {
    console.warn("[super-admin:audit] Failed to write audit log", {
      action,
      targetType,
      targetId,
      error: auditError?.message || auditError,
    });
  }
}

function normalizeSuperAdminString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const next = String(value).trim();
  return next.length ? next : null;
}

function toSuperAdminShopRow(shop, owner) {
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address ?? null,
    phone: shop.phone ?? null,
    description: shop.description ?? null,
    hours: shop.hours ?? null,
    ownerId: shop.ownerId ?? owner?.id ?? null,
    ownerName: owner?.name ?? null,
    ownerEmail: owner?.email ?? null,
    subscriptionPlan: shop.subscriptionPlan ?? null,
    subscriptionStatus: shop.subscriptionStatus ?? null,
    subscriptionCurrentPeriodEnd: shop.subscriptionCurrentPeriodEnd ?? null,
    cancelAtPeriodEnd: shop.cancelAtPeriodEnd ?? false,
    stripeCustomerId: shop.stripeCustomerId ?? null,
    stripeSubscriptionId: shop.stripeSubscriptionId ?? null,
    createdAt: shop.createdAt ?? null,
    updatedAt: shop.updatedAt ?? null,
    isDeleted: shop.isDeleted ?? false,
  };
}

export async function createSuperAdminShop(req, res) {
  try {
    const ownerId = normalizeSuperAdminString(req.body?.ownerId);
    const name = normalizeSuperAdminString(req.body?.name);
    const address = normalizeSuperAdminString(req.body?.address);
    const phone = normalizeSuperAdminString(req.body?.phone);
    const description = normalizeSuperAdminString(req.body?.description);
    const hours = normalizeSuperAdminString(req.body?.hours);
    const subscriptionPlan = normalizeSuperAdminString(req.body?.subscriptionPlan) || "FREE";
    const subscriptionStatus = normalizeSuperAdminString(req.body?.subscriptionStatus) || "ACTIVE";

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        error: "ownerId is required.",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Shop name is required.",
      });
    }

    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!owner) {
      return res.status(404).json({
        success: false,
        error: "Owner user not found.",
      });
    }

    if (owner.role !== "OWNER") {
      return res.status(400).json({
        success: false,
        error: "Selected user must have OWNER role.",
      });
    }

    if (owner.isActive === false) {
      return res.status(400).json({
        success: false,
        error: "Selected owner user is inactive.",
      });
    }

    const shop = await prisma.pawnShop.create({
      data: {
        ownerId,
        name,
        address,
        phone,
        description,
        hours,
        subscriptionPlan,
        subscriptionStatus,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        description: true,
        hours: true,
        ownerId: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
      },
    });

    const shopRow = toSuperAdminShopRow(shop, owner);

    await writeSuperAdminGovernanceAudit(req, {
      action: "CREATE_SHOP",
      targetType: "SHOP",
      targetId: shop.id,
      statusCode: 201,
      metadata: {
        shopName: shop.name,
        ownerId,
        ownerEmail: owner.email,
        subscriptionPlan,
        subscriptionStatus,
      },
    });

    return res.status(201).json({
      success: true,
      shop: shopRow,
    });
  } catch (err) {
    return handleSuperAdminError(res, err, "Failed to create shop.");
  }
}



export async function reassignSuperAdminShopOwner(req, res) {
  try {
    const shopId = normalizeSuperAdminString(req.params?.id);
    const ownerId = normalizeSuperAdminString(req.body?.ownerId);

    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: "Shop id is required.",
      });
    }

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        error: "ownerId is required.",
      });
    }

    const [shop, owner] = await Promise.all([
      prisma.pawnShop.findUnique({
        where: { id: shopId },
        select: {
          id: true,
          name: true,
          ownerId: true,
          isDeleted: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: ownerId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      }),
    ]);

    if (!shop || shop.isDeleted === true) {
      return res.status(404).json({
        success: false,
        error: "Shop not found.",
      });
    }

    if (!owner) {
      return res.status(404).json({
        success: false,
        error: "Owner user not found.",
      });
    }

    if (owner.role !== "OWNER") {
      return res.status(400).json({
        success: false,
        error: "Selected user must have OWNER role.",
      });
    }

    if (owner.isActive === false) {
      return res.status(400).json({
        success: false,
        error: "Selected owner user is inactive.",
      });
    }

    const updated = await prisma.pawnShop.update({
      where: { id: shopId },
      data: { ownerId },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        description: true,
        hours: true,
        ownerId: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
      },
    });

    const shopRow = toSuperAdminShopRow(updated, owner);

    await writeSuperAdminGovernanceAudit(req, {
      action: "REASSIGN_SHOP_OWNER",
      targetType: "SHOP",
      targetId: shopId,
      statusCode: 200,
      metadata: {
        shopName: updated.name,
        previousOwnerId: shop.ownerId,
        newOwnerId: ownerId,
        newOwnerEmail: owner.email,
      },
    });

    return res.json({
      success: true,
      shop: shopRow,
    });
  } catch (err) {
    return handleSuperAdminError(res, err, "Failed to reassign shop owner.");
  }
}



function scrubIntegrationForSuperAdmin(row = {}) {
  const unsafeKeys = new Set([
    "credential",
    "credentials",
    "encryptedCredential",
    "encryptedCredentials",
    "credentialCiphertext",
    "credentialIv",
    "credentialTag",
    "apiKey",
    "token",
    "secret",
    "password",
  ]);

  const out = {};

  for (const [key, value] of Object.entries(row || {})) {
    const lower = key.toLowerCase();

    if (
      unsafeKeys.has(key) ||
      lower.includes("credential") ||
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("password") ||
      lower.includes("apikey")
    ) {
      continue;
    }

    out[key] = value;
  }

  return out;
}

function hasIntegrationCredential(row = {}) {
  return Object.entries(row || {}).some(([key, value]) => {
    const lower = String(key).toLowerCase();
    return (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      (lower.includes("credential") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("password") ||
        lower.includes("apikey"))
    );
  });
}

function normalizeIntegrationRowsPayload(rows, shopsById, ownersById, mappingsByIntegration, jobsByIntegration) {
  return rows.map((integration) => {
    const safe = scrubIntegrationForSuperAdmin(integration);
    const shopId = integration.shopId || integration.pawnShopId || integration.storeId || null;
    const shop = shopId ? shopsById.get(shopId) : null;
    const owner = shop?.ownerId ? ownersById.get(shop.ownerId) : null;
    const jobs = jobsByIntegration.get(integration.id) || [];
    const latestJob = jobs[0] || null;

    return {
      ...safe,
      id: integration.id,
      shopId,
      shopName: shop?.name || null,
      ownerId: shop?.ownerId || null,
      ownerName: owner?.name || null,
      ownerEmail: owner?.email || null,
      mappingsCount: mappingsByIntegration.get(integration.id) || 0,
      jobsCount: jobs.length,
      latestJob: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status || null,
            createdAt: latestJob.createdAt || null,
            updatedAt: latestJob.updatedAt || null,
            error: latestJob.error || latestJob.errorMessage || null,
          }
        : null,
      hasCredential: hasIntegrationCredential(integration),
    };
  });
}

export async function listSuperAdminIntegrations(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 250);

    const integrations = await prisma.inventoryIntegration.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const integrationIds = integrations.map((row) => row.id).filter(Boolean);
    const shopIds = [
      ...new Set(
        integrations
          .map((row) => row.shopId || row.pawnShopId || row.storeId)
          .filter(Boolean),
      ),
    ];

    const [shops, mappings, jobs] = await Promise.all([
      shopIds.length
        ? prisma.pawnShop.findMany({
            where: { id: { in: shopIds } },
            select: {
              id: true,
              name: true,
              ownerId: true,
              isDeleted: true,
            },
          })
        : Promise.resolve([]),
      integrationIds.length
        ? prisma.inventoryFieldMapping.findMany({
            where: { integrationId: { in: integrationIds } },
            select: {
              id: true,
              integrationId: true,
            },
          })
        : Promise.resolve([]),
      integrationIds.length
        ? prisma.inventorySyncJob.findMany({
            where: { integrationId: { in: integrationIds } },
            orderBy: { createdAt: "desc" },
            take: Math.max(integrationIds.length * 5, 50),
          })
        : Promise.resolve([]),
    ]);

    const ownerIds = [...new Set(shops.map((shop) => shop.ownerId).filter(Boolean))];

    const owners = ownerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        })
      : [];

    const shopsById = new Map(shops.map((shop) => [shop.id, shop]));
    const ownersById = new Map(owners.map((owner) => [owner.id, owner]));

    const mappingsByIntegration = new Map();
    for (const mapping of mappings) {
      mappingsByIntegration.set(
        mapping.integrationId,
        (mappingsByIntegration.get(mapping.integrationId) || 0) + 1,
      );
    }

    const jobsByIntegration = new Map();
    for (const job of jobs) {
      const list = jobsByIntegration.get(job.integrationId) || [];
      list.push(job);
      jobsByIntegration.set(job.integrationId, list);
    }

    const rows = normalizeIntegrationRowsPayload(
      integrations,
      shopsById,
      ownersById,
      mappingsByIntegration,
      jobsByIntegration,
    );

    return res.json({
      success: true,
      rows,
      total: rows.length,
      page: 1,
      limit,
    });
  } catch (err) {
    return handleSuperAdminError(res, err, "Failed to load integrations.");
  }
}

export async function archiveSuperAdminIntegration(req, res) {
  try {
    const id = normalizeSuperAdminString(req.params?.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Integration id is required.",
      });
    }

    const existing = await prisma.inventoryIntegration.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Integration not found.",
      });
    }

    const updated = await prisma.inventoryIntegration.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    if (typeof writeSuperAdminGovernanceAudit === "function") {
      await writeSuperAdminGovernanceAudit(req, {
        action: "ARCHIVE_INTEGRATION",
        targetType: "INTEGRATION",
        targetId: id,
        statusCode: 200,
        metadata: {
          previousStatus: existing.status || null,
          newStatus: "ARCHIVED",
          shopId: existing.shopId || existing.pawnShopId || null,
          name: existing.name || null,
        },
      });
    }

    return res.json({
      success: true,
      integration: scrubIntegrationForSuperAdmin(updated),
    });
  } catch (err) {
    return handleSuperAdminError(res, err, "Failed to archive integration.");
  }
}


export async function listSuperAdminShops(req, res) {
  try {
    assertSuperAdmin(req);

    const { page, limit, skip } = paginationFromQuery(req.query);
    const deleted = normalizeBoolean(req.query?.isDeleted);
    const plan = normalizeUpper(req.query?.subscriptionPlan);
    const searchFilter = buildSearchFilter(["name", "address"], req.query?.q);

    const where = {
      ...(typeof deleted === "boolean" ? { isDeleted: deleted } : {}),
      ...(plan ? { subscriptionPlan: plan } : {}),
      ...(searchFilter || {}),
    };

    const [total, shops] = await Promise.all([
      prisma.pawnShop.count({ where }),
      prisma.pawnShop.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return res.json(
      makePagedResponse("shops", shops.map(mapShopRow), total, page, limit)
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSuperAdminShop(req, res) {
  try {
    assertSuperAdmin(req);

    const shopId = normalizeString(req.params?.id);
    if (!shopId) throw badRequest("Shop id is required.");

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : null;

    if (!body) throw badRequest("Request body must be a JSON object.");

    const update = {};

    if (body.isDeleted !== undefined) {
      const normalized = normalizeBoolean(body.isDeleted);
      if (typeof normalized !== "boolean") {
        throw badRequest("isDeleted must be a boolean.");
      }
      update.isDeleted = normalized;
    }

    if (body.subscriptionPlan !== undefined) {
      update.subscriptionPlan = normalizeSellerPlanCode(body.subscriptionPlan);
    }

    if (body.subscriptionStatus !== undefined) {
      update.subscriptionStatus = normalizeSubscriptionStatus(body.subscriptionStatus);
    }

    if (body.subscriptionCurrentPeriodEnd !== undefined) {
      update.subscriptionCurrentPeriodEnd = normalizeDateOrNull(
        body.subscriptionCurrentPeriodEnd
      );
    }

    if (body.cancelAtPeriodEnd !== undefined) {
      const normalized = normalizeBoolean(body.cancelAtPeriodEnd);
      if (typeof normalized !== "boolean") {
        throw badRequest("cancelAtPeriodEnd must be a boolean.");
      }
      update.cancelAtPeriodEnd = normalized;
    }

    if (Object.keys(update).length === 0) {
      throw badRequest("No valid shop updates provided.");
    }

    await requireShop(shopId);

    const updated = await prisma.pawnShop.update({
      where: { id: shopId },
      data: update,
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.json({
      success: true,
      shop: mapShopRow(updated),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getSuperAdminSellerPlans(req, res) {
  try {
    assertSuperAdmin(req);

    return res.json({
      success: true,
      plans: mapSellerPlanCatalog(),
      source: "CONFIG",
      mutableInApp: false,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getSuperAdminBuyerPlans(req, res) {
  try {
    assertSuperAdmin(req);

    return res.json({
      success: true,
      plans: mapBuyerPlanCatalog(),
      source: "CONTROLLER_DEFAULTS",
      mutableInApp: false,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listSuperAdminBuyerSubscriptions(req, res) {
  try {
    assertSuperAdmin(req);

    const { page, limit, skip } = paginationFromQuery(req.query);

    if (!hasModel("buyerSubscription")) {
      return res.json({
        success: true,
        subscriptions: [],
        total: 0,
        page,
        limit,
        source: "MODEL_UNAVAILABLE",
        mutableInApp: false,
        message: "Buyer subscription storage is not enabled yet.",
      });
    }

    const status = normalizeUpper(req.query?.status);
    const plan = normalizeUpper(req.query?.plan || req.query?.planCode);

    const where = {
      ...(status ? { status } : {}),
      ...(plan ? { plan } : {}),
    };

    const [total, records] = await Promise.all([
      prisma.buyerSubscription.count({ where }),
      prisma.buyerSubscription.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return res.json(
      makePagedResponse(
        "subscriptions",
        records.map(mapBuyerSubscriptionRow),
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSuperAdminBuyerSubscription(req, res) {
  try {
    assertSuperAdmin(req);

    if (!hasModel("buyerSubscription")) {
      throw serviceUnavailable("Buyer subscription storage is not enabled yet.");
    }

    const id = normalizeString(req.params?.id);
    if (!id) throw badRequest("Buyer subscription id is required.");

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : null;

    if (!body) throw badRequest("Request body must be a JSON object.");

    const update = {};

    if (body.planCode !== undefined || body.plan !== undefined) {
      update.plan = normalizeBuyerPlanCode(body.planCode ?? body.plan);
    }

    if (body.status !== undefined) {
      update.status = normalizeSubscriptionStatus(body.status);
    }

    if (body.cancelAtPeriodEnd !== undefined) {
      const normalized = normalizeBoolean(body.cancelAtPeriodEnd);
      if (typeof normalized !== "boolean") {
        throw badRequest("cancelAtPeriodEnd must be a boolean.");
      }
      update.cancelAtPeriodEnd = normalized;
    }

    for (const field of [
      "currentPeriodStart",
      "currentPeriodEnd",
      "startedAt",
      "canceledAt",
      "trialEndsAt",
    ]) {
      if (body[field] !== undefined) {
        update[field] = normalizeDateOrNull(body[field]);
      }
    }

    for (const field of [
      "stripeCustomerId",
      "stripeSubscriptionId",
      "stripePriceId",
      "stripeLatestInvoiceId",
      "stripeCheckoutSessionId",
    ]) {
      if (body[field] !== undefined) {
        update[field] = normalizeNullableString(body[field]);
      }
    }

    if (Object.keys(update).length === 0) {
      throw badRequest("No valid buyer subscription updates provided.");
    }

    const existing = await prisma.buyerSubscription.findUnique({ where: { id } });
    if (!existing) throw notFound("Buyer subscription not found.");

    const updated = await prisma.buyerSubscription.update({
      where: { id },
      data: update,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.json({
      success: true,
      subscription: mapBuyerSubscriptionRow(updated),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listSuperAdminSettlements(req, res) {
  try {
    assertSuperAdmin(req);

    const { page, limit, skip } = paginationFromQuery(req.query);
    const status = normalizeUpper(req.query?.status);

    const where = {
      ...(status ? { status } : {}),
    };

    const [total, settlements] = await Promise.all([
      prisma.settlement.count({ where }),
      prisma.settlement.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          winner: {
            select: { id: true, name: true, email: true },
          },
          auction: true,
        },
      }),
    ]);

    return res.json(
      makePagedResponse(
        "settlements",
        settlements.map(mapSettlementRow),
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSuperAdminSettlement(req, res) {
  try {
    assertSuperAdmin(req);

    const id = normalizeString(req.params?.id);
    if (!id) throw badRequest("Settlement id is required.");

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : null;

    if (!body) throw badRequest("Request body must be a JSON object.");

    const update = {};

    if (body.status !== undefined) {
      update.status = normalizeSettlementStatus(body.status);
    }

    if (body.currency !== undefined) {
      update.currency = normalizeUpper(body.currency, "USD");
    }

    if (body.finalAmountCents !== undefined) {
      const cents = Number(body.finalAmountCents);
      if (!Number.isFinite(cents) || cents < 0) {
        throw badRequest("finalAmountCents must be a non-negative number.");
      }
      update.finalPrice = cents / 100;
    }

    if (body.stripePaymentIntent !== undefined) {
      update.stripePaymentIntent = normalizeNullableString(body.stripePaymentIntent);
    }

    if (Object.keys(update).length === 0) {
      throw badRequest("No valid settlement updates provided.");
    }

    await requireSettlement(id);

    const updated = await prisma.settlement.update({
      where: { id },
      data: update,
      include: {
        winner: {
          select: { id: true, name: true, email: true },
        },
        auction: true,
      },
    });

    return res.json({
      success: true,
      settlement: mapSettlementRow(updated),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getSuperAdminRevenueSummary(req, res) {
  try {
    assertSuperAdmin(req);

    const [settlements, shops, buyerSubscriptions] = await Promise.all([
      prisma.settlement.findMany({
        select: { id: true, finalPrice: true, status: true, createdAt: true },
      }),
      prisma.pawnShop.findMany({
        where: { isDeleted: false },
        select: { id: true, subscriptionPlan: true, subscriptionStatus: true },
      }),
      hasModel("buyerSubscription")
        ? prisma.buyerSubscription.findMany({
            select: { id: true, plan: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const chargedSettlements = settlements.filter(
      (row) => normalizeUpper(row.status, "UNKNOWN") === "CHARGED"
    );

    const chargedGrossCents = chargedSettlements.reduce(
      (sum, row) => sum + toCents(row.finalPrice),
      0
    );

    const sellerPlanCatalog = mapSellerPlanCatalog();
    const buyerPlanCatalog = mapBuyerPlanCatalog();

    const projectedSellerMrrCents = shops.reduce((sum, shop) => {
      const plan = sellerPlanCatalog.find(
        (candidate) => candidate.code === normalizeUpper(shop.subscriptionPlan, "FREE")
      );
      return sum + Number(plan?.monthlyPriceCents || 0);
    }, 0);

    const projectedBuyerMrrCents = buyerSubscriptions.reduce((sum, subscription) => {
      const plan = buyerPlanCatalog.find(
        (candidate) => candidate.code === normalizeUpper(subscription.plan, "FREE")
      );
      return sum + Number(plan?.monthlyPriceCents || 0);
    }, 0);

    return res.json({
      success: true,
      revenue: {
        settlements: {
          totalCount: settlements.length,
          chargedCount: chargedSettlements.length,
          chargedGrossCents,
        },
        subscriptions: {
          projectedSellerMrrCents,
          projectedBuyerMrrCents,
          projectedTotalMrrCents: projectedSellerMrrCents + projectedBuyerMrrCents,
        },
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getSuperAdminPlatformSettings(req, res) {
  try {
    assertSuperAdmin(req);

    if (!hasModel("platformSetting")) {
      return res.json({
        success: true,
        settings: [],
        source: "MODEL_UNAVAILABLE",
        mutableInApp: false,
        message: "Platform settings storage is not enabled yet.",
      });
    }

    const settings = await prisma.platformSetting.findMany({
      orderBy: { key: "asc" },
    });

    return res.json({
      success: true,
      settings,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSuperAdminPlatformSettings(req, res) {
  try {
    assertSuperAdmin(req);

    if (!hasModel("platformSetting")) {
      throw serviceUnavailable("Platform settings storage is not enabled yet.");
    }

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : null;

    if (!body) throw badRequest("Request body must be a JSON object.");

    const key = normalizeString(body.key);
    if (!key) throw badRequest("Setting key is required.");

    const value = body.value === undefined ? null : JSON.stringify(body.value);
    const updatedByUserId = normalizeNullableString(
      req?.user?.sub || req?.user?.id || req?.user?.userId
    );

    const updated = await prisma.platformSetting.upsert({
      where: { key },
      update: {
        value,
        updatedByUserId: updatedByUserId || null,
      },
      create: {
        key,
        value,
        updatedByUserId: updatedByUserId || null,
      },
    });

    return res.json({
      success: true,
      setting: updated,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
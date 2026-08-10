// File: apps/api/backend/src/controllers/superAdmin.controller.js

import { prisma } from "../lib/prisma.js";
import {
  configurationPrefix,
  parseConfigurationValue,
  validatePlatformConfiguration,
} from "../services/platformConfiguration.service.js";
import {
  BUYER_PLAN_CODES,
  getBuyerPlanCatalog,
  getSellerPlanCatalog,
} from "../services/platformPricingCatalog.service.js";
import { getSellerPlanCodes } from "../config/sellerPlans.js";
import {
  executeBuyerSubscriptionLifecycle,
} from "../services/buyerSubscriptionLifecycle.service.js";
import {
  runGovernedCreateMutation,
  runGovernedShopMutation,
  runGovernedUserMutation,
} from "../services/superAdminAudit.service.js";
import {
  runSettlementTransition,
  settlementActorFromRequest,
} from "../services/settlementStateMachine.service.js";


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
  "DISPUTED",
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
  const allowedPlanCodes = BUYER_PLAN_CODES;

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
    subscriptionBillingInterval: normalizeUpper(shop.subscriptionBillingInterval, "MONTHLY"),
    subscriptionCurrentPeriodEnd: toIsoOrNull(shop.subscriptionCurrentPeriodEnd),
    cancelAtPeriodEnd: Boolean(shop.cancelAtPeriodEnd),
    stripeCustomerId: shop.stripeCustomerId || null,
    stripeSubscriptionId: shop.stripeSubscriptionId || null,
    billingMethodPresent: Boolean(shop.billingMethodPresent),
    billingMethodBrand: shop.billingMethodBrand || null,
    billingMethodLast4: shop.billingMethodLast4 || null,
    billingMethodExpMonth: shop.billingMethodExpMonth || null,
    billingMethodExpYear: shop.billingMethodExpYear || null,
    billingMethodStatus: shop.billingMethodStatus || "NOT_CONFIGURED",
    billingMethodSyncedAt: toIsoOrNull(shop.billingMethodSyncedAt),
    connectState: !shop.stripeConnectAccountId ? "NOT_STARTED" : shop.stripeConnectPayoutsEnabled ? "PAYOUTS_ENABLED" : shop.stripeConnectDetailsSubmitted ? "RESTRICTED" : "SETUP_INCOMPLETE",
    connectChargesEnabled: Boolean(shop.stripeConnectChargesEnabled),
    connectPayoutsEnabled: Boolean(shop.stripeConnectPayoutsEnabled),
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

async function mapSellerPlanCatalog() {
  return getSellerPlanCatalog();
}

async function mapBuyerPlanCatalog() {
  const plans = await getBuyerPlanCatalog();

  return plans.map((plan) => ({
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

    const sellerPlanCatalog = await mapSellerPlanCatalog();
    const buyerPlanCatalog = await mapBuyerPlanCatalog();

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

    if (update.isActive === false || update.role !== undefined) {
      update.authVersion = { increment: 1 };
    }

    const updated = await runGovernedUserMutation({
      req,
      targetUserId: userId,
      update,
      action: "UPDATE_USER_GOVERNANCE",
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

    const shop = await runGovernedCreateMutation({
      req,
      action: "CREATE_SHOP",
      targetType: "SHOP",
      create: (tx) => tx.pawnShop.create({
        data: {
          ownerId, name, address, phone, description, hours,
          subscriptionPlan, subscriptionStatus, isDeleted: false,
        },
        select: {
          id: true, name: true, address: true, phone: true,
          description: true, hours: true, ownerId: true,
          subscriptionPlan: true, subscriptionStatus: true,
          subscriptionCurrentPeriodEnd: true, cancelAtPeriodEnd: true,
          stripeCustomerId: true, stripeSubscriptionId: true,
          createdAt: true, updatedAt: true, isDeleted: true,
        },
      }),
      metadata: (created) => ({
        shopName: created.name,
        ownerId,
        ownerEmail: owner.email,
        subscriptionPlan,
        subscriptionStatus,
      }),
    });

    const shopRow = toSuperAdminShopRow(shop, owner);

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

    const updated = await runGovernedShopMutation({
      req,
      targetShopId: shopId,
      update: { ownerId },
      action: "REASSIGN_SHOP_OWNER",
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
      metadata: (saved) => ({
        shopName: saved.name,
        previousOwnerId: shop.ownerId,
        newOwnerId: ownerId,
        newOwnerEmail: owner.email,
      }),
    });

    const shopRow = toSuperAdminShopRow(updated, owner);

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




export async function restoreSuperAdminIntegration(req, res) {
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
      data: { status: "ACTIVE" },
    });

    if (typeof writeSuperAdminGovernanceAudit === "function") {
      await writeSuperAdminGovernanceAudit(req, {
        action: "RESTORE_INTEGRATION",
        targetType: "INTEGRATION",
        targetId: id,
        statusCode: 200,
        metadata: {
          previousStatus: existing.status || null,
          newStatus: "ACTIVE",
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
    return handleSuperAdminError(res, err, "Failed to restore integration.");
  }
}


async function safeSystemMetric(label, fn, fallback = null) {
  try {
    return {
      ok: true,
      label,
      value: await fn(),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      label,
      value: fallback,
      error: error?.message || String(error),
    };
  }
}

function safeBooleanEnv(key) {
  return Boolean(String(process.env[key] || "").trim());
}

function maskProviderConfigured(key) {
  const value = String(process.env[key] || "").trim();
  return {
    configured: Boolean(value),
    length: value.length,
  };
}

export async function getSuperAdminSystemHealth(req, res) {
  try {
    const now = new Date();

    const [
      databaseMetric,
      usersMetric,
      shopsMetric,
      itemsMetric,
      integrationsMetric,
      syncJobsMetric,
      failedSyncJobsMetric,
      failedAuditMetric,
      recentAuditMetric,
      settlementsMetric,
    ] = await Promise.all([
      safeSystemMetric("database", async () => {
        await prisma.$queryRaw`SELECT 1`;
        return {
          connected: true,
          provider: "postgresql",
        };
      }),

      safeSystemMetric("users", () => prisma.user.count(), 0),

      safeSystemMetric("shops", () => prisma.pawnShop.count(), 0),

      safeSystemMetric("items", () => prisma.item.count(), 0),

      safeSystemMetric("integrations", () => prisma.inventoryIntegration.count(), 0),

      safeSystemMetric("syncJobs", () => prisma.inventorySyncJob.count(), 0),

      safeSystemMetric(
        "failedSyncJobs",
        () =>
          prisma.inventorySyncJob.findMany({
            where: {
              status: {
                in: ["FAILED", "ERROR"],
              },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
        [],
      ),

      safeSystemMetric(
        "failedAuditRecords",
        () =>
          prisma.superAdminAuditLog.count({
            where: { success: false },
          }),
        0,
      ),

      safeSystemMetric(
        "recentAuditRecords",
        () =>
          prisma.superAdminAuditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              action: true,
              actorEmail: true,
              actorRole: true,
              targetType: true,
              targetId: true,
              success: true,
              statusCode: true,
              createdAt: true,
            },
          }),
        [],
      ),

      safeSystemMetric("settlements", () => prisma.settlement.count(), 0),
    ]);

    const env = {
      nodeEnv: process.env.NODE_ENV || "development",
      port: process.env.PORT || null,
      appVersion: process.env.APP_VERSION || process.env.npm_package_version || null,
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        memory: process.memoryUsage(),
      },
    };

    const providers = {
      stripe: {
        secretKey: maskProviderConfigured("STRIPE_SECRET_KEY"),
        webhookSecretConfigured:
          safeBooleanEnv("STRIPE_WEBHOOK_SECRET") ||
          safeBooleanEnv("STRIPE_WEBHOOK_SIGNING_SECRET"),
      },
      openai: {
        apiKey: maskProviderConfigured("OPENAI_API_KEY"),
        listingModel: process.env.OPENAI_LISTING_MODEL || null,
        listingAssistantEnabled:
          String(process.env.AI_LISTING_ASSISTANT_ENABLED || "").toLowerCase() === "true",
      },
      redis: {
        urlConfigured: safeBooleanEnv("REDIS_URL"),
      },
    };

    const checks = {
      api: {
        ok: true,
        service: "pawnshop-api",
        timestamp: now.toISOString(),
      },
      database: databaseMetric,
      users: usersMetric,
      shops: shopsMetric,
      items: itemsMetric,
      integrations: integrationsMetric,
      syncJobs: syncJobsMetric,
      settlements: settlementsMetric,
      failedAuditRecords: failedAuditMetric,
    };

    const warnings = [];

    if (!databaseMetric.ok) warnings.push("Database health check failed.");
    if (!providers.stripe.secretKey.configured) warnings.push("Stripe secret key is not configured.");
    if (!providers.stripe.webhookSecretConfigured) warnings.push("Stripe webhook secret is not configured.");
    if (!providers.openai.apiKey.configured) warnings.push("OpenAI API key is not configured.");
    if (Array.isArray(failedSyncJobsMetric.value) && failedSyncJobsMetric.value.length > 0) {
      warnings.push(`${failedSyncJobsMetric.value.length} recent integration sync failures found.`);
    }
    if (Number(failedAuditMetric.value || 0) > 0) {
      warnings.push(`${failedAuditMetric.value} failed Super Admin audit records exist.`);
    }

    return res.json({
      success: true,
      ok: databaseMetric.ok,
      env,
      providers,
      checks,
      recent: {
        failedSyncJobs: failedSyncJobsMetric.value || [],
        auditRecords: recentAuditMetric.value || [],
      },
      warnings,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    return handleSuperAdminError(res, err, "Failed to load system health.");
  }
}


export async function listSuperAdminShops(req, res) {
  try {
    assertSuperAdmin(req);

    const { page, limit, skip } = paginationFromQuery(req.query);
    const deleted = normalizeBoolean(req.query?.isDeleted);
    const plan = normalizeUpper(req.query?.subscriptionPlan);
    const status = normalizeUpper(req.query?.subscriptionStatus);
    const search = normalizeString(req.query?.q);

    if (req.query?.isDeleted !== undefined && typeof deleted !== "boolean") {
      throw badRequest("isDeleted must be a boolean.");
    }
    if (plan) normalizeSellerPlanCode(plan);
    if (status) normalizeSubscriptionStatus(status);

    const searchFilter = search
      ? {
          OR: [
            ...["id", "name", "address", "phone"].map((field) => ({
              [field]: { contains: search, mode: "insensitive" },
            })),
            { owner: { is: { name: { contains: search, mode: "insensitive" } } } },
            { owner: { is: { email: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : undefined;

    const where = {
      ...(typeof deleted === "boolean" ? { isDeleted: deleted } : {}),
      ...(plan ? { subscriptionPlan: plan } : {}),
      ...(status ? { subscriptionStatus: status } : {}),
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

    const billingFields = ["subscriptionPlan", "subscriptionStatus", "subscriptionCurrentPeriodEnd", "cancelAtPeriodEnd"];
    const profileFields = ["name", "address", "phone", "description", "hours"];
    const billingOverrideRequested = billingFields.some((key) => body[key] !== undefined);
    const reason = normalizeString(body.reason);
    if (billingOverrideRequested && !reason) throw badRequest("A reason is required for billing overrides.");

    const update = {};

    for (const field of profileFields) {
      if (body[field] === undefined) continue;
      const value = normalizeNullableString(body[field]);
      if (field === "name" && !value) throw badRequest("Shop name is required.");
      update[field] = value;
    }

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

    const existing = await prisma.pawnShop.findUnique({
      where: { id: shopId },
      select: {
        id: true, name: true, address: true, phone: true, description: true,
        hours: true, isDeleted: true, subscriptionPlan: true,
        subscriptionStatus: true, subscriptionCurrentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });
    if (!existing) throw notFound("Shop not found.");

    const changedFields = Object.keys(update).filter((field) => {
      const before = existing[field];
      const after = update[field];
      if (before instanceof Date || after instanceof Date) {
        return toIsoOrNull(before) !== toIsoOrNull(after);
      }
      return before !== after;
    });
    if (changedFields.length === 0) throw badRequest("Shop update does not change any values.");

    const hasProfile = changedFields.some((field) => profileFields.includes(field));
    const hasBilling = changedFields.some((field) => billingFields.includes(field));
    const hasAccess = changedFields.includes("isDeleted");
    const changeType = [hasProfile, hasBilling, hasAccess].filter(Boolean).length > 1
      ? "MIXED"
      : hasBilling
        ? "BILLING_OVERRIDE"
        : hasAccess
          ? update.isDeleted ? "ACCESS_DISABLE" : "ACCESS_RESTORE"
          : "PROFILE";
    const auditValue = (value) => value instanceof Date ? value.toISOString() : value ?? null;

    const updated = await runGovernedShopMutation({
      req,
      targetShopId: shopId,
      update,
      action: "UPDATE_SHOP_GOVERNANCE",
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
      metadata: (saved) => ({
        shopId,
        shopName: saved.name,
        changeType,
        changedFields,
        ...(hasBilling ? { reason } : {}),
        before: Object.fromEntries(changedFields.map((field) => [field, auditValue(existing[field])])),
        after: Object.fromEntries(changedFields.map((field) => [field, auditValue(saved[field])])),
      }),
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
    const [catalog, shops, rules] = await Promise.all([
      mapSellerPlanCatalog(),
      prisma.pawnShop.findMany({ where: { isDeleted: false }, select: { subscriptionPlan: true, subscriptionStatus: true, subscriptionBillingInterval: true } }),
      prisma.platformPricingRule.findMany({ where: { category: "SUBSCRIPTIONS", appliesTo: "SELLER" }, orderBy: { updatedAt: "desc" } }),
    ]);
    const plans = catalog.map((plan) => {
      const assigned = shops.filter((shop) => normalizeUpper(shop.subscriptionPlan, "FREE") === plan.code);
      const planRules = rules.filter((rule) => rule.key.startsWith(`seller_plan_${plan.code.toLowerCase()}_`));
      const latest = planRules[0] || null;
      const monthlyRule = planRules.find((rule) => rule.key.endsWith("_monthly"));
      const yearlyRule = planRules.find((rule) => rule.key.endsWith("_yearly"));
      const limitsRule = planRules.find((rule) => rule.key.endsWith("_limits"));
      const active = assigned.filter((shop) => ["ACTIVE", "TRIALING"].includes(normalizeUpper(shop.subscriptionStatus)));
      const mrrCents = active.reduce((sum, shop) => sum + (normalizeUpper(shop.subscriptionBillingInterval) === "YEAR" ? Math.round(Number(plan.yearlyPriceCents || 0) / 12) : Number(plan.monthlyPriceCents || 0)), 0);
      return {
        ...plan,
        stripeProductId: limitsRule?.metadata?.stripeProductId || null,
        trialEligible: limitsRule?.metadata?.trialEligible ?? true,
        trialDays: Number(limitsRule?.metadata?.trialDays ?? 60),
        supportLevel: limitsRule?.metadata?.supportLevel || (plan.code === "ULTRA" ? "DEDICATED" : "STANDARD"),
        status: limitsRule?.status || "ACTIVE",
        subscribedShops: assigned.length,
        mrrCents,
        updatedAt: latest?.updatedAt?.toISOString?.() || null,
        updatedByUserId: latest?.updatedByUserId || null,
        version: latest?.updatedAt?.toISOString?.() || "CONFIG",
        stripeSyncStatus: plan.isFree ? "NOT_REQUIRED" : monthlyRule?.stripePriceId && yearlyRule?.stripePriceId ? "CONFIGURED" : "MISSING_REFERENCES",
      };
    });
    return res.json({
      success: true,
      plans,
      source: "CONFIG_WITH_DATABASE_OVERRIDES",
      mutableInApp: true,
      lastSynchronizedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

function sellerPlanInteger(value, label, nullable = false) {
  if (nullable && (value === null || value === "")) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw badRequest(`${label} must be a non-negative integer.`);
  return parsed;
}

function validateStripeReference(value, prefix, label) {
  const normalized = normalizeString(value);
  if (normalized && !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(normalized)) throw badRequest(`${label} must be a valid ${prefix}_ reference.`);
  return normalized || null;
}

export async function previewSuperAdminSellerPlanImpact(req, res) {
  try {
    assertSuperAdmin(req);
    const code = getSellerPlanCodes().includes(normalizeUpper(req.params?.code)) ? normalizeUpper(req.params.code) : null;
    if (!code) throw badRequest("Unsupported seller plan.");
    const catalog = await mapSellerPlanCatalog();
    const current = catalog.find((plan) => plan.code === code);
    const shops = await prisma.pawnShop.findMany({ where: { isDeleted: false, subscriptionPlan: code }, select: { id: true, subscriptionStatus: true, subscriptionBillingInterval: true } });
    const nextMonthly = sellerPlanInteger(req.body?.monthlyPriceCents ?? current.monthlyPriceCents, "Monthly price");
    const nextYearly = sellerPlanInteger(req.body?.yearlyPriceCents ?? current.yearlyPriceCents, "Yearly price");
    const currentMrrCents = shops.filter((shop) => ["ACTIVE", "TRIALING"].includes(normalizeUpper(shop.subscriptionStatus))).reduce((sum, shop) => sum + (normalizeUpper(shop.subscriptionBillingInterval) === "YEAR" ? Math.round(current.yearlyPriceCents / 12) : current.monthlyPriceCents), 0);
    const projectedMrrCents = shops.filter((shop) => ["ACTIVE", "TRIALING"].includes(normalizeUpper(shop.subscriptionStatus))).reduce((sum, shop) => sum + (normalizeUpper(shop.subscriptionBillingInterval) === "YEAR" ? Math.round(nextYearly / 12) : nextMonthly), 0);
    return res.json({ success: true, impact: { affectedShops: shops.length, affectedSubscriptions: shops.filter((shop) => shop.subscriptionStatus !== "CANCELED").length, currentMrrCents, projectedMrrCents, mrrDeltaCents: projectedMrrCents - currentMrrCents, requiresGrandfathering: shops.length > 0 } });
  } catch (error) { return sendError(res, error); }
}

export async function updateSuperAdminSellerPlan(req, res) {
  try {
    assertSuperAdmin(req);
    const code = getSellerPlanCodes().includes(normalizeUpper(req.params?.code)) ? normalizeUpper(req.params.code) : null;
    if (!code) throw badRequest("Unsupported seller plan.");
    const body = req.body || {};
    const catalog = await mapSellerPlanCatalog();
    const current = catalog.find((plan) => plan.code === code);
    const assignedShops = await prisma.pawnShop.count({ where: { isDeleted: false, subscriptionPlan: code } });
    const status = normalizeUpper(body.status, "ACTIVE");
    if (!["DRAFT", "ACTIVE", "DISABLED", "ARCHIVED"].includes(status)) throw badRequest("Plan status is invalid.");
    if (["DISABLED", "ARCHIVED"].includes(status) && assignedShops > 0 && body.grandfatherExisting !== true && !body.scheduledMigrationAt) throw badRequest("Assigned plans require grandfathering or a scheduled migration before deactivation.");
    if (body.scheduledMigrationAt && Number.isNaN(new Date(body.scheduledMigrationAt).getTime())) throw badRequest("Scheduled migration date is invalid.");
    if (body.scheduledMigrationAt && new Date(body.scheduledMigrationAt).getTime() <= Date.now()) throw badRequest("Scheduled migration date must be in the future.");
    const monthlyPriceCents = sellerPlanInteger(body.monthlyPriceCents ?? current.monthlyPriceCents, "Monthly price");
    const yearlyPriceCents = sellerPlanInteger(body.yearlyPriceCents ?? current.yearlyPriceCents, "Yearly price");
    const maxActiveListings = sellerPlanInteger(body.maxActiveListings ?? current.maxActiveListings, "Active-listing limit", true);
    const trialMaxActiveListings = sellerPlanInteger(body.trialMaxActiveListings ?? current.trialMaxActiveListings, "Trial listing limit", true);
    const commissionBps = sellerPlanInteger(body.commissionBps ?? current.commissionBps, "Commission basis points");
    if (commissionBps > 10000) throw badRequest("Commission basis points cannot exceed 10000.");
    const trialDays = sellerPlanInteger(body.trialDays ?? 60, "Trial duration");
    const prefix = `seller_plan_${code.toLowerCase()}`;
    const existingRules = await prisma.platformPricingRule.findMany({ where: { key: { startsWith: `${prefix}_` } }, orderBy: { updatedAt: "desc" } });
    const existingLimitsRule = existingRules.find((rule) => rule.key.endsWith("_limits"));
    const existingMetadata = existingLimitsRule?.metadata && typeof existingLimitsRule.metadata === "object" ? existingLimitsRule.metadata : {};
    const stripeProductId = validateStripeReference(body.stripeProductId === undefined ? existingMetadata.stripeProductId : body.stripeProductId, "prod", "Stripe product ID");
    const stripeMonthlyPriceId = validateStripeReference(body.stripeMonthlyPriceId === undefined ? current.stripeMonthlyPriceId : body.stripeMonthlyPriceId, "price", "Monthly Stripe price ID");
    const stripeYearlyPriceId = validateStripeReference(body.stripeYearlyPriceId === undefined ? current.stripeYearlyPriceId : body.stripeYearlyPriceId, "price", "Yearly Stripe price ID");
    if (code !== "FREE" && status === "ACTIVE" && (!stripeMonthlyPriceId || !stripeYearlyPriceId)) throw badRequest("Active paid seller plans require monthly and yearly Stripe Price IDs.");
    const currentVersion = existingRules[0]?.updatedAt?.toISOString?.() || "CONFIG";
    if (normalizeString(body.expectedVersion) !== currentVersion) throw createHttpError("This plan changed since it was loaded. Refresh and try again.", 409);
    const actorId = req.user?.sub || req.user?.id || null;
    const metadata = { label: normalizeString(body.label, current.label), description: normalizeString(body.description), maxActiveListings, trialMaxActiveListings, maxLocations: sellerPlanInteger(body.maxLocations ?? current.maxLocations, "Location limit", true), maxStaffUsers: sellerPlanInteger(body.maxStaffUsers ?? current.maxStaffUsers, "Staff-seat limit", true), canCreateAuctions: Boolean(body.canCreateAuctions), canFeatureListings: Boolean(body.canFeatureListings), analyticsLevel: normalizeString(body.analyticsLevel, current.analyticsLevel), supportLevel: normalizeString(body.supportLevel, "STANDARD"), trialEligible: body.trialEligible !== false, trialDays, features: Array.isArray(body.features) ? body.features.map(String) : current.features, stripeProductId, grandfatherExisting: body.grandfatherExisting === true, scheduledMigrationAt: body.scheduledMigrationAt || null };
    await prisma.$transaction(async (tx) => {
      const base = { category: "SUBSCRIPTIONS", appliesTo: "SELLER", currency: "USD", status, updatedByUserId: actorId };
      await tx.platformPricingRule.upsert({ where: { key: `${prefix}_monthly` }, update: { ...base, label: `${metadata.label} monthly`, feeType: "FIXED_CENTS", amountCents: monthlyPriceCents, stripePriceId: stripeMonthlyPriceId }, create: { ...base, key: `${prefix}_monthly`, label: `${metadata.label} monthly`, feeType: "FIXED_CENTS", amountCents: monthlyPriceCents, stripePriceId: stripeMonthlyPriceId, createdByUserId: actorId } });
      await tx.platformPricingRule.upsert({ where: { key: `${prefix}_yearly` }, update: { ...base, label: `${metadata.label} yearly`, feeType: "FIXED_CENTS", amountCents: yearlyPriceCents, stripePriceId: stripeYearlyPriceId }, create: { ...base, key: `${prefix}_yearly`, label: `${metadata.label} yearly`, feeType: "FIXED_CENTS", amountCents: yearlyPriceCents, stripePriceId: stripeYearlyPriceId, createdByUserId: actorId } });
      await tx.platformPricingRule.upsert({ where: { key: `${prefix}_commission_bps` }, update: { ...base, label: `${metadata.label} commission`, feeType: "PERCENT_BPS", percentBps: commissionBps }, create: { ...base, key: `${prefix}_commission_bps`, label: `${metadata.label} commission`, feeType: "PERCENT_BPS", percentBps: commissionBps, createdByUserId: actorId } });
      await tx.platformPricingRule.upsert({ where: { key: `${prefix}_limits` }, update: { ...base, label: `${metadata.label} limits`, feeType: "FIXED_CENTS", amountCents: 0, metadata }, create: { ...base, key: `${prefix}_limits`, label: `${metadata.label} limits`, feeType: "FIXED_CENTS", amountCents: 0, metadata, createdByUserId: actorId } });
      await tx.superAdminAuditLog.create({ data: platformConfigurationAuditData(req, "UPDATE_SELLER_PLAN", "seller-plans", code, { code, assignedShops, monthlyPriceCents, yearlyPriceCents, commissionBps, status, stripeReferencesConfigured: code === "FREE" || Boolean(stripeMonthlyPriceId && stripeYearlyPriceId), grandfatherExisting: metadata.grandfatherExisting, scheduledMigrationAt: metadata.scheduledMigrationAt }) });
    });
    return getSuperAdminSellerPlans(req, res);
  } catch (error) { return sendError(res, error); }
}

export async function getSuperAdminBuyerPlans(req, res) {
  try {
    assertSuperAdmin(req);

    return res.json({
      success: true,
      plans: await mapBuyerPlanCatalog(),
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

export async function applySuperAdminBuyerSubscriptionLifecycle(
  req,
  res,
) {
  try {
    assertSuperAdmin(req);

    const result =
      await executeBuyerSubscriptionLifecycle({
        subscriptionId: req.params?.id,
        input: req.body,
      });

    return res.json({
      success: true,
      action: result.action,
      stripeApplied: result.stripeApplied,
      subscription: mapBuyerSubscriptionRow(
        result.subscription,
      ),
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

    if (body.status === undefined) {
      throw badRequest("No valid settlement updates provided.");
    }
    if (body.currency !== undefined || body.finalAmountCents !== undefined || body.stripePaymentIntent !== undefined) {
      throw badRequest("Settlement financial fields are immutable after creation.");
    }
    const targetStatus = normalizeSettlementStatus(body.status);
    if (targetStatus !== "CANCELED") {
      throw badRequest("Only cancellation is available as a manual settlement transition.");
    }
    await runSettlementTransition({
      settlementId: id,
      toStatus: targetStatus,
      expectedStatus: body.expectedStatus,
      action: "SUPER_ADMIN_SETTLEMENT_TRANSITION",
      actor: settlementActorFromRequest(req),
      validateCurrent: (current) => {
        if (current.stripePaymentIntent) {
          throw badRequest("A settlement with a PaymentIntent cannot be canceled manually.");
        }
      },
    });
    const updated = await prisma.settlement.findUnique({
      where: { id },
      include: { winner: { select: { id: true, name: true, email: true } }, auction: true },
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

    const sellerPlanCatalog = await mapSellerPlanCatalog();
    const buyerPlanCatalog = await mapBuyerPlanCatalog();

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

    const expectedUpdatedAt = normalizeString(body.expectedUpdatedAt);
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.platformSetting.findUnique({ where: { key } });
      let saved;
      if (existing) {
        const changed = await tx.platformSetting.updateMany({
          where: { key, updatedAt: expectedUpdatedAt ? new Date(expectedUpdatedAt) : existing.updatedAt },
          data: { value, updatedByUserId: updatedByUserId || null },
        });
        if (changed.count !== 1) throw createHttpError("This setting changed since it was loaded. Refresh and try again.", 409);
        saved = await tx.platformSetting.findUnique({ where: { key } });
      } else {
        saved = await tx.platformSetting.create({ data: { key, value, updatedByUserId: updatedByUserId || null } });
      }
      await tx.superAdminAuditLog.create({ data: platformConfigurationAuditData(req, existing ? "UPDATE_PLATFORM_SETTING" : "CREATE_PLATFORM_SETTING", "settings", saved.id, { key }) });
      return saved;
    });

    return res.json({
      success: true,
      setting: updated,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

function platformConfigurationAuditData(req, action, area, targetId, metadata) {
  return {
    actorId: req.user?.sub || req.user?.id || null,
    actorEmail: req.user?.email || null,
    actorRole: req.user?.role || null,
    action,
    method: req.method,
    path: req.originalUrl || req.path,
    routeKey: `super-admin.platform-settings.${area}`,
    targetType: "PLATFORM_SETTING",
    targetId,
    statusCode: 200,
    success: true,
    requestId: req.id || req.requestId || null,
    ipAddress: req.ip || null,
    userAgent: req.get?.("user-agent") || null,
    metadata,
  };
}

export async function listPlatformConfigurations(req, res) {
  try {
    assertSuperAdmin(req);
    const area = String(req.params?.area || "");
    const prefix = configurationPrefix(area);
    const rows = await prisma.platformSetting.findMany({
      where: { key: { startsWith: prefix } },
      orderBy: { createdAt: "asc" },
    });
    return res.json({ success: true, rows: rows.map(parseConfigurationValue).filter(Boolean) });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createPlatformConfiguration(req, res) {
  try {
    assertSuperAdmin(req);
    const area = String(req.params?.area || "");
    const prefix = configurationPrefix(area);
    const configuration = validatePlatformConfiguration(area, req.body);
    const storageKey = `${prefix}${configuration.key}`;
    const actorId = req.user?.sub || req.user?.id || null;
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.platformSetting.create({ data: { key: storageKey, value: JSON.stringify(configuration), updatedByUserId: actorId } });
      await tx.superAdminAuditLog.create({ data: platformConfigurationAuditData(req, "CREATE_PLATFORM_CONFIGURATION", area, created.id, { key: configuration.key, area }) });
      return created;
    });
    return res.status(201).json({ success: true, row: parseConfigurationValue(row) });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updatePlatformConfiguration(req, res) {
  try {
    assertSuperAdmin(req);
    const area = String(req.params?.area || "");
    const prefix = configurationPrefix(area);
    const id = normalizeString(req.params?.id);
    const expectedUpdatedAt = normalizeString(req.body?.expectedUpdatedAt);
    if (!expectedUpdatedAt) throw badRequest("expectedUpdatedAt is required to prevent concurrent overwrites.");
    const actorId = req.user?.sub || req.user?.id || null;
    const row = await prisma.$transaction(async (tx) => {
      const existingRow = await tx.platformSetting.findFirst({ where: { id, key: { startsWith: prefix } } });
      if (!existingRow) throw notFound("Platform configuration not found.");
      const existing = parseConfigurationValue(existingRow);
      const configuration = validatePlatformConfiguration(area, req.body, existing);
      const nextStorageKey = `${prefix}${configuration.key}`;
      const updated = await tx.platformSetting.updateMany({
        where: { id, updatedAt: new Date(expectedUpdatedAt) },
        data: { key: nextStorageKey, value: JSON.stringify(configuration), updatedByUserId: actorId },
      });
      if (updated.count !== 1) {
        const conflict = new Error("This configuration changed since it was loaded. Refresh and try again.");
        conflict.status = 409;
        throw conflict;
      }
      const saved = await tx.platformSetting.findUnique({ where: { id } });
      await tx.superAdminAuditLog.create({ data: platformConfigurationAuditData(req, "UPDATE_PLATFORM_CONFIGURATION", area, id, { key: configuration.key, area, enabled: configuration.enabled, archived: configuration.archived }) });
      return saved;
    });
    return res.json({ success: true, row: parseConfigurationValue(row) });
  } catch (error) {
    return sendError(res, error);
  }
}
function normalizePricingRuleId(value) {
  return String(value ?? "").trim();
}

function normalizePricingRuleStatus(value) {
  const status = normalizeUpper(value, "DRAFT");
  return ["ACTIVE", "DRAFT", "DISABLED", "ARCHIVED"].includes(status)
    ? status
    : "DRAFT";
}

function normalizePricingRuleFeeType(value) {
  const feeType = normalizeUpper(value, "FIXED_CENTS");
  return ["FIXED_CENTS", "PERCENT_BPS", "HYBRID"].includes(feeType)
    ? feeType
    : "FIXED_CENTS";
}

function normalizePricingRuleText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizePricingRuleInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizePricingRuleDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapPlatformPricingRule(row) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description || "",
    category: row.category,
    appliesTo: row.appliesTo,
    feeType: row.feeType,
    amountCents: row.amountCents,
    percentBps: row.percentBps,
    minCents: row.minCents,
    maxCents: row.maxCents,
    currency: row.currency || "USD",
    status: row.status || "DRAFT",
    stripePriceId: row.stripePriceId || null,
    effectiveStartAt: toIsoOrNull(row.effectiveStartAt),
    effectiveEndAt: toIsoOrNull(row.effectiveEndAt),
    metadata: row.metadata || null,
    createdByUserId: row.createdByUserId || null,
    updatedByUserId: row.updatedByUserId || null,
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  };
}

function buildPricingRuleData(body, actorId, existing = null) {
  const key = normalizePricingRuleText(body.key, existing?.key || "");
  const label = normalizePricingRuleText(body.label, existing?.label || "");
  const category = normalizeUpper(body.category, existing?.category || "PLATFORM_FEES");
  const appliesTo = normalizeUpper(body.appliesTo, existing?.appliesTo || "PLATFORM");
  const feeType = normalizePricingRuleFeeType(body.feeType ?? existing?.feeType);
  const status = normalizePricingRuleStatus(body.status ?? existing?.status);

  if (!key) throw badRequest("Pricing rule key is required.");
  if (!label) throw badRequest("Pricing rule label is required.");

  const amountCents = normalizePricingRuleInt(
    body.amountCents !== undefined ? body.amountCents : existing?.amountCents,
  );
  const percentBps = normalizePricingRuleInt(
    body.percentBps !== undefined ? body.percentBps : existing?.percentBps,
  );

  if (feeType === "FIXED_CENTS" && amountCents === null) {
    throw badRequest("amountCents is required for fixed fee rules.");
  }

  if (feeType === "PERCENT_BPS" && percentBps === null) {
    throw badRequest("percentBps is required for percentage fee rules.");
  }

  if (feeType === "HYBRID" && (amountCents === null || percentBps === null)) {
    throw badRequest("amountCents and percentBps are required for hybrid fee rules.");
  }
  if (amountCents !== null && amountCents < 0) throw badRequest("amountCents cannot be negative.");
  if (percentBps !== null && (percentBps < 0 || percentBps > 10000)) throw badRequest("percentBps must be between 0 and 10000.");

  const minCents = normalizePricingRuleInt(body.minCents !== undefined ? body.minCents : existing?.minCents);
  const maxCents = normalizePricingRuleInt(body.maxCents !== undefined ? body.maxCents : existing?.maxCents);
  if (minCents !== null && minCents < 0) throw badRequest("minCents cannot be negative.");
  if (maxCents !== null && maxCents < 0) throw badRequest("maxCents cannot be negative.");
  if (minCents !== null && maxCents !== null && minCents > maxCents) throw badRequest("Minimum fee cannot exceed maximum fee.");

  const effectiveStartAt = body.effectiveStartAt !== undefined ? normalizePricingRuleDate(body.effectiveStartAt) : existing?.effectiveStartAt || null;
  const effectiveEndAt = body.effectiveEndAt !== undefined ? normalizePricingRuleDate(body.effectiveEndAt) : existing?.effectiveEndAt || null;
  if (body.effectiveStartAt && !effectiveStartAt) throw badRequest("Effective start date is invalid.");
  if (body.effectiveEndAt && !effectiveEndAt) throw badRequest("Effective end date is invalid.");
  if (effectiveStartAt && effectiveEndAt && effectiveStartAt >= effectiveEndAt) throw badRequest("Effective end must be after effective start.");

  return {
    key,
    label,
    description:
      body.description !== undefined
        ? normalizePricingRuleText(body.description)
        : existing?.description || null,
    category,
    appliesTo,
    feeType,
    amountCents,
    percentBps,
    minCents,
    maxCents,
    currency: normalizeUpper(body.currency, existing?.currency || "USD"),
    status,
    stripePriceId:
      body.stripePriceId !== undefined
        ? normalizePricingRuleText(body.stripePriceId) || null
        : existing?.stripePriceId || null,
    effectiveStartAt,
    effectiveEndAt,
    metadata:
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : existing?.metadata || null,
    updatedByUserId: actorId || null,
  };
}

async function assertNoActivePricingRuleOverlap(data, excludeId = null) {
  if (data.status !== "ACTIVE") return;
  const candidates = await prisma.platformPricingRule.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      category: data.category,
      appliesTo: data.appliesTo,
      status: "ACTIVE",
    },
  });
  const plan = String(data.metadata?.sellerPlan || "ALL").toUpperCase();
  const priority = Number(data.metadata?.priority || 0);
  const start = data.effectiveStartAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const end = data.effectiveEndAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const overlaps = candidates.some((candidate) => {
    const candidatePlan = String(candidate.metadata?.sellerPlan || "ALL").toUpperCase();
    const candidatePriority = Number(candidate.metadata?.priority || 0);
    const candidateStart = candidate.effectiveStartAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const candidateEnd = candidate.effectiveEndAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return candidatePlan === plan && candidatePriority === priority && start < candidateEnd && candidateStart < end;
  });
  if (overlaps) throw badRequest("An active rule with the same scope, seller plan, priority, and overlapping effective dates already exists.");
}

async function writePricingRuleAudit(req, action, targetId, metadata = {}) {
  try {
    await prisma.superAdminAuditLog.create({
      data: {
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        actorRole: req.user?.role || null,
        action,
        method: req.method,
        path: req.originalUrl || req.path,
        routeKey: "super-admin.pricing-rules",
        targetType: "PLATFORM_PRICING_RULE",
        targetId,
        statusCode: 200,
        success: true,
        requestId: req.id || req.requestId || null,
        ipAddress: req.ip || null,
        userAgent: req.get?.("user-agent") || null,
        metadata,
      },
    });
  } catch (auditError) {
    console.warn("[super-admin:pricing-rule-audit] Failed to write audit log", {
      error: auditError?.message || auditError,
    });
  }
}

export async function listSuperAdminPricingRules(req, res) {
  try {
    assertSuperAdmin(req);

    const rows = await prisma.platformPricingRule.findMany({
      orderBy: [{ category: "asc" }, { label: "asc" }],
    });

    return res.json({
      success: true,
      pricingRules: rows.map(mapPlatformPricingRule),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createSuperAdminPricingRule(req, res) {
  try {
    assertSuperAdmin(req);

    const data = buildPricingRuleData(req.body || {}, req.user?.id, null);
    await assertNoActivePricingRuleOverlap(data);

    const row = await prisma.platformPricingRule.create({
      data: {
        ...data,
        createdByUserId: req.user?.id || null,
      },
    });

    await writePricingRuleAudit(req, "CREATE_PLATFORM_PRICING_RULE", row.id, {
      key: row.key,
      category: row.category,
      appliesTo: row.appliesTo,
      feeType: row.feeType,
      status: row.status,
    });

    return res.status(201).json({
      success: true,
      pricingRule: mapPlatformPricingRule(row),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSuperAdminPricingRule(req, res) {
  try {
    assertSuperAdmin(req);

    const id = normalizePricingRuleId(req.params?.id);
    if (!id) throw badRequest("Pricing rule id is required.");

    const existing = await prisma.platformPricingRule.findUnique({ where: { id } });
    if (!existing) throw notFound("Pricing rule not found.");

    const data = buildPricingRuleData(req.body || {}, req.user?.id, existing);
    await assertNoActivePricingRuleOverlap(data, id);
    const expectedUpdatedAt = normalizeString(req.body?.expectedUpdatedAt);
    if (!expectedUpdatedAt) throw badRequest("expectedUpdatedAt is required to prevent concurrent overwrites.");
    const changed = await prisma.platformPricingRule.updateMany({ where: { id, updatedAt: new Date(expectedUpdatedAt) }, data });
    if (changed.count !== 1) {
      const conflict = createHttpError("This pricing rule changed since it was loaded. Refresh and try again.", 409);
      throw conflict;
    }
    const row = await prisma.platformPricingRule.findUnique({ where: { id } });

    await writePricingRuleAudit(req, "UPDATE_PLATFORM_PRICING_RULE", row.id, {
      key: row.key,
      category: row.category,
      appliesTo: row.appliesTo,
      feeType: row.feeType,
      status: row.status,
    });

    return res.json({
      success: true,
      pricingRule: mapPlatformPricingRule(row),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

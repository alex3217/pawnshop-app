import { prisma } from "../lib/prisma.js";

const BUYER_PLAN_CODES = ["FREE", "PLUS", "PREMIUM", "ULTRA"];
const BUYER_SUBSCRIPTION_STATUSES = [
  "UNKNOWN",
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "CANCELED",
  "PAUSED",
];

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

function badRequest(message, details = undefined) {
  const error = new Error(message);
  error.statusCode = 400;
  if (details) error.details = details;
  return error;
}

function forbidden(message = "Forbidden") {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

function normalizePlanCode(value, fallback = "FREE") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeStatus(value, fallback = "ACTIVE") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertValidPlanCode(planCode) {
  if (!BUYER_PLAN_CODES.includes(planCode)) {
    throw badRequest("Invalid buyer plan code.", {
      allowedPlanCodes: BUYER_PLAN_CODES,
    });
  }
}

function assertValidStatus(status) {
  if (!BUYER_SUBSCRIPTION_STATUSES.includes(status)) {
    throw badRequest("Invalid buyer subscription status.", {
      allowedStatuses: BUYER_SUBSCRIPTION_STATUSES,
    });
  }
}

function toResponse(record) {
  if (!record) return null;

  return {
    id: record.id,
    userId: record.userId,
    planCode: normalizePlanCode(record.planCode || record.plan || "FREE"),
    status: normalizeStatus(record.status || "ACTIVE"),
    cancelAtPeriodEnd: !!record.cancelAtPeriodEnd,
    currentPeriodEnd: record.currentPeriodEnd || null,
    stripeCustomerId: record.stripeCustomerId || null,
    stripeSubscriptionId: record.stripeSubscriptionId || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
  };
}

async function buyerSubscriptionModelAvailable() {
  return !!prisma?.buyerSubscription;
}

async function requireBuyerSubscriptionModel() {
  if (!(await buyerSubscriptionModelAvailable())) {
    const error = new Error(
      "Buyer subscription model is not available in the current Prisma client.",
    );
    error.statusCode = 501;
    throw error;
  }
}

export async function listAvailableBuyerPlans(_req, res) {
  try {
    return res.json({
      success: true,
      plans: [
        {
          code: "FREE",
          label: "Free",
          monthlyPriceCents: 0,
          features: ["Browse marketplace", "Watchlist", "Saved searches"],
        },
        {
          code: "PLUS",
          label: "Plus",
          monthlyPriceCents: 999,
          features: [
            "Everything in Free",
            "Priority alerts",
            "Enhanced saved searches",
          ],
        },
        {
          code: "PREMIUM",
          label: "Premium",
          monthlyPriceCents: 1999,
          features: [
            "Everything in Plus",
            "Advanced notifications",
            "Priority support",
          ],
        },
        {
          code: "ULTRA",
          label: "Ultra",
          monthlyPriceCents: 2999,
          features: [
            "Everything in Premium",
            "VIP access features",
            "Early feature access",
          ],
        },
      ],
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getMyBuyerSubscription(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    await requireBuyerSubscriptionModel();

    const record = await prisma.buyerSubscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({
      success: true,
      subscription: toResponse(record),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function upsertMyBuyerSubscription(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    await requireBuyerSubscriptionModel();

    const planCode = normalizePlanCode(
      req.body?.planCode ?? req.body?.plan ?? req.body?.code,
      "FREE",
    );
    const status = normalizeStatus(req.body?.status, "ACTIVE");
    const cancelAtPeriodEnd = !!req.body?.cancelAtPeriodEnd;
    const currentPeriodEnd = normalizeDate(req.body?.currentPeriodEnd);
    const stripeCustomerId = normalizeString(req.body?.stripeCustomerId, "") || null;
    const stripeSubscriptionId =
      normalizeString(req.body?.stripeSubscriptionId, "") || null;

    assertValidPlanCode(planCode);
    assertValidStatus(status);

    const existing = await prisma.buyerSubscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    let record;

    if (existing) {
      record = await prisma.buyerSubscription.update({
        where: { id: existing.id },
        data: {
          planCode,
          status,
          cancelAtPeriodEnd,
          currentPeriodEnd,
          stripeCustomerId,
          stripeSubscriptionId,
        },
      });
    } else {
      record = await prisma.buyerSubscription.create({
        data: {
          userId,
          planCode,
          status,
          cancelAtPeriodEnd,
          currentPeriodEnd,
          stripeCustomerId,
          stripeSubscriptionId,
        },
      });
    }

    return res.json({
      success: true,
      subscription: toResponse(record),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function cancelMyBuyerSubscription(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    await requireBuyerSubscriptionModel();

    const existing = await prisma.buyerSubscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    if (!existing) {
      throw badRequest("No buyer subscription found to cancel.");
    }

    const record = await prisma.buyerSubscription.update({
      where: { id: existing.id },
      data: {
        status: "CANCELED",
        cancelAtPeriodEnd: true,
      },
    });

    return res.json({
      success: true,
      subscription: toResponse(record),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminListBuyerSubscriptions(req, res) {
  try {
    if (req?.user?.role !== "ADMIN") {
      throw forbidden();
    }

    await requireBuyerSubscriptionModel();

    const records = await prisma.buyerSubscription.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return res.json({
      success: true,
      subscriptions: records.map(toResponse),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

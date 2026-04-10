import { prisma } from "../lib/prisma.js";
import {
  DEFAULT_BUYER_SUBSCRIPTION_STATUS,
  isKnownBuyerPlanCode,
  listBuyerPlans,
  normalizeBuyerPlanCode,
  normalizeBuyerSubscriptionStatus,
} from "../config/buyerPlans.js";

function errorResponse(res, err, fallback = "Internal Server Error") {
  const status = Number(err?.statusCode) || Number(err?.status) || 500;
  const message = err?.message || fallback;
  return res.status(status).json({ error: message });
}

function createHttpError(message, statusCode = 500, details = undefined) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (details !== undefined) err.details = details;
  return err;
}

function getRequestUser(req) {
  const user = req?.user;
  if (!user || typeof user !== "object") {
    throw createHttpError("Unauthorized", 401);
  }
  return user;
}

function getRequestUserId(req) {
  const user = getRequestUser(req);
  return String(user.sub || user.id || "").trim();
}

function parseOptionalDate(value, fieldName = "currentPeriodEnd") {
  if (value == null || value === "") return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(`Invalid ${fieldName}`, 400);
  }

  return parsed;
}

function assertKnownBuyerPlanCode(plan) {
  const normalized = String(plan || "").trim().toUpperCase();

  if (!normalized) {
    throw createHttpError("Plan is required", 400);
  }

  if (!isKnownBuyerPlanCode(normalized)) {
    throw createHttpError(`Unsupported buyer plan: ${normalized}`, 400);
  }

  return normalizeBuyerPlanCode(normalized);
}

export async function listAvailableBuyerPlans(_req, res) {
  try {
    return res.json({
      success: true,
      plans: listBuyerPlans(),
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to load buyer plans");
  }
}

export async function getMyBuyerSubscription(req, res) {
  try {
    const userId = getRequestUserId(req);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        buyerSubscriptionPlan: true,
        buyerSubscriptionStatus: true,
        buyerSubscriptionCurrentPeriodEnd: true,
        buyerCancelAtPeriodEnd: true,
        buyerStripeCustomerId: true,
        buyerStripeSubscriptionId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      success: true,
      subscription: user,
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to load buyer subscription");
  }
}

export async function setMyBuyerSubscription(req, res) {
  try {
    const userId = getRequestUserId(req);
    const {
      plan,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd = false,
    } = req.body || {};

    const nextPlan = assertKnownBuyerPlanCode(plan);
    const nextStatus = normalizeBuyerSubscriptionStatus(
      status || DEFAULT_BUYER_SUBSCRIPTION_STATUS
    );
    const nextCurrentPeriodEnd = parseOptionalDate(
      currentPeriodEnd,
      "currentPeriodEnd"
    );

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        buyerSubscriptionPlan: nextPlan,
        buyerSubscriptionStatus: nextStatus,
        buyerSubscriptionCurrentPeriodEnd: nextCurrentPeriodEnd,
        buyerCancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
      },
      select: {
        id: true,
        name: true,
        email: true,
        buyerSubscriptionPlan: true,
        buyerSubscriptionStatus: true,
        buyerSubscriptionCurrentPeriodEnd: true,
        buyerCancelAtPeriodEnd: true,
        buyerStripeCustomerId: true,
        buyerStripeSubscriptionId: true,
      },
    });

    return res.json({
      success: true,
      subscription: updated,
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to update buyer subscription");
  }
}

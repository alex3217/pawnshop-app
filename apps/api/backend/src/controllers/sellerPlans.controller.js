// File: apps/api/backend/src/controllers/sellerPlans.controller.js

import { prisma } from "../lib/prisma.js";
import {
  DEFAULT_SUBSCRIPTION_STATUS,
  assertKnownSellerPlanCode,
  assertKnownSubscriptionStatus,
  getSellerPlanSummary,
  listSellerPlans,
  normalizeSubscriptionStatus,
} from "../config/sellerPlans.js";
import { getSellerEntitlementsForShop } from "../services/sellerPlan.service.js";

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

function normalizeId(value) {
  return String(value || "").trim();
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

function isAdminRequest(req) {
  const user = getRequestUser(req);
  return String(user.role || "").toUpperCase() === "ADMIN";
}

function parseOptionalDate(value, fieldName = "currentPeriodEnd") {
  if (value == null || value === "") return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(`Invalid ${fieldName}`, 400);
  }

  return parsed;
}

function assertSubscriptionStatus(status) {
  const raw = String(status || "").trim().toUpperCase();

  if (!raw) {
    return DEFAULT_SUBSCRIPTION_STATUS;
  }

  return assertKnownSubscriptionStatus(raw);
}

async function getAccessibleShopOrThrow(req, shopId) {
  const safeShopId = normalizeId(shopId);

  if (!safeShopId) {
    throw createHttpError("Shop id is required", 400);
  }

  const shop = await prisma.pawnShop.findUnique({
    where: { id: safeShopId },
    select: {
      id: true,
      ownerId: true,
      name: true,
      isDeleted: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!shop || shop.isDeleted) {
    throw createHttpError("Shop not found", 404);
  }

  const requesterId = getRequestUserId(req);
  if (!isAdminRequest(req) && shop.ownerId !== requesterId) {
    throw createHttpError("Forbidden", 403);
  }

  return shop;
}

function buildShopPlanResponse(shop) {
  const currentPlan = getSellerPlanSummary(shop.subscriptionPlan);
  const currentStatus = normalizeSubscriptionStatus(shop.subscriptionStatus);

  return {
    ...shop,
    subscriptionPlan: currentPlan.code,
    subscriptionStatus: currentStatus,
    subscriptionPlanLabel: currentPlan.label,
    subscriptionIsPaid: Boolean(currentPlan.isPaid),
    subscriptionRank: Number(currentPlan.rank || 0),
  };
}

export async function listAvailableSellerPlans(_req, res) {
  try {
    return res.json({
      success: true,
      plans: listSellerPlans().map((plan) => getSellerPlanSummary(plan.code)),
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to load seller plans");
  }
}

export async function getShopEntitlements(req, res) {
  try {
    const shopId = normalizeId(req.params.id);
    await getAccessibleShopOrThrow(req, shopId);

    const entitlements = await getSellerEntitlementsForShop(shopId);

    return res.json({
      success: true,
      entitlements,
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to load shop entitlements");
  }
}

export async function adminSetShopPlan(req, res) {
  try {
    const shopId = normalizeId(req.params.id);
    const {
      plan,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd = false,
    } = req.body || {};

    await getAccessibleShopOrThrow(req, shopId);

    const nextPlan = assertKnownSellerPlanCode(plan);
    const nextStatus = assertSubscriptionStatus(status);
    const nextCurrentPeriodEnd = parseOptionalDate(
      currentPeriodEnd,
      "currentPeriodEnd"
    );

    const updated = await prisma.pawnShop.update({
      where: { id: shopId },
      data: {
        subscriptionPlan: nextPlan,
        subscriptionStatus: nextStatus,
        subscriptionCurrentPeriodEnd: nextCurrentPeriodEnd,
        cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    const entitlements = await getSellerEntitlementsForShop(shopId);

    return res.json({
      success: true,
      subscriptionUpdated: true,
      shop: buildShopPlanResponse(updated),
      entitlements,
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to update shop subscription");
  }
}
// File: apps/api/backend/src/controllers/admin.controller.js

import { prisma } from "../lib/prisma.js";

function sendError(res, error, fallbackMessage = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error?.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallbackMessage,
    ...(error?.details ? { details: error.details } : {}),
  });
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

function normalizePlanCode(value, fallback = "FREE") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeStatus(value, fallback = "UNKNOWN") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeInterval(value, fallback = "MONTHLY") {
  return normalizeString(value, fallback).toUpperCase();
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function listUsers(_req, res) {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

    return res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function blockUser(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return res.json({ ok: true, id: user.id, isActive: user.isActive });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function unblockUser(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    return res.json({ ok: true, id: user.id, isActive: user.isActive });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminListItems(req, res) {
  try {
    const all = req.query.all === "true";
    const where = all ? {} : { isDeleted: false };

    const items = await prisma.item.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { shop: true },
    });

    return res.json(items);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function softDeleteItem(req, res) {
  try {
    const { id } = req.params;
    const item = await prisma.item.update({
      where: { id },
      data: { isDeleted: true },
    });

    return res.json({ ok: true, id: item.id, isDeleted: item.isDeleted });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function restoreItem(req, res) {
  try {
    const { id } = req.params;
    const item = await prisma.item.update({
      where: { id },
      data: { isDeleted: false },
    });

    return res.json({ ok: true, id: item.id, isDeleted: item.isDeleted });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminListShops(req, res) {
  try {
    const all = req.query.all === "true";
    const where = all ? {} : { isDeleted: false };

    const shops = await prisma.pawnShop.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { owner: true },
    });

    return res.json(
      shops.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        phone: s.phone,
        ownerId: s.ownerId,
        ownerEmail: s.owner?.email,
        isDeleted: s.isDeleted,
        createdAt: s.createdAt,
      })),
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function softDeleteShop(req, res) {
  try {
    const { id } = req.params;
    const shop = await prisma.pawnShop.update({
      where: { id },
      data: { isDeleted: true },
    });

    return res.json({ ok: true, id: shop.id, isDeleted: shop.isDeleted });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function restoreShop(req, res) {
  try {
    const { id } = req.params;
    const shop = await prisma.pawnShop.update({
      where: { id },
      data: { isDeleted: false },
    });

    return res.json({ ok: true, id: shop.id, isDeleted: shop.isDeleted });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminListSubscriptions(_req, res) {
  try {
    const shops = await prisma.pawnShop.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const subscriptions = shops.map((shop) => ({
      id: shop.id,
      shopId: shop.id,
      shopName: normalizeString(shop.name, "Unknown shop"),
      ownerId: shop.ownerId,
      ownerName: normalizeString(shop.owner?.name, "Unknown owner"),
      ownerEmail: normalizeString(shop.owner?.email, ""),
      plan: normalizePlanCode(shop.subscriptionPlan, "FREE"),
      subscriptionPlan: normalizePlanCode(shop.subscriptionPlan, "FREE"),
      status: normalizeStatus(shop.subscriptionStatus, "UNKNOWN"),
      subscriptionStatus: normalizeStatus(shop.subscriptionStatus, "UNKNOWN"),
      interval: normalizeInterval(shop.subscriptionBillingInterval, "MONTHLY"),
      billingInterval: normalizeInterval(
        shop.subscriptionBillingInterval,
        "MONTHLY",
      ),
      currentPeriodEnd: toIsoOrNull(shop.subscriptionCurrentPeriodEnd),
      subscriptionCurrentPeriodEnd: toIsoOrNull(
        shop.subscriptionCurrentPeriodEnd,
      ),
      stripeCustomerId: shop.stripeCustomerId || null,
      stripeSubscriptionId: shop.stripeSubscriptionId || null,
      createdAt: toIsoOrNull(shop.createdAt),
      updatedAt: toIsoOrNull(shop.updatedAt),
    }));

    return res.json({
      success: true,
      subscriptions,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
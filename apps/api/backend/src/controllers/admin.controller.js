// File: apps/api/backend/src/controllers/admin.controller.js

import bcrypt from "bcryptjs";
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


const ADMIN_USER_ROLES = new Set(["CONSUMER", "OWNER", "ADMIN", "SUPER_ADMIN"]);

function normalizeEmail(value) {
  return normalizeString(value, "").toLowerCase();
}

function normalizeRole(value, fallback = "CONSUMER") {
  return normalizeString(value, fallback).toUpperCase();
}

function serializeAdminUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function serializeAdminShop(shop) {
  if (!shop) return null;

  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    phone: shop.phone,
    description: shop.description,
    hours: shop.hours,
    ownerId: shop.ownerId,
    ownerName: shop.owner?.name || null,
    ownerEmail: shop.owner?.email || null,
    subscriptionPlan: shop.subscriptionPlan || null,
    subscriptionStatus: shop.subscriptionStatus || null,
    isDeleted: shop.isDeleted,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  };
}

function serializeAdminItem(item) {
  if (!item) return null;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    price: item.price,
    currency: item.currency,
    category: item.category,
    condition: item.condition,
    status: item.status,
    isDeleted: item.isDeleted,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    shop: item.shop
      ? {
          id: item.shop.id,
          name: item.shop.name,
          ownerId: item.shop.ownerId,
        }
      : null,
  };
}

function pickAdminUserCreateData(body = {}, actorRole = "ADMIN") {
  const email = normalizeEmail(body.email);
  const password = normalizeString(body.password, "");
  const role = normalizeRole(body.role, "CONSUMER");

  if (!email) {
    const error = new Error("Email is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!password || password.length < 8) {
    const error = new Error("Password must be at least 8 characters.");
    error.statusCode = 400;
    throw error;
  }

  if (!ADMIN_USER_ROLES.has(role)) {
    const error = new Error("Invalid role.");
    error.statusCode = 400;
    throw error;
  }

  if (role === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") {
    const error = new Error("Only Super Admin can create Super Admin users.");
    error.statusCode = 403;
    throw error;
  }

  return {
    name: normalizeString(body.name, ""),
    email,
    password,
    role,
    isActive: body.isActive === false ? false : true,
  };
}

function pickAdminUserUpdateData(body = {}, actorRole = "ADMIN") {
  const data = {};

  if (body.name !== undefined) data.name = normalizeString(body.name, "");
  if (body.email !== undefined) data.email = normalizeEmail(body.email);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  if (body.role !== undefined) {
    const role = normalizeRole(body.role);

    if (!ADMIN_USER_ROLES.has(role)) {
      const error = new Error("Invalid role.");
      error.statusCode = 400;
      throw error;
    }

    if (role === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") {
      const error = new Error("Only Super Admin can assign Super Admin role.");
      error.statusCode = 403;
      throw error;
    }

    data.role = role;
  }

  return data;
}

function pickAdminShopData(body = {}) {
  const data = {};

  if (body.name !== undefined) data.name = normalizeString(body.name, "");
  if (body.address !== undefined) data.address = normalizeString(body.address, "");
  if (body.phone !== undefined) data.phone = normalizeString(body.phone, "");
  if (body.description !== undefined) data.description = normalizeString(body.description, "");
  if (body.hours !== undefined) data.hours = normalizeString(body.hours, "");
  if (body.ownerId !== undefined) data.ownerId = normalizeString(body.ownerId, "");
  if (body.subscriptionPlan !== undefined) data.subscriptionPlan = normalizePlanCode(body.subscriptionPlan, "FREE");
  if (body.subscriptionStatus !== undefined) data.subscriptionStatus = normalizeStatus(body.subscriptionStatus, "ACTIVE");
  if (body.isDeleted !== undefined) data.isDeleted = Boolean(body.isDeleted);

  return data;
}

function pickAdminItemData(body = {}) {
  const data = {};

  if (body.title !== undefined) data.title = normalizeString(body.title, "");
  if (body.description !== undefined) data.description = normalizeString(body.description, "");
  if (body.category !== undefined) data.category = normalizeString(body.category, "");
  if (body.condition !== undefined) data.condition = normalizeString(body.condition, "");
  if (body.status !== undefined) data.status = normalizeStatus(body.status, "AVAILABLE");
  if (body.currency !== undefined) data.currency = normalizeString(body.currency, "USD").toUpperCase();
  if (body.isDeleted !== undefined) data.isDeleted = Boolean(body.isDeleted);

  if (body.shopId !== undefined || body.pawnShopId !== undefined) {
    data.pawnShopId = normalizeString(body.shopId ?? body.pawnShopId, "");
  }

  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      const error = new Error("Price must be a valid non-negative number.");
      error.statusCode = 400;
      throw error;
    }
    data.price = price;
  }

  return data;
}

async function writeAdminActionAudit(req, entry) {
  try {
    if (!prisma.superAdminAuditLog?.create) return;

    await prisma.superAdminAuditLog.create({
      data: {
        actorId: req?.user?.sub ?? null,
        actorEmail: req?.user?.email || req?.user?.username || null,
        actorRole: req?.user?.role ?? null,
        action: entry.action,
        method: req?.method ?? "UNKNOWN",
        path: req?.originalUrl ?? req?.url ?? "",
        routeKey: req?.route?.path ? String(req.route.path) : null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        statusCode: entry.statusCode || 200,
        success: entry.success !== false,
        requestId: req?.id ?? req?.requestId ?? null,
        ipAddress: req?.ip ?? null,
        userAgent: typeof req?.get === "function" ? req.get("user-agent") : null,
        metadata: entry.metadata || {},
      },
    });
  } catch (error) {
    console.warn("[admin:audit] Failed to write admin action audit", {
      error: error?.message || error,
    });
  }
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


export async function createAdminUser(req, res) {
  try {
    const input = pickAdminUserCreateData(req.body, req?.user?.role);
    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: passwordHash,
        role: input.role,
        isActive: input.isActive,
      },
    });

    await writeAdminActionAudit(req, {
      action: "ADMIN_CREATE_USER",
      targetType: "USER",
      targetId: user.id,
      metadata: {
        email: user.email,
        role: user.role,
      },
    });

    return res.status(201).json({
      success: true,
      user: serializeAdminUser(user),
    });
  } catch (error) {
    return sendError(res, error, "Failed to create user.");
  }
}

export async function updateAdminUser(req, res) {
  try {
    const { id } = req.params;
    const data = pickAdminUserUpdateData(req.body, req?.user?.role);

    if (!Object.keys(data).length) {
      const error = new Error("No user fields supplied.");
      error.statusCode = 400;
      throw error;
    }

    const user = await prisma.user.update({
      where: { id },
      data,
    });

    await writeAdminActionAudit(req, {
      action: "ADMIN_UPDATE_USER",
      targetType: "USER",
      targetId: user.id,
      metadata: data,
    });

    return res.json({
      success: true,
      user: serializeAdminUser(user),
    });
  } catch (error) {
    return sendError(res, error, "Failed to update user.");
  }
}

export async function createAdminShop(req, res) {
  try {
    const data = pickAdminShopData(req.body);

    if (!data.name) {
      const error = new Error("Shop name is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!data.ownerId) {
      const error = new Error("Owner id is required.");
      error.statusCode = 400;
      throw error;
    }

    const owner = await prisma.user.findUnique({
      where: { id: data.ownerId },
      select: { id: true, role: true },
    });

    if (!owner) {
      const error = new Error("Owner user not found.");
      error.statusCode = 404;
      throw error;
    }

    const shop = await prisma.pawnShop.create({
      data,
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

    await writeAdminActionAudit(req, {
      action: "ADMIN_CREATE_SHOP",
      targetType: "SHOP",
      targetId: shop.id,
      metadata: {
        ownerId: shop.ownerId,
        name: shop.name,
      },
    });

    return res.status(201).json({
      success: true,
      shop: serializeAdminShop(shop),
    });
  } catch (error) {
    return sendError(res, error, "Failed to create shop.");
  }
}

export async function updateAdminShop(req, res) {
  try {
    const { id } = req.params;
    const data = pickAdminShopData(req.body);

    if (!Object.keys(data).length) {
      const error = new Error("No shop fields supplied.");
      error.statusCode = 400;
      throw error;
    }

    if (data.ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: data.ownerId },
        select: { id: true },
      });

      if (!owner) {
        const error = new Error("Owner user not found.");
        error.statusCode = 404;
        throw error;
      }
    }

    const shop = await prisma.pawnShop.update({
      where: { id },
      data,
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

    await writeAdminActionAudit(req, {
      action: "ADMIN_UPDATE_SHOP",
      targetType: "SHOP",
      targetId: shop.id,
      metadata: data,
    });

    return res.json({
      success: true,
      shop: serializeAdminShop(shop),
    });
  } catch (error) {
    return sendError(res, error, "Failed to update shop.");
  }
}


export async function createAdminItem(req, res) {
  try {
    const data = pickAdminItemData(req.body);
    const shopId = normalizeString(req.body?.shopId ?? req.body?.pawnShopId ?? data.pawnShopId, "");

    if (!shopId) {
      const error = new Error("Shop id is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!data.title) {
      const error = new Error("Item title is required.");
      error.statusCode = 400;
      throw error;
    }

    const shop = await prisma.pawnShop.findUnique({
      where: { id: shopId },
      select: { id: true },
    });

    if (!shop) {
      const error = new Error("Shop not found.");
      error.statusCode = 404;
      throw error;
    }

    const createData = {
      title: data.title,
      description: data.description ?? "",
      price: data.price ?? 0,
      currency: data.currency || "USD",
      category: data.category || "UNCATEGORIZED",
      condition: data.condition || "USED",
      status: data.status || "AVAILABLE",
      isDeleted: data.isDeleted === true,
      pawnShopId: shopId,
    };

    let item;

    try {
      item = await prisma.item.create({
        data: createData,
        include: { shop: true },
      });
    } catch (error) {
      const message = String(error?.message || "");

      if (!message.includes("Unknown argument `pawnShopId`")) {
        throw error;
      }

      const fallbackData = { ...createData };
      delete fallbackData.pawnShopId;
      fallbackData.shopId = shopId;

      item = await prisma.item.create({
        data: fallbackData,
        include: { shop: true },
      });
    }

    await writeAdminActionAudit(req, {
      action: "ADMIN_CREATE_ITEM",
      targetType: "ITEM",
      targetId: item.id,
      metadata: {
        title: item.title,
        shopId,
        status: item.status,
      },
    });

    return res.status(201).json({
      success: true,
      item: serializeAdminItem(item),
    });
  } catch (error) {
    return sendError(res, error, "Failed to create item.");
  }
}


export async function updateAdminItem(req, res) {
  try {
    const { id } = req.params;
    const data = pickAdminItemData(req.body);

    if (!Object.keys(data).length) {
      const error = new Error("No item fields supplied.");
      error.statusCode = 400;
      throw error;
    }

    if (data.pawnShopId) {
      const shop = await prisma.pawnShop.findUnique({
        where: { id: data.pawnShopId },
        select: { id: true },
      });

      if (!shop) {
        const error = new Error("Shop not found.");
        error.statusCode = 404;
        throw error;
      }
    }

    let item;

    try {
      item = await prisma.item.update({
        where: { id },
        data,
        include: { shop: true },
      });
    } catch (error) {
      const message = String(error?.message || "");

      if (!data.pawnShopId || !message.includes("Unknown argument `pawnShopId`")) {
        throw error;
      }

      const fallbackData = { ...data };
      fallbackData.shopId = fallbackData.pawnShopId;
      delete fallbackData.pawnShopId;

      item = await prisma.item.update({
        where: { id },
        data: fallbackData,
        include: { shop: true },
      });
    }

    await writeAdminActionAudit(req, {
      action: "ADMIN_UPDATE_ITEM",
      targetType: "ITEM",
      targetId: item.id,
      metadata: data,
    });

    return res.json({
      success: true,
      item: serializeAdminItem(item),
    });
  } catch (error) {
    return sendError(res, error, "Failed to update item.");
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
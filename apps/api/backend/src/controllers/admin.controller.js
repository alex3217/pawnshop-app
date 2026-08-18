// File: apps/api/backend/src/controllers/admin.controller.js

import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import {
  assertCanCreateLocationForOwner,
  resolveEffectiveSellerPlan,
} from "../services/sellerPlan.service.js";
import { validatePassword } from "../services/passwordPolicy.service.js";
import {
  runGovernedCreateMutation,
  runGovernedItemMutation,
  runGovernedShopMutation,
  runGovernedUserMutation,
} from "../services/superAdminAudit.service.js";
import { deleteTrackedAssets, lockItemImagesForUpdate, lockShopBrandingForUpdate, reconcileAssetUrls } from "../services/uploadAssets.service.js";

function sendError(res, error, fallbackMessage = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error?.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallbackMessage,
    ...(error?.code ? { code: error.code } : {}),
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

export function serializeAdminShop(shop) {
  if (!shop) return null;

  const effective = resolveEffectiveSellerPlan(shop);
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
    subscriptionPlan: effective.effectivePlan,
    effectiveSubscriptionPlan: effective.effectivePlan,
    storedSubscriptionPlan: effective.storedPlan,
    subscriptionStatus: effective.status,
    subscriptionBillingInterval: effective.interval,
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
  const password = typeof body.password === "string" ? body.password : "";
  const role = normalizeRole(body.role, "CONSUMER");

  if (!email) {
    const error = new Error("Email is required.");
    error.statusCode = 400;
    throw error;
  }

  validatePassword(password, { email });

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

  if (body.isActive === false || body.role !== undefined) {
    data.authVersion = { increment: 1 };
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

    const user = await runGovernedCreateMutation({
      req,
      action: "ADMIN_CREATE_USER",
      targetType: "USER",
      create: (tx) => tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: passwordHash,
          role: input.role,
          isActive: input.isActive,
          emailVerifiedAt: new Date(),
        },
      }),
      metadata: (created) => ({ email: created.email, role: created.role }),
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

    const user = await runGovernedUserMutation({
      req,
      targetUserId: id,
      update: data,
      action: "ADMIN_UPDATE_USER",
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

    if (String(req.user?.role || "").toUpperCase() !== "SUPER_ADMIN") {
      await assertCanCreateLocationForOwner(data.ownerId);
    }

    const shop = await runGovernedCreateMutation({
      req,
      action: "ADMIN_CREATE_SHOP",
      targetType: "SHOP",
      create: (tx) => tx.pawnShop.create({
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
      }),
      metadata: (created) => ({ ownerId: created.ownerId, name: created.name }),
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

    const shop = await runGovernedShopMutation({
      req,
      targetShopId: id,
      update: data,
      action: "ADMIN_UPDATE_SHOP",
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

    const item = await runGovernedCreateMutation({
      req,
      action: "ADMIN_CREATE_ITEM",
      targetType: "ITEM",
      create: async (tx) => {
        try {
          return await tx.item.create({
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

          return tx.item.create({
            data: fallbackData,
            include: { shop: true },
          });
        }
      },
      metadata: (created) => ({
        title: created.title,
        shopId,
        status: created.status,
      }),
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

    const item = await runGovernedItemMutation({
      req,
      action: "ADMIN_UPDATE_ITEM",
      targetItemId: id,
      metadata: data,
      mutation: async (tx) => {
        try {
          return await tx.item.update({
            where: { id },
            data,
            include: { shop: true },
          });
        } catch (error) {
          const message = String(error?.message || "");

          if (
            !data.pawnShopId ||
            !message.includes("Unknown argument `pawnShopId`")
          ) {
            throw error;
          }

          const fallbackData = { ...data };
          fallbackData.shopId = fallbackData.pawnShopId;
          delete fallbackData.pawnShopId;

          return tx.item.update({
            where: { id },
            data: fallbackData,
            include: { shop: true },
          });
        }
      },
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
    const user = await runGovernedUserMutation({
      req,
      targetUserId: id,
      update: { isActive: false, authVersion: { increment: 1 } },
      action: "ADMIN_BLOCK_USER",
    });

    return res.json({ ok: true, id: user.id, isActive: user.isActive });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function unblockUser(req, res) {
  try {
    const { id } = req.params;
    const user = await runGovernedUserMutation({
      req,
      targetUserId: id,
      update: { isActive: true },
      action: "ADMIN_UNBLOCK_USER",
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
    let removedAssets = [];
    const item = await runGovernedItemMutation({
      req,
      action: "MODERATE_ITEM_REMOVE",
      targetItemId: id,
      metadata: { moderationType: "soft_delete" },
      mutation: async (tx) => {
        const current = await lockItemImagesForUpdate(tx, id);
        const updated = await tx.item.update({ where: { id }, data: { isDeleted: true, availability: "ARCHIVED" } });
        if (current) removedAssets = await reconcileAssetUrls({ tx, shopId: current.pawnShopId, itemId: id, previousUrls: current.images, nextUrls: [] });
        return updated;
      },
    });
    await deleteTrackedAssets({ assets: removedAssets, storage: req.app.locals.uploadStorage, requestId: req.requestId });

    return res.json({ ok: true, id: item.id, isDeleted: item.isDeleted });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function restoreItem(req, res) {
  try {
    const { id } = req.params;
    const item = await runGovernedItemMutation({
      req,
      action: "MODERATE_ITEM_RESTORE",
      targetItemId: id,
      metadata: { moderationType: "restore" },
      mutation: async (tx) => {
        await lockItemImagesForUpdate(tx, id);
        const current = await tx.item.findUnique({ where: { id }, select: { status: true } });
        return tx.item.update({ where: { id }, data: { isDeleted: false, availability: current?.status === "SOLD" ? "SOLD" : "AVAILABLE" } });
      },
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

    return res.json(shops.map(serializeAdminShop));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function softDeleteShop(req, res) {
  try {
    const { id } = req.params;
    let removedAssets = [];
    const shop = await runGovernedShopMutation({
      req,
      targetShopId: id,
      update: { isDeleted: true },
      action: "ADMIN_DISABLE_SHOP",
      beforeUpdate: (tx) => lockShopBrandingForUpdate(tx, id),
      afterUpdate: async (tx, _updated, current) => {
        removedAssets = await reconcileAssetUrls({ tx, shopId: id, previousUrls: [current?.logoUrl, current?.bannerUrl].filter(Boolean), nextUrls: [] });
      },
    });
    await deleteTrackedAssets({ assets: removedAssets, storage: req.app.locals.uploadStorage, requestId: req.requestId });

    return res.json({ ok: true, id: shop.id, isDeleted: shop.isDeleted });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function restoreShop(req, res) {
  try {
    const { id } = req.params;
    const shop = await runGovernedShopMutation({
      req,
      targetShopId: id,
      update: { isDeleted: false },
      action: "ADMIN_RESTORE_SHOP",
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


// OWNER APPLICATION REVIEW WORKFLOW V1
const OWNER_APPLICATION_STATUSES = new Set([
  "PENDING",
  "IN_REVIEW",
  "INFORMATION_REQUESTED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
]);

const OWNER_APPLICATION_TRANSITIONS = new Map([
  [
    "PENDING",
    new Set([
      "IN_REVIEW",
      "INFORMATION_REQUESTED",
      "APPROVED",
      "REJECTED",
    ]),
  ],
  [
    "IN_REVIEW",
    new Set([
      "INFORMATION_REQUESTED",
      "APPROVED",
      "REJECTED",
    ]),
  ],
  [
    "INFORMATION_REQUESTED",
    new Set([
      "IN_REVIEW",
      "APPROVED",
      "REJECTED",
    ]),
  ],
  ["APPROVED", new Set(["SUSPENDED"])],
  ["REJECTED", new Set([])],
  ["SUSPENDED", new Set(["APPROVED"])],
]);

const OWNER_APPLICATION_REASON_REQUIRED = new Set([
  "INFORMATION_REQUESTED",
  "REJECTED",
  "SUSPENDED",
]);

function normalizeOwnerApplicationStatus(value) {
  return normalizeString(value, "").toUpperCase();
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoundedPositiveInteger(value, fallback, maximum) {
  return Math.min(readPositiveInteger(value, fallback), maximum);
}

function serializeOwnerApplicationReviewHistory(entry) {
  return {
    id: entry.id,
    ownerApplicationId: entry.ownerApplicationId,
    previousStatus: entry.previousStatus,
    newStatus: entry.newStatus,
    decisionReason: entry.decisionReason,
    adminNotes: entry.adminNotes,
    reviewerId: entry.reviewerId,
    reviewer: {
      id: entry.reviewerId,
      name: entry.reviewerName,
      email: entry.reviewerEmail,
      role: entry.reviewerRole,
    },
    reviewedAt: toIsoOrNull(entry.reviewedAt),
  };
}

function serializeOwnerApplication(application) {
  if (!application) return null;

  return {
    id: application.id,
    ownerId: application.ownerId,
    status: application.status,
    businessName: application.businessName,
    businessType: application.businessType?.startsWith("OTHER: ")
      ? `Other — ${application.businessType.slice(7)}`
      : application.businessType?.includes("_")
        ? `${application.businessType.replaceAll("_", " ")} (legacy)`
        : application.businessType,
    businessEmail: application.businessEmail,
    businessPhone: application.businessPhone,
    websiteUrl: application.websiteUrl,
    businessAddress: application.businessAddress ?? null,
    licenseNumber: application.licenseNumber,
    licenseState: application.licenseState,
    applicationData: application.applicationData ?? null,
    submittedAt: toIsoOrNull(application.submittedAt),
    reviewedAt: toIsoOrNull(application.reviewedAt),
    reviewedById: application.reviewedById,
    decisionReason: application.decisionReason,
    adminNotes: application.adminNotes,
    statusChangedAt: toIsoOrNull(application.statusChangedAt),
    createdAt: toIsoOrNull(application.createdAt),
    updatedAt: toIsoOrNull(application.updatedAt),
    owner: application.owner
      ? {
          id: application.owner.id,
          name: application.owner.name,
          email: application.owner.email,
          role: application.owner.role,
          isActive: application.owner.isActive,
          authVersion: application.owner.authVersion,
        }
      : null,
    reviewedBy: application.reviewedBy
      ? {
          id: application.reviewedBy.id,
          name: application.reviewedBy.name,
          email: application.reviewedBy.email,
          role: application.reviewedBy.role,
        }
      : null,
  };
}

const OWNER_APPLICATION_INCLUDE = {
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      authVersion: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
};

export async function listOwnerApplications(req, res) {
  try {
    const requestedStatus =
      normalizeOwnerApplicationStatus(req.query?.status);

    if (
      requestedStatus &&
      !OWNER_APPLICATION_STATUSES.has(requestedStatus)
    ) {
      const error = new Error("Invalid owner application status.");
      error.statusCode = 400;
      throw error;
    }

    const query = normalizeString(req.query?.q, "");
    const page = readPositiveInteger(req.query?.page, 1);
    const limit = Math.min(
      readPositiveInteger(req.query?.limit, 25),
      100,
    );

    const where = {
      status: requestedStatus || { not: "DRAFT" },
      ...(query
        ? {
            OR: [
              {
                businessName: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                businessEmail: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                owner: {
                  is: {
                    name: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
              {
                owner: {
                  is: {
                    email: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, applications] = await Promise.all([
      prisma.ownerApplication.count({ where }),
      prisma.ownerApplication.findMany({
        where,
        include: OWNER_APPLICATION_INCLUDE,
        orderBy: [
          { submittedAt: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      rows: applications.map(serializeOwnerApplication),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load owner applications.",
    );
  }
}

export async function getOwnerApplication(req, res) {
  try {
    const application =
      await prisma.ownerApplication.findFirst({
        where: { id: req.params.id, status: { not: "DRAFT" } },
        include: OWNER_APPLICATION_INCLUDE,
      });

    if (!application) {
      const error = new Error("Owner application not found.");
      error.statusCode = 404;
      throw error;
    }

    return res.json({
      success: true,
      application: serializeOwnerApplication(application),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load owner application.",
    );
  }
}

export async function getOwnerApplicationReviewHistory(req, res) {
  try {
    const page = readBoundedPositiveInteger(req.query?.page, 1, 1_000_000);
    const limit = readBoundedPositiveInteger(req.query?.limit, 20, 100);
    const where = {
      ownerApplicationId: req.params.id,
    };

    const application = await prisma.ownerApplication.findFirst({
      where: { id: req.params.id, status: { not: "DRAFT" } },
      select: { id: true },
    });

    if (!application) {
      const error = new Error("Owner application not found.");
      error.statusCode = 404;
      throw error;
    }

    const [total, entries] = await Promise.all([
      prisma.ownerApplicationReviewHistory.count({ where }),
      prisma.ownerApplicationReviewHistory.findMany({
        where,
        orderBy: [
          { reviewedAt: "desc" },
          { id: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      rows: entries.map(serializeOwnerApplicationReviewHistory),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load owner application review history.",
    );
  }
}

export async function updateOwnerApplicationStatus(req, res) {
  try {
    const nextStatus =
      normalizeOwnerApplicationStatus(req.body?.status);
    const decisionReason =
      normalizeString(req.body?.decisionReason, "");
    const hasAdminNotes = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "adminNotes",
    );
    const adminNotes =
      normalizeString(req.body?.adminNotes, "") || null;

    if (!OWNER_APPLICATION_STATUSES.has(nextStatus)) {
      const error = new Error(
        "A valid owner application status is required.",
      );
      error.statusCode = 400;
      throw error;
    }

    if (
      OWNER_APPLICATION_REASON_REQUIRED.has(nextStatus) &&
      !decisionReason
    ) {
      const error = new Error(
        `A reason is required when changing status to ${nextStatus}.`,
      );
      error.statusCode = 400;
      throw error;
    }

    const existing =
      await prisma.ownerApplication.findFirst({
        where: { id: req.params.id, status: { not: "DRAFT" } },
        include: OWNER_APPLICATION_INCLUDE,
      });

    if (!existing) {
      const error = new Error("Owner application not found.");
      error.statusCode = 404;
      throw error;
    }

    if (existing.owner?.role !== "OWNER") {
      const error = new Error(
        "The application is not linked to an owner account.",
      );
      error.statusCode = 409;
      throw error;
    }

    if (existing.status === nextStatus) {
      const error = new Error(
        `Owner application is already ${nextStatus}.`,
      );
      error.statusCode = 409;
      throw error;
    }

    const allowed =
      OWNER_APPLICATION_TRANSITIONS.get(existing.status);

    if (!allowed?.has(nextStatus)) {
      const error = new Error(
        `Cannot change owner application from ${existing.status} to ${nextStatus}.`,
      );
      error.statusCode = 409;
      throw error;
    }

    const reviewerId = String(
      req.user?.sub ||
        req.user?.id ||
        req.user?.userId ||
        "",
    ).trim();

    if (!reviewerId) {
      const error = new Error("Unauthorized");
      error.statusCode = 401;
      throw error;
    }

    const now = new Date();
    const invalidateOwnerTokens =
      existing.status === "APPROVED" ||
      nextStatus === "APPROVED";

    const application = await prisma.$transaction(
      async (transaction) => {
        const reviewer = await transaction.user.findUnique({
          where: { id: reviewerId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        });

        if (!reviewer) {
          const error = new Error("Unauthorized");
          error.statusCode = 401;
          throw error;
        }

        const updateResult =
          await transaction.ownerApplication.updateMany({
            where: {
              id: existing.id,
              status: existing.status,
            },
            data: {
              status: nextStatus,
              reviewedAt: now,
              reviewedById: reviewerId,
              decisionReason: decisionReason || null,
              statusChangedAt: now,
              ...(hasAdminNotes ? { adminNotes } : {}),
            },
          });

        if (updateResult.count !== 1) {
          const error = new Error(
            "Owner application status changed during review. Refresh and try again.",
          );
          error.statusCode = 409;
          throw error;
        }

        const historyEntry = await transaction.ownerApplicationReviewHistory.create({
          data: {
            ownerApplicationId: existing.id,
            previousStatus: existing.status,
            newStatus: nextStatus,
            decisionReason: decisionReason || null,
            adminNotes,
            reviewerId: reviewer.id,
            reviewerName: reviewer.name,
            reviewerEmail: reviewer.email,
            reviewerRole: reviewer.role,
            reviewedAt: now,
          },
        });

        if (
          new Set([
            "INFORMATION_REQUESTED",
            "APPROVED",
            "REJECTED",
            "SUSPENDED",
          ]).has(nextStatus)
        ) {
          const notificationCopy = {
            INFORMATION_REQUESTED: {
              title: "Owner application needs information",
              message:
                decisionReason ||
                "Please review the requested corrections and resubmit your application.",
            },
            APPROVED: {
              title: "Owner application approved",
              message: "Your owner application has been approved.",
            },
            REJECTED: {
              title: "Owner application decision",
              message: decisionReason || "Your owner application was not approved.",
            },
            SUSPENDED: {
              title: "Owner access suspended",
              message:
                decisionReason ||
                "Your approved-owner access has been suspended.",
            },
          }[nextStatus];

          await transaction.notification.create({
            data: {
              userId: existing.ownerId,
              type: `OWNER_APPLICATION_${nextStatus}`,
              title: notificationCopy.title,
              message: notificationCopy.message,
              actionUrl: "/owner/application",
              dedupeKey: `owner-application-status:${historyEntry.id}:${existing.ownerId}`,
            },
          });
        }

        if (invalidateOwnerTokens) {
          await transaction.user.update({
            where: { id: existing.ownerId },
            data: {
              authVersion: {
                increment: 1,
              },
            },
          });
        }

        return transaction.ownerApplication.findUnique({
          where: { id: existing.id },
          include: OWNER_APPLICATION_INCLUDE,
        });
      },
    );

    await writeAdminActionAudit(req, {
      action: `ADMIN_OWNER_APPLICATION_${nextStatus}`,
      targetType: "OWNER_APPLICATION",
      targetId: application.id,
      metadata: {
        ownerId: application.ownerId,
        previousStatus: existing.status,
        nextStatus,
        decisionReason: decisionReason || null,
        ownerTokensInvalidated: invalidateOwnerTokens,
      },
    });

    const refreshed =
      await prisma.ownerApplication.findUnique({
        where: { id: application.id },
        include: OWNER_APPLICATION_INCLUDE,
      });

    return res.json({
      success: true,
      application: serializeOwnerApplication(refreshed),
      requiresOwnerReauthentication: invalidateOwnerTokens,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to update owner application.",
    );
  }
}

// File: apps/api/backend/src/controllers/staff.controller.js

import { prisma } from "../lib/prisma.js";

const STAFF_ROLES = new Set([
  "MANAGER",
  "STAFF",
  "CASHIER",
  "INVENTORY",
  "AUCTION",
  "VIEWER",
]);

const STAFF_STATUSES = new Set(["INVITED", "ACTIVE", "INACTIVE", "ARCHIVED"]);

const STAFF_PERMISSIONS = new Set([
  "inventory:read",
  "inventory:write",
  "auctions:read",
  "auctions:write",
  "offers:read",
  "offers:write",
  "locations:read",
  "locations:write",
  "staff:read",
  "staff:write",
  "settlements:read",
]);

const DEFAULT_ROLE_PERMISSIONS = {
  MANAGER: [
    "inventory:read",
    "inventory:write",
    "auctions:read",
    "auctions:write",
    "offers:read",
    "offers:write",
    "locations:read",
    "locations:write",
    "staff:read",
    "staff:write",
    "settlements:read",
  ],
  STAFF: ["inventory:read", "auctions:read", "offers:read", "locations:read"],
  CASHIER: ["inventory:read", "offers:read", "offers:write", "settlements:read"],
  INVENTORY: ["inventory:read", "inventory:write", "locations:read"],
  AUCTION: ["inventory:read", "auctions:read", "auctions:write"],
  VIEWER: ["inventory:read", "auctions:read", "offers:read", "locations:read"],
};

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

function httpError(statusCode, message, details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function badRequest(message, details = undefined) {
  return httpError(400, message, details);
}

function forbidden(message = "Forbidden") {
  return httpError(403, message);
}

function notFound(message = "Not found") {
  return httpError(404, message);
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeRole(value, fallback = "STAFF") {
  const role = normalizeString(value, fallback).toUpperCase();
  return STAFF_ROLES.has(role) ? role : fallback;
}

function normalizeStatus(value, fallback = "INVITED") {
  const status = normalizeString(value, fallback).toUpperCase();
  return STAFF_STATUSES.has(status) ? status : fallback;
}

function normalizePermissions(value, role = "STAFF") {
  const source = Array.isArray(value) ? value : DEFAULT_ROLE_PERMISSIONS[role] || [];

  return Array.from(
    new Set(
      source
        .map((permission) => normalizeString(permission).toLowerCase())
        .filter((permission) => STAFF_PERMISSIONS.has(permission)),
    ),
  );
}

function normalizeStaffRow(row) {
  return {
    id: row.id,
    shopId: row.shopId,
    userId: row.userId,
    name: row.name || row.user?.name || null,
    email: row.email,
    role: row.role,
    status: row.status,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    phone: row.phone || null,
    invitedAt: row.invitedAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    shopName: row.shop?.name || null,
    pawnShopName: row.shop?.name || null,
    locationName: row.shop?.name || null,
    userEmail: row.user?.email || null,
  };
}

async function getOwnedShopIds(userId) {
  if (!userId) return [];

  const rows = await prisma.pawnShop.findMany({
    where: {
      ownerId: userId,
      isDeleted: false,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return rows.map((row) => row.id);
}

async function assertOwnerOrAdminAccessToShop(req, shopId) {
  const role = req?.user?.role;
  const userId = req?.user?.sub;

  if (role === "ADMIN" || role === "SUPER_ADMIN") return;

  if (role !== "OWNER") {
    throw forbidden();
  }

  const ownedShopIds = await getOwnedShopIds(userId);
  if (!ownedShopIds.includes(shopId)) {
    throw forbidden("You do not have access to this shop.");
  }
}

async function assertAccessToStaffRecord(req, staffId) {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    include: {
      shop: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!staff) {
    throw notFound("Staff member not found.");
  }

  await assertOwnerOrAdminAccessToShop(req, staff.shopId);
  return staff;
}

function validateStaffWriteBody(body = {}) {
  const errors = [];

  if (body.email !== undefined && !normalizeEmail(body.email)) {
    errors.push("email cannot be empty");
  }

  if (body.shopId !== undefined && !normalizeString(body.shopId)) {
    errors.push("shopId cannot be empty");
  }

  if (body.role !== undefined && !STAFF_ROLES.has(normalizeRole(body.role))) {
    errors.push("invalid role");
  }

  if (body.status !== undefined && !STAFF_STATUSES.has(normalizeStatus(body.status))) {
    errors.push("invalid status");
  }

  if (Array.isArray(body.permissions)) {
    const invalid = body.permissions
      .map((permission) => normalizeString(permission).toLowerCase())
      .filter((permission) => permission && !STAFF_PERMISSIONS.has(permission));

    if (invalid.length > 0) {
      errors.push(`invalid permissions: ${invalid.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    throw badRequest("Invalid staff payload.", errors);
  }
}

async function findUserByEmail(email) {
  if (!email || email === "—") return null;

  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
}

export async function listMyStaff(req, res) {
  try {
    const role = req?.user?.role;
    const userId = req?.user?.sub;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const where = {};

    if (role === "OWNER") {
      const shopIds = await getOwnedShopIds(userId);
      where.shopId = { in: shopIds };
    } else if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      throw forbidden();
    }

    const rows = await prisma.staff.findMany({
      where,
      include: {
        shop: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return res.json(rows.map(normalizeStaffRow));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listStaffByShop(req, res) {
  try {
    const shopId = normalizeString(req.params.shopId);

    if (!shopId) {
      throw badRequest("Shop id is required.");
    }

    await assertOwnerOrAdminAccessToShop(req, shopId);

    const rows = await prisma.staff.findMany({
      where: { shopId },
      include: {
        shop: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return res.json(rows.map(normalizeStaffRow));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createStaffMember(req, res) {
  try {
    validateStaffWriteBody(req.body);

    const shopId = normalizeString(req.body?.shopId);
    const email = normalizeEmail(req.body?.email);
    const role = normalizeRole(req.body?.role, "STAFF");
    const permissions = normalizePermissions(req.body?.permissions, role);

    if (!shopId) throw badRequest("shopId is required.");
    if (!email) throw badRequest("email is required.");

    await assertOwnerOrAdminAccessToShop(req, shopId);

    const linkedUser = await findUserByEmail(email);

    const staff = await prisma.staff.upsert({
      where: {
        shopId_email: {
          shopId,
          email,
        },
      },
      create: {
        shopId,
        email,
        userId: linkedUser?.id || null,
        name: normalizeString(req.body?.name, linkedUser?.name || ""),
        phone: normalizeString(req.body?.phone) || null,
        role,
        status: linkedUser ? "ACTIVE" : "INVITED",
        permissions,
        invitedAt: new Date(),
        acceptedAt: linkedUser ? new Date() : null,
      },
      update: {
        userId: linkedUser?.id || undefined,
        name: normalizeString(req.body?.name, linkedUser?.name || "") || undefined,
        phone:
          req.body?.phone !== undefined
            ? normalizeString(req.body?.phone) || null
            : undefined,
        role,
        status: linkedUser ? "ACTIVE" : "INVITED",
        permissions,
      },
      include: {
        shop: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.status(201).json(normalizeStaffRow(staff));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateStaffMember(req, res) {
  try {
    const staffId = normalizeString(req.params.id);
    if (!staffId) {
      throw badRequest("Staff id is required.");
    }

    validateStaffWriteBody(req.body);

    const current = await assertAccessToStaffRecord(req, staffId);

    const nextRole =
      req.body?.role !== undefined ? normalizeRole(req.body.role, current.role) : current.role;

    const nextEmail =
      req.body?.email !== undefined ? normalizeEmail(req.body.email) : current.email;

    const linkedUser =
      req.body?.email !== undefined ? await findUserByEmail(nextEmail) : undefined;

    const data = {
      name:
        req.body?.name !== undefined
          ? normalizeString(req.body.name) || null
          : undefined,
      email: req.body?.email !== undefined ? nextEmail : undefined,
      userId:
        req.body?.email !== undefined
          ? linkedUser?.id || null
          : undefined,
      phone:
        req.body?.phone !== undefined
          ? normalizeString(req.body.phone) || null
          : undefined,
      role: req.body?.role !== undefined ? nextRole : undefined,
      status:
        req.body?.status !== undefined
          ? normalizeStatus(req.body.status, current.status)
          : undefined,
      permissions:
        req.body?.permissions !== undefined
          ? normalizePermissions(req.body.permissions, nextRole)
          : undefined,
      acceptedAt:
        req.body?.status === "ACTIVE" && !current.acceptedAt ? new Date() : undefined,
    };

    const staff = await prisma.staff.update({
      where: { id: staffId },
      data,
      include: {
        shop: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.json(normalizeStaffRow(staff));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function removeStaffMember(req, res) {
  try {
    const staffId = normalizeString(req.params.id);
    if (!staffId) {
      throw badRequest("Staff id is required.");
    }

    await assertAccessToStaffRecord(req, staffId);

    const staff = await prisma.staff.update({
      where: { id: staffId },
      data: {
        status: "ARCHIVED",
      },
      include: {
        shop: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.json(normalizeStaffRow(staff));
  } catch (error) {
    return sendError(res, error);
  }
}

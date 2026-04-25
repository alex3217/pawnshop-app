// File: apps/api/backend/src/controllers/staff.controller.js

import { prisma } from "../lib/prisma.js";

const STAFF_TABLE_CANDIDATES = ["Staff", "ShopStaff"];
const PAWNSHOP_TABLE = "PawnShop";

let tableExistsCache = new Map();
let columnCache = new Map();

function sendError(res, error, fallbackMessage = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallbackMessage,
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

function notFound(message = "Not found") {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function notImplemented(message) {
  const error = new Error(message);
  error.statusCode = 501;
  return error;
}

async function tableExists(tableName) {
  if (tableExistsCache.has(tableName)) {
    return tableExistsCache.get(tableName);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    tableName,
  );

  const exists = !!rows?.[0]?.exists;
  tableExistsCache.set(tableName, exists);
  return exists;
}

async function getTableColumns(tableName) {
  if (columnCache.has(tableName)) {
    return columnCache.get(tableName);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    tableName,
  );

  const columns = new Set(
    Array.isArray(rows) ? rows.map((row) => row.column_name) : [],
  );

  columnCache.set(tableName, columns);
  return columns;
}

async function resolveStaffBackend() {
  for (const tableName of STAFF_TABLE_CANDIDATES) {
    if (await tableExists(tableName)) {
      return {
        tableName,
        columns: await getTableColumns(tableName),
      };
    }
  }

  return null;
}

async function getOwnedShopIds(userId) {
  if (!userId) return [];

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT id
      FROM "public"."${PAWNSHOP_TABLE}"
      WHERE "ownerId" = $1
        AND COALESCE("isDeleted", false) = false
      ORDER BY "createdAt" DESC NULLS LAST
    `,
    userId,
  );

  return Array.isArray(rows) ? rows.map((row) => row.id).filter(Boolean) : [];
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeRole(value, fallback = "TEAM_MEMBER") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeStatus(value, fallback = "ACTIVE") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeStaffRow(row, index = 0) {
  return {
    id: normalizeString(row.id, `staff-${index}`),
    name: normalizeString(row.name || row.fullName, `Staff ${index + 1}`),
    email: normalizeEmail(row.email || row.userEmail || "—"),
    role: normalizeRole(row.role || row.staffRole),
    locationName: normalizeString(
      row.locationName || row.shopName || row.pawnShopName,
      "Unassigned",
    ),
    status: normalizeStatus(row.status),
  };
}

async function listFromStaffTable({ backend, shopIds }) {
  const { tableName, columns } = backend;

  const hasId = columns.has("id");
  const hasName = columns.has("name");
  const hasFullName = columns.has("fullName");
  const hasEmail = columns.has("email");
  const hasRole = columns.has("role");
  const hasStaffRole = columns.has("staffRole");
  const hasStatus = columns.has("status");
  const hasShopId = columns.has("shopId");
  const hasLocationName = columns.has("locationName");
  const hasShopName = columns.has("shopName");
  const hasPawnShopName = columns.has("pawnShopName");

  if (!hasId) return [];

  if (tableName === "Staff") {
    const selects = [
      `"id"`,
      hasName ? `"name"` : `NULL AS "name"`,
      hasFullName ? `"fullName"` : `NULL AS "fullName"`,
      hasEmail ? `"email"` : `NULL AS "email"`,
      hasRole ? `"role"` : `NULL AS "role"`,
      hasStaffRole ? `"staffRole"` : `NULL AS "staffRole"`,
      hasStatus ? `"status"` : `'ACTIVE' AS "status"`,
      hasLocationName ? `"locationName"` : `NULL AS "locationName"`,
      hasShopName ? `"shopName"` : `NULL AS "shopName"`,
      hasPawnShopName ? `"pawnShopName"` : `NULL AS "pawnShopName"`,
      hasShopId ? `"shopId"` : `NULL AS "shopId"`,
    ];

    let sql = `
      SELECT ${selects.join(", ")}
      FROM "public"."Staff"
    `;

    const params = [];

    if (hasShopId && shopIds.length > 0) {
      sql += ` WHERE "shopId" = ANY($1::text[])`;
      params.push(shopIds);
    } else if (hasShopId && shopIds.length === 0) {
      return [];
    }

    sql += ` ORDER BY "id" ASC`;

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Array.isArray(rows) ? rows : [];
  }

  if (tableName === "ShopStaff") {
    const selects = [
      `"id"`,
      hasName ? `"name"` : `NULL AS "name"`,
      hasFullName ? `"fullName"` : `NULL AS "fullName"`,
      hasEmail ? `"email"` : `NULL AS "email"`,
      hasRole ? `"role"` : `NULL AS "role"`,
      hasStaffRole ? `"staffRole"` : `NULL AS "staffRole"`,
      hasStatus ? `"status"` : `'ACTIVE' AS "status"`,
      hasLocationName ? `"locationName"` : `NULL AS "locationName"`,
      hasShopName ? `"shopName"` : `NULL AS "shopName"`,
      hasPawnShopName ? `"pawnShopName"` : `NULL AS "pawnShopName"`,
      hasShopId ? `"shopId"` : `NULL AS "shopId"`,
    ];

    let sql = `
      SELECT ${selects.join(", ")}
      FROM "public"."ShopStaff"
    `;

    const params = [];

    if (hasShopId && shopIds.length > 0) {
      sql += ` WHERE "shopId" = ANY($1::text[])`;
      params.push(shopIds);
    } else if (hasShopId && shopIds.length === 0) {
      return [];
    }

    sql += ` ORDER BY "id" ASC`;

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Array.isArray(rows) ? rows : [];
  }

  return [];
}

async function assertOwnerOrAdminAccessToShop(req, shopId) {
  const role = req?.user?.role;
  const userId = req?.user?.sub;

  if (role === "ADMIN") return;

  if (role !== "OWNER") {
    throw forbidden();
  }

  const ownedShopIds = await getOwnedShopIds(userId);
  if (!ownedShopIds.includes(shopId)) {
    throw forbidden("You do not have access to this shop.");
  }
}

function validateStaffWriteBody(body = {}) {
  if (body.name !== undefined && !normalizeString(body.name)) {
    throw badRequest("name cannot be empty.");
  }

  if (body.email !== undefined && !normalizeEmail(body.email)) {
    throw badRequest("email cannot be empty.");
  }

  if (body.shopId !== undefined && !normalizeString(body.shopId)) {
    throw badRequest("shopId cannot be empty.");
  }
}

export async function listMyStaff(req, res) {
  try {
    const role = req?.user?.role;
    const userId = req?.user?.sub;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const backend = await resolveStaffBackend();

    if (!backend) {
      return res.json([]);
    }

    let shopIds = [];
    if (role === "OWNER") {
      shopIds = await getOwnedShopIds(userId);
    }

    const rows =
      role === "ADMIN"
        ? await listFromStaffTable({ backend, shopIds: [] })
        : await listFromStaffTable({ backend, shopIds });

    return res.json(rows.map((row, index) => normalizeStaffRow(row, index)));
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

    const backend = await resolveStaffBackend();

    if (!backend) {
      return res.json([]);
    }

    const rows = await listFromStaffTable({
      backend,
      shopIds: [shopId],
    });

    return res.json(rows.map((row, index) => normalizeStaffRow(row, index)));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createStaffMember(req, res) {
  try {
    const backend = await resolveStaffBackend();

    if (!backend) {
      throw notImplemented(
        "Staff management schema is not configured yet. Add a Staff or ShopStaff table before enabling staff creation.",
      );
    }

    validateStaffWriteBody(req.body);

    const shopId = normalizeString(req.body?.shopId);
    if (!shopId) {
      throw badRequest("shopId is required.");
    }

    await assertOwnerOrAdminAccessToShop(req, shopId);

    throw notImplemented(
      "Staff create support requires a finalized staff schema contract. Read/list endpoints are safe now, but write endpoints should be enabled only after the schema is confirmed.",
    );
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

    const backend = await resolveStaffBackend();

    if (!backend) {
      throw notImplemented(
        "Staff management schema is not configured yet. Add a Staff or ShopStaff table before enabling staff updates.",
      );
    }

    validateStaffWriteBody(req.body);

    throw notImplemented(
      "Staff update support requires a finalized staff schema contract. Read/list endpoints are safe now, but write endpoints should be enabled only after the schema is confirmed.",
    );
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

    const backend = await resolveStaffBackend();

    if (!backend) {
      throw notImplemented(
        "Staff management schema is not configured yet. Add a Staff or ShopStaff table before enabling staff removal.",
      );
    }

    throw notImplemented(
      "Staff removal support requires a finalized staff schema contract. Read/list endpoints are safe now, but write endpoints should be enabled only after the schema is confirmed.",
    );
  } catch (error) {
    return sendError(res, error);
  }
}
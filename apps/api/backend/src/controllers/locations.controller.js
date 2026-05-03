// File: apps/api/backend/src/controllers/locations.controller.js

import { prisma } from "../lib/prisma.js";

const LOCATION_SAFE_FIELDS = [
  "id",
  "name",
  "address",
  "phone",
  "description",
  "hours",
  "ownerId",
  "createdAt",
  "updatedAt",
  "isDeleted",
  "subscriptionPlan",
  "subscriptionStatus",
  "subscriptionBillingInterval",
  "subscriptionCurrentPeriodEnd",
  "stripeCustomerId",
  "stripeSubscriptionId",
];

const PAWNSHOP_TABLE = "PawnShop";

let pawnShopColumnsCache = null;

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

function notFound(message = "Location not found") {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function normalizeString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function normalizePlanCode(value, fallback = "FREE") {
  const str = normalizeString(value);
  return (str || fallback).toUpperCase();
}

function normalizeStatus(value, fallback = "UNKNOWN") {
  const str = normalizeString(value);
  return (str || fallback).toUpperCase();
}

function normalizeInterval(value, fallback = "MONTHLY") {
  const str = normalizeString(value);
  return (str || fallback).toUpperCase();
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getPawnShopColumns() {
  if (pawnShopColumnsCache) return pawnShopColumnsCache;

  const rows = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${PAWNSHOP_TABLE}
    ORDER BY ordinal_position
  `;

  pawnShopColumnsCache = new Set(
    Array.isArray(rows) ? rows.map((row) => row.column_name) : [],
  );

  return pawnShopColumnsCache;
}

async function buildPawnShopSelect(extraFields = []) {
  const actualColumns = await getPawnShopColumns();
  const fields = [...new Set([...LOCATION_SAFE_FIELDS, ...extraFields])];

  const select = {};
  for (const field of fields) {
    if (actualColumns.has(field)) {
      select[field] = true;
    }
  }

  if (!select.id) {
    throw new Error('PawnShop schema is invalid: missing required "id" column.');
  }

  return select;
}

async function buildPawnShopWhere(base = {}) {
  const actualColumns = await getPawnShopColumns();

  return {
    ...base,
    ...(actualColumns.has("isDeleted") ? { isDeleted: false } : {}),
  };
}

function pickLocationWriteData(body = {}, ownerId) {
  const data = {};

  if (body.name !== undefined) data.name = normalizeString(body.name);
  if (body.address !== undefined) data.address = normalizeString(body.address);
  if (body.phone !== undefined) data.phone = normalizeString(body.phone);
  if (body.description !== undefined) {
    data.description = normalizeString(body.description);
  }
  if (body.hours !== undefined) data.hours = normalizeString(body.hours);
  if (ownerId !== undefined) data.ownerId = ownerId;

  return data;
}

function assertLocationName(data) {
  if (!data.name) {
    throw badRequest("Location name is required.");
  }
}

function mapLocation(shop) {
  if (!shop) return null;

  return {
    id: shop.id,
    name: shop.name ?? null,
    address: shop.address ?? null,
    phone: shop.phone ?? null,
    description: shop.description ?? null,
    hours: shop.hours ?? null,
    ownerId: shop.ownerId ?? null,
    isDeleted: shop.isDeleted ?? false,
    subscriptionPlan: normalizePlanCode(shop.subscriptionPlan, "FREE"),
    subscriptionStatus: normalizeStatus(shop.subscriptionStatus, "UNKNOWN"),
    subscriptionBillingInterval: normalizeInterval(
      shop.subscriptionBillingInterval,
      "MONTHLY",
    ),
    subscriptionCurrentPeriodEnd: toIsoOrNull(
      shop.subscriptionCurrentPeriodEnd,
    ),
    stripeCustomerId: shop.stripeCustomerId ?? null,
    stripeSubscriptionId: shop.stripeSubscriptionId ?? null,
    createdAt: toIsoOrNull(shop.createdAt),
    updatedAt: toIsoOrNull(shop.updatedAt),
  };
}

export async function listLocations(req, res) {
  try {
    const [where, select] = await Promise.all([
      buildPawnShopWhere(),
      buildPawnShopSelect(),
    ]);

    const shops = await prisma.pawnShop.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select,
    });

    return res.json(shops.map(mapLocation));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listMyLocations(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const [where, select] = await Promise.all([
      buildPawnShopWhere({ ownerId: userId }),
      buildPawnShopSelect(),
    ]);

    const shops = await prisma.pawnShop.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select,
    });

    return res.json(shops.map(mapLocation));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getLocationById(req, res) {
  try {
    const id = normalizeString(req.params?.id);
    if (!id) throw badRequest("Location id is required.");

    const select = await buildPawnShopSelect(["ownerId", "isDeleted"]);
    const shop = await prisma.pawnShop.findUnique({
      where: { id },
      select,
    });

    if (!shop || shop.isDeleted) {
      throw notFound();
    }

    const role = req?.user?.role;
    const userId = req?.user?.sub;

    if (role && role !== "ADMIN" && shop.ownerId !== userId) {
      throw forbidden();
    }

    return res.json(mapLocation(shop));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createLocation(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const data = pickLocationWriteData(req.body, userId);
    assertLocationName(data);

    const select = await buildPawnShopSelect();

    const shop = await prisma.pawnShop.create({
      data,
      select,
    });

    return res.status(201).json(mapLocation(shop));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateLocation(req, res) {
  try {
    const id = normalizeString(req.params?.id);
    if (!id) throw badRequest("Location id is required.");

    const select = await buildPawnShopSelect(["ownerId", "isDeleted"]);
    const existing = await prisma.pawnShop.findUnique({
      where: { id },
      select,
    });

    if (!existing || existing.isDeleted) {
      throw notFound();
    }

    const role = req?.user?.role;
    const userId = req?.user?.sub;

    if (role !== "ADMIN" && existing.ownerId !== userId) {
      throw forbidden();
    }

    const data = pickLocationWriteData(req.body);

    const updated = await prisma.pawnShop.update({
      where: { id },
      data,
      select,
    });

    return res.json(mapLocation(updated));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getLocationItems(req, res) {
  try {
    const id = normalizeString(req.params?.id);
    if (!id) throw badRequest("Location id is required.");

    const shopSelect = await buildPawnShopSelect();
    const shop = await prisma.pawnShop.findUnique({
      where: { id },
      select: shopSelect,
    });

    if (!shop || shop.isDeleted) {
      throw notFound();
    }

    const items = await prisma.item.findMany({
      where: {
        pawnShopId: id,
        isDeleted: false,
        status: "AVAILABLE",
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      location: mapLocation(shop),
      items,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
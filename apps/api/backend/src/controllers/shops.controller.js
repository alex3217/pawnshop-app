import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Why this controller is defensive:
 * The current Prisma client expects a PawnShop column
 * (`subscriptionBillingInterval`) that is missing in the live DB.
 * If we let Prisma return the full PawnShop model by default,
 * reads/writes can fail even when we are not using that field.
 *
 * This controller fixes that by:
 * 1) introspecting the real PawnShop columns in the DB,
 * 2) selecting only columns that actually exist,
 * 3) making soft-delete filters conditional,
 * 4) avoiding default full-model returns on create/update/finds.
 */

const PAWNSHOP_SAFE_FIELDS = [
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
];

let pawnShopColumnsCache = null;

async function getPawnShopColumns() {
  if (pawnShopColumnsCache) return pawnShopColumnsCache;

  const rows = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'PawnShop'
    ORDER BY ordinal_position
  `;

  pawnShopColumnsCache = new Set(
    Array.isArray(rows) ? rows.map((row) => row.column_name) : []
  );

  return pawnShopColumnsCache;
}

async function buildPawnShopSelect(extraFields = []) {
  const actualColumns = await getPawnShopColumns();
  const fields = [...new Set([...PAWNSHOP_SAFE_FIELDS, ...extraFields])];

  const select = {};
  for (const field of fields) {
    if (actualColumns.has(field)) {
      select[field] = true;
    }
  }

  // id is required for sane API behavior; fail loudly if the schema is very broken
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

function normalizeString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function pickShopWriteData(body = {}, ownerId) {
  const data = {};

  if (body.name !== undefined) data.name = normalizeString(body.name);
  if (body.address !== undefined) data.address = normalizeString(body.address);
  if (body.phone !== undefined) data.phone = normalizeString(body.phone);
  if (body.description !== undefined) data.description = normalizeString(body.description);
  if (body.hours !== undefined) data.hours = normalizeString(body.hours);
  if (ownerId !== undefined) data.ownerId = ownerId;

  return data;
}

function assertShopName(data) {
  if (!data.name) {
    const error = new Error("Shop name is required");
    error.statusCode = 400;
    throw error;
  }
}

function sendError(res, error) {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || "Internal server error",
  });
}

export async function listShops(req, res) {
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

    return res.json(shops);
  } catch (error) {
    return sendError(res, error);
  }
}


export async function getShopById(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Shop id is required." });
    }

    const [where, select] = await Promise.all([
      buildPawnShopWhere({ id }),
      buildPawnShopSelect(),
    ]);

    const shop = await prisma.pawnShop.findFirst({
      where,
      select,
    });

    if (!shop) {
      return res.status(404).json({ error: "Shop not found." });
    }

    return res.json(shop);
  } catch (error) {
    console.error("Failed to get shop by id:", error);
    return res.status(500).json({ error: "Failed to load shop." });
  }
}

export async function myShops(req, res) {
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

    return res.json(shops);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createShop(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const data = pickShopWriteData(req.body, userId);
    assertShopName(data);

    const select = await buildPawnShopSelect();

    const shop = await prisma.pawnShop.create({
      data,
      select,
    });

    return res.status(201).json(shop);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateShop(req, res) {
  try {
    const id = req.params.id;
    const select = await buildPawnShopSelect(["ownerId", "isDeleted"]);

    const shop = await prisma.pawnShop.findUnique({
      where: { id },
      select,
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({ success: false, error: "Shop not found" });
    }

    if (req.user.role !== "ADMIN" && shop.ownerId !== req.user.sub) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const data = pickShopWriteData(req.body);

    const updated = await prisma.pawnShop.update({
      where: { id },
      data,
      select,
    });

    return res.json(updated);
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * Public: shop page inventory
 * GET /shops/:id/items
 */
export async function getShopItems(req, res) {
  try {
    const id = req.params.id;
    const shopSelect = await buildPawnShopSelect();

    const shop = await prisma.pawnShop.findUnique({
      where: { id },
      select: shopSelect,
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({ success: false, error: "Shop not found" });
    }

    const items = await prisma.item.findMany({
      where: {
        pawnShopId: id,
        isDeleted: false,
        status: "AVAILABLE",
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ shop, items });
  } catch (error) {
    return sendError(res, error);
  }
}
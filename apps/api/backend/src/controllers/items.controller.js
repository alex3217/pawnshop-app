import { prisma } from "../lib/prisma.js";
import { assertCanCreateListingForShop } from "../services/sellerPlan.service.js";

const ITEM_SAFE_FIELDS = [
  "id",
  "pawnShopId",
  "title",
  "description",
  "price",
  "currency",
  "images",
  "category",
  "condition",
  "status",
  "createdAt",
  "updatedAt",
  "isDeleted",
];

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
  "subscriptionBillingInterval",
];

const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const rows = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;

  const columns = new Set(
    Array.isArray(rows) ? rows.map((row) => row.column_name) : []
  );

  tableColumnsCache.set(tableName, columns);
  return columns;
}

async function buildScalarSelect(tableName, requestedFields) {
  const actualColumns = await getTableColumns(tableName);
  const select = {};

  for (const field of requestedFields) {
    if (actualColumns.has(field)) {
      select[field] = true;
    }
  }

  if (!select.id) {
    throw new Error(`${tableName} schema is invalid: missing required "id" column`);
  }

  return select;
}

async function buildPawnShopSelect(extraFields = []) {
  return buildScalarSelect("PawnShop", [...PAWNSHOP_SAFE_FIELDS, ...extraFields]);
}

async function buildItemSelect({ includeShop = false, extraFields = [] } = {}) {
  const select = await buildScalarSelect("Item", [...ITEM_SAFE_FIELDS, ...extraFields]);

  if (includeShop) {
    select.shop = { select: await buildPawnShopSelect() };
  }

  return select;
}

async function buildItemWhere(base = {}) {
  const itemColumns = await getTableColumns("Item");

  return {
    ...base,
    ...(itemColumns.has("isDeleted") ? { isDeleted: false } : {}),
  };
}

async function buildPawnShopWhere(base = {}) {
  const shopColumns = await getTableColumns("PawnShop");

  return {
    ...base,
    ...(shopColumns.has("isDeleted") ? { isDeleted: false } : {}),
  };
}

function toPositivePage(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeString(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeStringOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeImages(images) {
  if (images === undefined) return undefined;
  if (images === null) return [];
  if (!Array.isArray(images)) return null;

  return images
    .filter((img) => typeof img === "string")
    .map((img) => img.trim())
    .filter(Boolean);
}

function resolveShopId(body = {}) {
  return normalizeString(body.pawnShopId ?? body.shopId);
}

function resolveTitle(body = {}) {
  return normalizeString(body.title ?? body.name);
}

function resolvePrice(body = {}) {
  const direct = body.price;
  const cents = body.priceCents;

  if (direct !== undefined && direct !== null && direct !== "") {
    return toNullableNumber(direct);
  }

  if (cents !== undefined && cents !== null && cents !== "") {
    return toNullableNumber(cents);
  }

  return undefined;
}

function resolveStatus(body = {}) {
  return normalizeStringOrNull(body.status);
}

function handleControllerError(res, err, fallback = "Internal Server Error") {
  const statusCode = Number(err?.statusCode) || 500;
  const message = err?.message || fallback;
  return res.status(statusCode).json({ error: message });
}

export async function listItems(req, res) {
  try {
    const {
      q,
      category,
      shopId,
      pawnShopId,
      minPrice,
      maxPrice,
      page = "1",
      limit = "20",
    } = req.query;

    const pageNum = toPositivePage(page, 1);
    const pageSize = Math.min(100, toPositivePage(limit, 20));

    const min = toNullableNumber(minPrice);
    const max = toNullableNumber(maxPrice);

    if (Number.isNaN(min) || Number.isNaN(max)) {
      return res.status(400).json({ error: "Invalid price filter" });
    }

    const itemColumns = await getTableColumns("Item");
    const orFilters = [];

    if (q && itemColumns.has("title")) {
      orFilters.push({ title: { contains: String(q), mode: "insensitive" } });
    }

    if (q && itemColumns.has("description")) {
      orFilters.push({ description: { contains: String(q), mode: "insensitive" } });
    }

    const where = await buildItemWhere({
      ...(itemColumns.has("status") ? { status: "AVAILABLE" } : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
      ...(category && itemColumns.has("category") ? { category: String(category) } : {}),
      ...((shopId || pawnShopId) && itemColumns.has("pawnShopId")
        ? { pawnShopId: String(shopId || pawnShopId) }
        : {}),
      ...(itemColumns.has("price") && (min !== undefined || max !== undefined)
        ? {
            price: {
              ...(min !== undefined ? { gte: min } : {}),
              ...(max !== undefined ? { lte: max } : {}),
            },
          }
        : {}),
    });

    const select = await buildItemSelect({ includeShop: true });

    const [total, rows] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select,
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return res.json({
      page: pageNum,
      limit: pageSize,
      total,
      rows,
    });
  } catch (err) {
    return handleControllerError(res, err, "Failed to list items");
  }
}

export async function getItem(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing item id" });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      select: await buildItemSelect({ includeShop: true }),
    });

    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Item not found" });
    }

    return res.json(item);
  } catch (err) {
    return handleControllerError(res, err, "Failed to get item");
  }
}

export async function listMyItems(req, res) {
  try {
    const shops = await prisma.pawnShop.findMany({
      where: await buildPawnShopWhere({ ownerId: req.user.sub }),
      select: { id: true },
    });

    const shopIds = shops.map((shop) => shop.id);

    if (shopIds.length === 0) {
      return res.json([]);
    }

    const items = await prisma.item.findMany({
      where: await buildItemWhere({
        pawnShopId: { in: shopIds },
      }),
      orderBy: { createdAt: "desc" },
      select: await buildItemSelect({ includeShop: true }),
    });

    return res.json(items);
  } catch (err) {
    return handleControllerError(res, err, "Failed to list owner items");
  }
}

export async function createItem(req, res) {
  try {
    const rawBody = req.body || {};

    const pawnShopId = resolveShopId(rawBody);
    const title = resolveTitle(rawBody);
    const description = normalizeStringOrNull(rawBody.description);
    const category = normalizeStringOrNull(rawBody.category);
    const condition = normalizeStringOrNull(rawBody.condition);
    const images = normalizeImages(rawBody.images ?? []);
    const price = resolvePrice(rawBody);
    const requestedStatus = resolveStatus(rawBody);

    if (!pawnShopId || !title || price === undefined) {
      return res.status(400).json({
        error: "Missing fields",
        required: ["pawnShopId|shopId", "title|name", "price|priceCents"],
      });
    }

    if (images === null) {
      return res.status(400).json({ error: "Images must be an array of strings" });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Invalid price" });
    }

    const shop = await prisma.pawnShop.findUnique({
      where: { id: pawnShopId },
      select: {
        id: true,
        ownerId: true,
        ...(await buildPawnShopSelect(["isDeleted"])),
      },
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({ error: "Shop not found" });
    }

    if (req.user.role !== "ADMIN" && shop.ownerId !== req.user.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await assertCanCreateListingForShop(pawnShopId);

    const itemColumns = await getTableColumns("Item");
    const data = {
      ...(itemColumns.has("pawnShopId") ? { pawnShopId } : {}),
      ...(itemColumns.has("title") ? { title } : {}),
      ...(itemColumns.has("description") ? { description } : {}),
      ...(itemColumns.has("price") ? { price: Number(price) } : {}),
      ...(itemColumns.has("images") ? { images } : {}),
      ...(itemColumns.has("category") ? { category } : {}),
      ...(itemColumns.has("condition") ? { condition } : {}),
      ...(itemColumns.has("status")
        ? { status: requestedStatus || "AVAILABLE" }
        : {}),
      ...(itemColumns.has("currency") && rawBody.currency
        ? { currency: normalizeString(rawBody.currency) }
        : {}),
    };

    const item = await prisma.item.create({
      data,
      select: await buildItemSelect({ includeShop: true }),
    });

    return res.status(201).json(item);
  } catch (err) {
    return handleControllerError(res, err, "Failed to create item");
  }
}

export async function updateItem(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing item id" });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        isDeleted: true,
        shop: { select: { ownerId: true } },
      },
    });

    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (req.user.role !== "ADMIN" && item.shop?.ownerId !== req.user.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const rawBody = req.body || {};

    const title = resolveTitle(rawBody);
    const description = normalizeStringOrNull(rawBody.description);
    const category = normalizeStringOrNull(rawBody.category);
    const condition = normalizeStringOrNull(rawBody.condition);
    const status = resolveStatus(rawBody);
    const images = normalizeImages(rawBody.images);
    const price = resolvePrice(rawBody);

    if (images === null) {
      return res.status(400).json({ error: "Images must be an array of strings" });
    }

    if (
      (rawBody.price !== undefined || rawBody.priceCents !== undefined) &&
      (!Number.isFinite(price) || price < 0)
    ) {
      return res.status(400).json({ error: "Invalid price" });
    }

    const itemColumns = await getTableColumns("Item");
    const data = {
      ...(rawBody.title !== undefined || rawBody.name !== undefined
        ? itemColumns.has("title")
          ? { title }
          : {}
        : {}),
      ...(rawBody.description !== undefined && itemColumns.has("description")
        ? { description }
        : {}),
      ...(rawBody.price !== undefined || rawBody.priceCents !== undefined
        ? itemColumns.has("price")
          ? { price: Number(price) }
          : {}
        : {}),
      ...(rawBody.images !== undefined && itemColumns.has("images")
        ? { images }
        : {}),
      ...(rawBody.category !== undefined && itemColumns.has("category")
        ? { category }
        : {}),
      ...(rawBody.condition !== undefined && itemColumns.has("condition")
        ? { condition }
        : {}),
      ...(rawBody.status !== undefined && itemColumns.has("status")
        ? { status }
        : {}),
      ...(rawBody.currency !== undefined && itemColumns.has("currency")
        ? { currency: normalizeStringOrNull(rawBody.currency) }
        : {}),
    };

    const updated = await prisma.item.update({
      where: { id },
      data,
      select: await buildItemSelect({ includeShop: true }),
    });

    return res.json(updated);
  } catch (err) {
    return handleControllerError(res, err, "Failed to update item");
  }
}

export async function deleteItem(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing item id" });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        isDeleted: true,
        shop: { select: { ownerId: true } },
      },
    });

    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (req.user.role !== "ADMIN" && item.shop?.ownerId !== req.user.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const itemColumns = await getTableColumns("Item");

    if (itemColumns.has("isDeleted")) {
      await prisma.item.update({
        where: { id },
        data: { isDeleted: true },
      });
    } else {
      await prisma.item.delete({
        where: { id },
      });
    }

    return res.status(204).end();
  } catch (err) {
    return handleControllerError(res, err, "Failed to delete item");
  }
}

export async function scanItem(req, res) {
  try {
    const rawBody = req.body || {};
    const shopId = resolveShopId(rawBody);
    const code = normalizeString(rawBody.code);

    if (!shopId || !code) {
      return res.status(400).json({
        error: "shopId and code are required",
      });
    }

    const shop = await prisma.pawnShop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        ownerId: true,
        ...(await buildPawnShopSelect(["isDeleted"])),
      },
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({ error: "Shop not found" });
    }

    if (req.user.role !== "ADMIN" && shop.ownerId !== req.user.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const itemColumns = await getTableColumns("Item");
    const lookupWhere = await buildItemWhere({
      ...(itemColumns.has("pawnShopId") ? { pawnShopId: shopId } : {}),
      ...(itemColumns.has("title")
        ? { title: { contains: code, mode: "insensitive" } }
        : {}),
    });

    const existing = await prisma.item.findFirst({
      where: lookupWhere,
      select: await buildItemSelect({ includeShop: true }),
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return res.json({
        data: {
          item: existing,
          source: "existing-item-match",
          code,
        },
      });
    }

    const normalizedCode = String(code).trim().toUpperCase();

    let payload = {
      pawnShopId: shopId,
      title: `Scanned Item ${normalizedCode}`,
      description: `Created from scan code ${normalizedCode}`,
      price: "100",
      category: "Electronics",
      condition: "Good",
      source: "scan-console",
      code: normalizedCode,
    };

    if (/UPC|BARCODE|EAN/.test(normalizedCode)) {
      payload = {
        ...payload,
        title: `Scanned Barcode ${normalizedCode}`,
        description: `Barcode lookup result for ${normalizedCode}`,
      };
    }

    return res.json({
      data: payload,
    });
  } catch (err) {
    return handleControllerError(res, err, "Failed to resolve scan");
  }
}

export async function sellItem(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing item id" });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        isDeleted: true,
        shop: { select: { ownerId: true } },
      },
    });

    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (req.user.role !== "ADMIN" && item.shop?.ownerId !== req.user.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await prisma.item.update({
      where: { id },
      data: { status: "SOLD" },
      select: await buildItemSelect({ includeShop: true }),
    });

    return res.json({
      success: true,
      item: updated,
    });
  } catch (err) {
    return handleControllerError(res, err, "Failed to mark item sold");
  }
}

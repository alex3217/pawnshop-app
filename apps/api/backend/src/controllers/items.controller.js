import { prisma } from "../lib/prisma.js";
import { canAccessShopWithStaffPermission, getStaffAccessibleShopIds } from "../middleware/staffAccess.middleware.js";
import { assertCanCreateListingForShop } from "../services/sellerPlan.service.js";
import { recordItemIntakeScan } from "../services/itemIntake.service.js";
import {
  calculateItemPriceComparison,
  coordinatesAreValid,
} from "../services/itemPriceComparison.service.js";

const VALID_CATEGORIES = [
  "Jewelry",
  "Electronics",
  "Musical Instruments",
  "Tools",
  "Collectibles",
  "Watches",
  "Designer Goods",
  "Sports Equipment",
  "Appliances",
  "Vehicles",
  "Other",
];

const VALID_CONDITIONS = [
  "New",
  "Like New",
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "For Parts",
];

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
  "city",
  "state",
  "zip",
  "latitude",
  "longitude",
  "phone",
  "description",
  "hours",
  "ownerId",
  "createdAt",
  "updatedAt",
  "isDeleted",
  "subscriptionBillingInterval",];

const tableColumnsCache = new Map();

const PRICE_COMPARISON_DEFAULTS = Object.freeze({
  radiusMiles: 25,
  freshnessDays: 30,
  perShopCap: 3,
  candidateLimit: 500,
});

const PRICE_COMPARISON_LIMITS = Object.freeze({
  radiusMiles: { minimum: 1, maximum: 100 },
  freshnessDays: { minimum: 1, maximum: 180 },
  perShopCap: { minimum: 1, maximum: 10 },
});

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseBoundedInteger(
  value,
  {
    name,
    fallback,
    minimum,
    maximum,
  },
) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed)
    || parsed < minimum
    || parsed > maximum
  ) {
    throw createHttpError(
      400,
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return parsed;
}

function buildPriceComparisonCoordinateBounds(
  latitude,
  longitude,
  radiusMiles,
) {
  if (!coordinatesAreValid(latitude, longitude)) {
    return null;
  }

  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  const latitudeDelta = Number(radiusMiles) / 69;
  const longitudeScale = Math.abs(
    Math.cos((numericLatitude * Math.PI) / 180),
  );
  const longitudeDelta =
    longitudeScale < 0.01
      ? 180
      : Math.min(
          180,
          Number(radiusMiles) / (69 * longitudeScale),
        );

  const minimumLongitude = numericLongitude - longitudeDelta;
  const maximumLongitude = numericLongitude + longitudeDelta;

  return {
    latitude: {
      gte: Math.max(-90, numericLatitude - latitudeDelta),
      lte: Math.min(90, numericLatitude + latitudeDelta),
    },
    ...(minimumLongitude >= -180 && maximumLongitude <= 180
      ? {
          longitude: {
            gte: minimumLongitude,
            lte: maximumLongitude,
          },
        }
      : {}),
  };
}

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
    Array.isArray(rows) ? rows.map((row) => row.column_name) : [],
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
  const select = await buildScalarSelect("Item", [
    ...ITEM_SAFE_FIELDS,
    ...extraFields,
  ]);

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

function validateCategory(category) {
  if (category === undefined || category === null) return;
  if (!VALID_CATEGORIES.includes(category)) {
    throw createHttpError(400, `Invalid category. Allowed: ${VALID_CATEGORIES.join(", ")}`);
  }
}

function validateCondition(condition) {
  if (condition === undefined || condition === null) return;
  if (!VALID_CONDITIONS.includes(condition)) {
    throw createHttpError(400, `Invalid condition. Allowed: ${VALID_CONDITIONS.join(", ")}`);
  }
}


function normalizeSort(value) {
  const sort = normalizeString(value) || "newest";

  const allowed = new Set([
    "newest",
    "oldest",
    "price_asc",
    "price_desc",
    "title_asc",
    "title_desc",
  ]);

  if (!allowed.has(sort)) {
    throw createHttpError(
      400,
      "Invalid sort. Allowed: newest, oldest, price_asc, price_desc, title_asc, title_desc",
    );
  }

  return sort;
}

function buildItemOrderBy(sort, itemColumns) {
  if (sort === "price_asc" && itemColumns.has("price")) return { price: "asc" };
  if (sort === "price_desc" && itemColumns.has("price")) return { price: "desc" };
  if (sort === "title_asc" && itemColumns.has("title")) return { title: "asc" };
  if (sort === "title_desc" && itemColumns.has("title")) return { title: "desc" };
  if (sort === "oldest" && itemColumns.has("createdAt")) return { createdAt: "asc" };
  if (itemColumns.has("createdAt")) return { createdAt: "desc" };

  return { id: "desc" };
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
      category: rawCategory,
      condition: rawCondition,
      shopId,
      pawnShopId,
      minPrice,
      maxPrice,
      sort: rawSort = "newest",
      page = "1",
      limit = "20",
    } = req.query;

    const category = normalizeString(rawCategory);
    const condition = normalizeString(rawCondition);
    const sort = normalizeSort(rawSort);

    validateCategory(category);
    validateCondition(condition);

    const pageNum = toPositivePage(page, 1);
    const pageSize = Math.min(100, toPositivePage(limit, 20));

    const min = toNullableNumber(minPrice);
    const max = toNullableNumber(maxPrice);

    if (Number.isNaN(min) || Number.isNaN(max)) {
      return res.status(400).json({ error: "Invalid price filter" });
    }

    const itemColumns = await getTableColumns("Item");
    const orderBy = buildItemOrderBy(sort, itemColumns);
    const orFilters = [];

    if (q && itemColumns.has("title")) {
      orFilters.push({ title: { contains: String(q), mode: "insensitive" } });
    }

    if (q && itemColumns.has("description")) {
      orFilters.push({
        description: { contains: String(q), mode: "insensitive" },
      });
    }

    const where = await buildItemWhere({
      ...(itemColumns.has("status") ? { status: "AVAILABLE" } : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
      ...(category && itemColumns.has("category") ? { category } : {}),
      ...(condition && itemColumns.has("condition") ? { condition } : {}),
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
        orderBy,
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


function canWriteInventoryForShop(req, shopId, ownerId) {
  const role = String(req?.user?.role || "").toUpperCase();

  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (role === "OWNER" && ownerId === req?.user?.sub) return true;

  return canAccessShopWithStaffPermission(req, "inventory:write", shopId);
}

async function getInventoryReadableShopIds(req) {
  const role = String(req?.user?.role || "").toUpperCase();

  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    const shops = await prisma.pawnShop.findMany({
      where: await buildPawnShopWhere(),
      select: { id: true },
    });

    return shops.map((shop) => shop.id);
  }

  if (role === "OWNER") {
    const shops = await prisma.pawnShop.findMany({
      where: await buildPawnShopWhere({ ownerId: req.user.sub }),
      select: { id: true },
    });

    return shops.map((shop) => shop.id);
  }

  return getStaffAccessibleShopIds(req, "inventory:read");
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


export async function getItemPriceComparison(req, res) {
  try {
    const id = String(req.params.id || "").trim();

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing item id",
      });
    }

    const radiusMiles = parseBoundedInteger(
      req.query?.radiusMiles,
      {
        name: "radiusMiles",
        fallback: PRICE_COMPARISON_DEFAULTS.radiusMiles,
        ...PRICE_COMPARISON_LIMITS.radiusMiles,
      },
    );

    const freshnessDays = parseBoundedInteger(
      req.query?.freshnessDays,
      {
        name: "freshnessDays",
        fallback: PRICE_COMPARISON_DEFAULTS.freshnessDays,
        ...PRICE_COMPARISON_LIMITS.freshnessDays,
      },
    );

    const perShopCap = parseBoundedInteger(
      req.query?.perShopCap,
      {
        name: "perShopCap",
        fallback: PRICE_COMPARISON_DEFAULTS.perShopCap,
        ...PRICE_COMPARISON_LIMITS.perShopCap,
      },
    );

    const target = await prisma.item.findUnique({
      where: { id },
      select: await buildItemSelect({ includeShop: true }),
    });

    if (
      !target
      || target.isDeleted
      || target.status !== "AVAILABLE"
      || target.shop?.isDeleted
    ) {
      return res.status(404).json({
        success: false,
        error: "Available item not found",
      });
    }

    const targetLatitude = target.shop?.latitude;
    const targetLongitude = target.shop?.longitude;
    const coordinateBounds =
      buildPriceComparisonCoordinateBounds(
        targetLatitude,
        targetLongitude,
        radiusMiles,
      );

    let candidates = [];
    let reason = null;

    if (!coordinateBounds) {
      reason = "SHOP_LOCATION_UNAVAILABLE";
    } else {
      const itemColumns = await getTableColumns("Item");
      const freshnessCutoff = new Date(
        Date.now()
          - freshnessDays * 24 * 60 * 60 * 1000,
      );

      const shopWhere = await buildPawnShopWhere(
        coordinateBounds,
      );

      const candidateWhere = await buildItemWhere({
        id: { not: id },
        ...(itemColumns.has("pawnShopId")
          ? {
              pawnShopId: {
                not: target.pawnShopId,
              },
            }
          : {}),
        ...(itemColumns.has("status")
          ? { status: "AVAILABLE" }
          : {}),
        ...(itemColumns.has("category")
          ? { category: target.category ?? null }
          : {}),
        ...(itemColumns.has("currency")
          ? { currency: target.currency }
          : {}),
        ...(itemColumns.has("createdAt")
          ? {
              createdAt: {
                gte: freshnessCutoff,
              },
            }
          : {}),
        shop: {
          is: shopWhere,
        },
      });

      candidates = await prisma.item.findMany({
        where: candidateWhere,
        select: await buildItemSelect({
          includeShop: true,
        }),
        orderBy: itemColumns.has("createdAt")
          ? [
              { createdAt: "desc" },
              { id: "asc" },
            ]
          : { id: "asc" },
        take: PRICE_COMPARISON_DEFAULTS.candidateLimit,
      });
    }

    const comparison = calculateItemPriceComparison({
      target,
      candidates,
      radiusMiles,
      freshnessDays,
      perShopCap,
    });

    if (!reason) {
      if (comparison.sampleCount === 0) {
        reason = "NO_COMPARABLES";
      } else if (comparison.score === null) {
        reason = "INSUFFICIENT_SAMPLE";
      }
    }

    const publicComparables =
      comparison.comparables.map((comparable) => ({
        id: comparable.id,
        title: comparable.title,
        price: comparable.price,
        currency: comparable.currency,
        category: comparable.category ?? null,
        condition: comparable.condition ?? null,
        shopId: comparable.shopId,
        shopName: comparable.shop?.name ?? null,
        distanceMiles: Number(
          Number(comparable.distanceMiles).toFixed(2),
        ),
        listedAt:
          comparable.createdAt
          ?? comparable.updatedAt
          ?? null,
      }));

    res.set("Cache-Control", "no-store");

    return res.json({
      success: true,
      itemId: target.id,
      radiusMiles,
      freshnessDays,
      perShopCap,
      reason,
      comparison: {
        ...comparison,
        comparables: publicComparables,
      },
    });
  } catch (err) {
    return handleControllerError(
      res,
      err,
      "Failed to calculate item price comparison",
    );
  }
}

export async function listMyItems(req, res) {
  try {
    const shopIds = await getInventoryReadableShopIds(req);

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

    validateCategory(category);
    validateCondition(condition);

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
        ...(await buildPawnShopSelect(["isDeleted"])),
      },
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({ error: "Shop not found" });
    }

    if (!canWriteInventoryForShop(req, shop.id || shopId, shop.ownerId)) {
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
        shop: { select: { id: true, ownerId: true } },
      },
    });

    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (!canWriteInventoryForShop(req, item.shop?.id, item.shop?.ownerId)) {
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

    if (rawBody.category !== undefined) validateCategory(category);
    if (rawBody.condition !== undefined) validateCondition(condition);

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
        shop: { select: { id: true, ownerId: true } },
      },
    });

    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (!canWriteInventoryForShop(req, item.shop?.id, item.shop?.ownerId)) {
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
    const destination = String(
      rawBody.destination || "SHOP_INVENTORY",
    )
      .trim()
      .toUpperCase();
    const customerId = normalizeString(
      rawBody.customerId,
    );

    if (!shopId || !code) {
      return res.status(400).json({
        error: "shopId and code are required",
      });
    }

    const shop = await prisma.pawnShop.findUnique({
      where: { id: shopId },
      select: {
        ...(await buildPawnShopSelect(["isDeleted"])),
      },
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({
        error: "Shop not found",
      });
    }

    if (
      !canWriteInventoryForShop(
        req,
        shop.id || shopId,
        shop.ownerId,
      )
    ) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    const customerRequired =
      destination === "CUSTOMER_SELL" ||
      destination === "CUSTOMER_PAWN";

    if (customerRequired && !customerId) {
      return res.status(400).json({
        error:
          "A customer must be selected for customer sell or pawn intake.",
      });
    }

    let customer = null;

    if (customerId) {
      customer = await prisma.user.findFirst({
        where: {
          id: customerId,
          role: "CONSUMER",
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      if (!customer) {
        return res.status(404).json({
          error:
            "Active customer account not found.",
        });
      }
    }

    const normalizedCode = String(code)
      .trim()
      .toUpperCase();

    const itemColumns =
      await getTableColumns("Item");

    const lookupWhere = await buildItemWhere({
      ...(itemColumns.has("pawnShopId")
        ? { pawnShopId: shopId }
        : {}),
      ...(itemColumns.has("title")
        ? {
            title: {
              contains: normalizedCode,
              mode: "insensitive",
            },
          }
        : {}),
    });

    const existing = await prisma.item.findFirst({
      where: lookupWhere,
      select: await buildItemSelect({
        includeShop: true,
      }),
      orderBy: {
        createdAt: "desc",
      },
    });

    const {
      intake,
      analysis,
    } = await recordItemIntakeScan({
      prismaClient: prisma,
      shopId,
      capturedByUserId:
        req?.user?.sub || null,
      code,
      input: {
        ...rawBody,
        destination,
        customerId: customer?.id || null,
      },
      existingItem: existing,
    });

    const intakeSummary = {
      intakeId: intake.id,
      intakeStatus: intake.status,
      duplicateStatus:
        intake.duplicateStatus,
      screeningStatus:
        intake.screeningStatus,
      destination: intake.destination,
      customerId: intake.customerId,
      codeType: intake.codeType,
    };

    if (existing) {
      return res.json({
        data: {
          item: existing,
          source: "existing-item-match",
          code: analysis.normalizedCode,
          ...intakeSummary,
        },
        intake,
      });
    }

    let payload = {
      pawnShopId: shopId,
      title:
        `Scanned Item ${analysis.normalizedCode}`,
      description:
        `Created from scan code ${analysis.normalizedCode}`,
      price: "100",
      category: "Electronics",
      condition: "Good",
      source: "scan-console",
      code: analysis.normalizedCode,
      ...intakeSummary,
    };

    if (
      ["UPC", "EAN", "BARCODE"].includes(
        analysis.codeType,
      )
    ) {
      payload = {
        ...payload,
        title:
          `Scanned Barcode ${analysis.normalizedCode}`,
        description:
          `Barcode lookup result for ${analysis.normalizedCode}`,
      };
    }

    return res.json({
      data: payload,
      intake,
    });
  } catch (err) {
    return handleControllerError(
      res,
      err,
      "Failed to resolve scan",
    );
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
        shop: { select: { id: true, ownerId: true } },
      },
    });

    if (!item || item.isDeleted) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (!canWriteInventoryForShop(req, item.shop?.id, item.shop?.ownerId)) {
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

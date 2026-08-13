import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  assertCanCreateLocationForOwner,
  getEffectivePlanCode,
} from "../services/sellerPlan.service.js";
import { calculateOwnerSetupProgress } from "../../../../../shared/ownerSetupChecklist.mjs";
import { isKnownSellerPlanCode } from "../config/sellerPlans.js";
import { deleteTrackedAssets, lockShopBrandingForUpdate, reconcileAssetUrls, rollbackTemporaryAssets } from "../services/uploadAssets.service.js";
import {
  coordinatesAreValid,
  getShopGeocoder,
  isCompleteShopAddress,
  normalizeShopAddress,
  shopAddressChanged,
} from "../services/shopGeocoding.service.js";
import { backfillShopCoordinates } from "../services/shopCoordinateBackfill.service.js";

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
  "city",
  "state",
  "zip",
  "country",
  "latitude",
  "longitude",
  "phone",
  "description",
  "hours",
  "logoUrl",
  "bannerUrl",
  "ownerId",
  "createdAt",
  "updatedAt",
  "isDeleted",];

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
  if (body.city !== undefined) data.city = normalizeString(body.city);
  if (body.state !== undefined) data.state = normalizeString(body.state)?.toUpperCase() ?? null;
  if (body.zip !== undefined || body.postalCode !== undefined) data.zip = normalizeString(body.zip ?? body.postalCode)?.toUpperCase() ?? null;
  if (body.country !== undefined) data.country = normalizeString(body.country)?.toUpperCase() ?? null;
  if (body.phone !== undefined) data.phone = normalizeString(body.phone);
  if (body.description !== undefined) data.description = normalizeString(body.description);
  if (body.hours !== undefined) data.hours = normalizeString(body.hours);
  if (body.logoUrl !== undefined) data.logoUrl = normalizeString(body.logoUrl);
  if (body.bannerUrl !== undefined) data.bannerUrl = normalizeString(body.bannerUrl);
  if (ownerId !== undefined) data.ownerId = ownerId;

  return data;
}

function addressFrom(shop = {}, changes = {}) {
  return normalizeShopAddress({
    address: changes.address !== undefined ? changes.address : shop.address,
    city: changes.city !== undefined ? changes.city : shop.city,
    state: changes.state !== undefined ? changes.state : shop.state,
    zip: changes.zip !== undefined ? changes.zip : shop.zip,
    country: changes.country !== undefined ? changes.country : shop.country,
  });
}

export async function geocodeWriteData(req, data, previous = {}) {
  const addressSubmitted = ["address", "city", "state", "zip", "country"].some((field) => data[field] !== undefined);
  if (!addressSubmitted) return data;
  const address = addressFrom(previous, data);
  const changed = shopAddressChanged(previous, address);
  if (!changed) return { ...data, ...address };
  if (!isCompleteShopAddress(address)) {
    const error = new Error("Enter a complete street address, city, state, ZIP/postal code, and country to update the shop location.");
    error.statusCode = 422;
    error.code = "ADDRESS_INCOMPLETE";
    throw error;
  }
  const result = await getShopGeocoder(req).geocode(address);
  if (!coordinatesAreValid(result.latitude, result.longitude)) {
    const error = new Error("The location provider returned invalid coordinates. Try again or contact PawnLoop support.");
    error.statusCode = 502;
    error.code = "INVALID_COORDINATES";
    throw error;
  }
  return { ...data, ...result.address, latitude: result.latitude, longitude: result.longitude };
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
    ...(error?.code ? { code: error.code } : {}),
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
      buildPawnShopSelect(["onboardingCompletedAt"]),
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

    let data = pickShopWriteData(req.body, userId);
    assertShopName(data);

    if (String(req.user?.role || "").toUpperCase() !== "SUPER_ADMIN") {
      await assertCanCreateLocationForOwner(userId);
    }

    data = await geocodeWriteData(req, data);
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

    if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN" && shop.ownerId !== req.user.sub) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    let data = pickShopWriteData(req.body);
    data = await geocodeWriteData(req, data, shop);

    const brandingChanged = req.body?.logoUrl !== undefined || req.body?.bannerUrl !== undefined;
    const submittedBranding = [data.logoUrl, data.bannerUrl].filter(Boolean);
    let removedAssets = [];
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const previous = await lockShopBrandingForUpdate(tx, id);
        if (!previous || previous.isDeleted) {
          const error = new Error("Shop not found");
          error.statusCode = 404;
          throw error;
        }
        const result = await tx.pawnShop.update({ where: { id }, data, select });
        if (brandingChanged) removedAssets = await reconcileAssetUrls({
          tx,
          shopId: id,
          previousUrls: [previous.logoUrl, previous.bannerUrl].filter(Boolean),
          nextUrls: [result.logoUrl, result.bannerUrl].filter(Boolean),
        });
        return result;
      });
    } catch (error) {
      if (brandingChanged) await rollbackTemporaryAssets({
        urls: submittedBranding,
        shopId: id,
        storage: req.app.locals.uploadStorage,
        requestId: req.requestId,
      }).catch(() => {});
      throw error;
    }
    await deleteTrackedAssets({ assets: removedAssets, storage: req.app.locals.uploadStorage, requestId: req.requestId });

    return res.json(updated);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function verifyShopLocation(req, res) {
  try {
    const id = req.params.id;
    const select = await buildPawnShopSelect(["ownerId", "isDeleted"]);
    const shop = await prisma.pawnShop.findUnique({ where: { id }, select });
    if (!shop || shop.isDeleted) return res.status(404).json({ success: false, error: "Shop not found" });
    if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN" && shop.ownerId !== req.user.sub) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const result = await getShopGeocoder(req).geocode(addressFrom(shop));
    if (!coordinatesAreValid(result.latitude, result.longitude)) {
      const error = new Error("The location provider returned invalid coordinates. Try again or contact PawnLoop support.");
      error.statusCode = 502;
      error.code = "INVALID_COORDINATES";
      throw error;
    }
    const updated = await prisma.pawnShop.update({
      where: { id },
      data: { ...result.address, latitude: result.latitude, longitude: result.longitude },
      select,
    });
    return res.json(updated);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function backfillShopLocations(req, res) {
  try {
    const report = await backfillShopCoordinates({
      prisma,
      geocoder: getShopGeocoder(req),
      dryRun: req.body?.dryRun !== false,
    });
    return res.json({
      ...report,
      counts: {
        updated: report.updated.length,
        skipped: report.skipped.length,
        failed: report.failed.length,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function loadOwnerSetupProgress(shopId, user, { hideForbidden = false } = {}) {
  const actualColumns = await getPawnShopColumns();
  const select = {
    id: true,
    name: true,
    address: true,
    phone: true,
    description: true,
    hours: true,
    ownerId: true,
    ...(actualColumns.has("isDeleted") ? { isDeleted: true } : {}),
    ...(actualColumns.has("onboardingCompletedAt") ? { onboardingCompletedAt: true } : {}),
    ...(actualColumns.has("subscriptionPlan") ? { subscriptionPlan: true } : {}),
    ...(actualColumns.has("subscriptionStatus") ? { subscriptionStatus: true } : {}),
    ...(actualColumns.has("subscriptionCurrentPeriodEnd") ? { subscriptionCurrentPeriodEnd: true } : {}),
  };
  const shop = await prisma.pawnShop.findFirst({
    where: await buildPawnShopWhere({ id: shopId }),
    select,
  });
  if (!shop || shop.isDeleted) {
    const error = new Error("Shop not found");
    error.statusCode = 404;
    throw error;
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && shop.ownerId !== user.sub) {
    const error = new Error(hideForbidden ? "Shop not found" : "Forbidden");
    error.statusCode = hideForbidden ? 404 : 403;
    throw error;
  }
  const [inventoryCount, staffCount] = await Promise.all([
    prisma.item.count({ where: { pawnShopId: shop.id, isDeleted: false } }),
    // The checklist promises an invitation, so both pending invitations and
    // accepted active memberships count. Disabled/archived records do not.
    prisma.staff.count({
      where: { shopId: shop.id, status: { in: ["INVITED", "ACTIVE"] } },
    }),
  ]);
  const hasText = (value) => typeof value === "string" && value.trim().length > 0;
  return calculateOwnerSetupProgress({
    shopCreated: true,
    shopName: hasText(shop.name),
    shopAddress: hasText(shop.address),
    shopPhone: hasText(shop.phone),
    shopHours: hasText(shop.hours),
    shopDescription: hasText(shop.description),
    sellerPlan: isKnownSellerPlanCode(getEffectivePlanCode(shop)),
    staff: staffCount > 0,
    inventory: inventoryCount > 0,
    launched: Boolean(shop.onboardingCompletedAt),
  });
}

export async function getShopOnboardingProgress(req, res) {
  try {
    return res.json(await loadOwnerSetupProgress(req.params.id, req.user));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function completeShopOnboarding(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const actualColumns = await getPawnShopColumns();
    if (!actualColumns.has("onboardingCompletedAt")) {
      pawnShopColumnsCache = null;
      return res.status(503).json({
        success: false,
        error:
          "Shop onboarding completion is not available until the database migration is applied.",
      });
    }

    const where = await buildPawnShopWhere({ id: req.params.id });
    const select = {
      id: true,
      ownerId: true,
      ...(actualColumns.has("isDeleted") ? { isDeleted: true } : {}),
      onboardingCompletedAt: true,
    };

    const shop = await prisma.pawnShop.findFirst({
      where,
      select,
    });

    if (!shop || shop.isDeleted) {
      return res.status(404).json({ success: false, error: "Shop not found" });
    }

    if (req.user.role !== "ADMIN" && shop.ownerId !== userId) {
      return res.status(404).json({ success: false, error: "Shop not found" });
    }

    const progress = await loadOwnerSetupProgress(shop.id, req.user, { hideForbidden: true });
    if (!progress.readyToLaunch) {
      return res.status(409).json({
        success: false,
        error: "Complete all required setup items before launching.",
        progress,
      });
    }

    if (shop.onboardingCompletedAt) {
      return res.status(200).json({
        success: true,
        shop: {
          id: shop.id,
          onboardingCompletedAt: shop.onboardingCompletedAt,
        },
      });
    }

    const completedShop = await prisma.pawnShop.update({
      where: { id: shop.id },
      data: { onboardingCompletedAt: new Date() },
      select: {
        id: true,
        onboardingCompletedAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      shop: completedShop,
    });
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

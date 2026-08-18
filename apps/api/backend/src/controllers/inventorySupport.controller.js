import { prisma } from "../lib/prisma.js";
import { canAccessShopWithStaffPermission } from "../middleware/staffAccess.middleware.js";
import {
  assertManagedPublicListingImages,
  deleteTrackedAssets,
  lockItemImagesForUpdate,
  reconcileAssetUrls,
} from "../services/uploadAssets.service.js";

const AVAILABILITY = new Set(["AVAILABLE", "RESERVED", "SOLD", "PAWNED", "LAYAWAY", "UNAVAILABLE", "ARCHIVED"]);
const LISTING_ACTIONS = new Map([["publish", "ACTIVE"], ["unpublish", "DRAFT"], ["archive", "REMOVED"], ["restore", "DRAFT"]]);
const MUTABLE_FIELDS = new Set(["title", "description", "condition", "sku", "barcode", "serialNumber", "quantity", "price", "cost", "locationId", "availability", "category", "images"]);
const PROTECTED_COMMERCE = ["PENDING", "PAYMENT_PROCESSING", "PAID", "FULFILLING", "COMPLETED", "DISPUTED"];
const LIFECYCLE = {
  AVAILABLE: new Set(["RESERVED", "SOLD", "PAWNED", "LAYAWAY", "UNAVAILABLE", "ARCHIVED"]),
  RESERVED: new Set(["AVAILABLE", "SOLD", "UNAVAILABLE", "ARCHIVED"]),
  SOLD: new Set(["ARCHIVED"]),
  PAWNED: new Set(["AVAILABLE", "SOLD", "LAYAWAY", "UNAVAILABLE", "ARCHIVED"]),
  LAYAWAY: new Set(["AVAILABLE", "SOLD", "UNAVAILABLE", "ARCHIVED"]),
  UNAVAILABLE: new Set(["AVAILABLE", "ARCHIVED"]),
  ARCHIVED: new Set(["AVAILABLE", "UNAVAILABLE", "SOLD"]),
};
const SUPPORT_SESSION_MAX_MS = 30 * 60 * 1000;

function http(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function actorId(req) { return text(req.superAdmin?.id || req.user?.sub); }
function send(req, res, error) {
  const status = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
  if (status === 500) (req.app?.locals?.logger || console).error("[inventory-support] request failed", { requestId: req.requestId || null, actorId: actorId(req), errorType: error?.name || "Error" });
  return res.status(status).json({
    success: false,
    error: status === 500 ? "Inventory support failed." : error.message,
    ...(error?.publicCode ? { code: error.publicCode } : {}),
  });
}
function reason(req) { const value = text(req.body?.reason); if (value.length < 8) throw http(400, "A specific support reason of at least 8 characters is required."); return value; }

function safeItem(item) {
  if (!item) return null;
  return Object.fromEntries(["id", "pawnShopId", "title", "description", "price", "cost", "currency", "images", "category", "condition", "status", "isDeleted", "sku", "barcode", "serialNumber", "quantity", "locationId", "availability", "createdAt", "updatedAt"].map((key) => [key, item[key] ?? null]));
}

async function session(req, shopId, { allowEnded = false } = {}) {
  const id = text(req.headers["x-support-session-id"] || req.body?.supportSessionId);
  if (!id) throw http(400, "An active support session is required.");
  const now = new Date();
  const row = await prisma.inventorySupportSession.findFirst({ where: { id, shopId, actorId: actorId(req), ...(allowEnded ? {} : { endedAt: null, expiresAt: { gt: now } }) } });
  if (!row && !allowEnded) await prisma.inventorySupportSession.updateMany({ where: { id, shopId, actorId: actorId(req), endedAt: null, expiresAt: { lte: now } }, data: { endedAt: now } });
  if (!row) throw http(403, "Support session is invalid, ended, or belongs to another shop.");
  return row;
}

async function notifyOwner(tx, shop, item, action) {
  await tx.notification.create({ data: { userId: shop.ownerId, type: "ADMIN_INVENTORY_CHANGE", title: "Administrative inventory change", message: `${action.replaceAll("_", " ").toLowerCase()}: ${item?.title || "inventory"} at ${shop.name}.`, actionUrl: item?.id ? `/owner/inventory?itemId=${item.id}` : "/owner/inventory", dedupeKey: `admin-inventory:${action}:${item?.id || shop.id}:${Date.now()}` } });
}

export async function assertCommerceSafe(tx, item, updates) {
  if (!item) return;
  const material = updates.availability || updates.quantity !== undefined || updates.price !== undefined || updates.locationId !== undefined || updates.images;
  if (!material) return;
  const constrainsListedInventory = (AVAILABILITY.has(updates.availability) && updates.availability !== "AVAILABLE") || updates.quantity !== undefined;
  const [auction, offer, listing, transaction] = await Promise.all([
    tx.auction.findFirst({ where: { itemId: item.id, status: { in: ["SCHEDULED", "LIVE"] } }, select: { id: true } }),
    tx.offer.findFirst({ where: { itemId: item.id, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } }, select: { id: true } }),
    tx.marketplaceListing.findFirst({ where: { itemId: item.id, status: { in: constrainsListedInventory ? ["ACTIVE", "RESERVED", "SOLD"] : ["RESERVED", "SOLD"] } }, select: { id: true } }),
    tx.marketplaceTransaction.findFirst({ where: { listing: { itemId: item.id }, status: { in: PROTECTED_COMMERCE } }, select: { id: true } }),
  ]);
  if (auction || offer || listing || transaction) throw http(409, "This item has an active auction, offer, reservation, purchase, or fulfillment and cannot be materially changed.");
}

export async function startInventorySupport(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId);
    const shop = await prisma.pawnShop.findFirst({ where: { id: shopId, isDeleted: false }, select: { id: true, name: true } });
    if (!shop) throw http(404, "Shop not found.");
    const session = await prisma.$transaction(async (tx) => {
      await tx.inventorySupportSession.updateMany({ where: { actorId: actorId(req), endedAt: null }, data: { endedAt: new Date() } });
      const created = await tx.inventorySupportSession.create({ data: { shopId, actorId: actorId(req), reason: why, requestId: req.requestId || null, expiresAt: new Date(Date.now() + SUPPORT_SESSION_MAX_MS) } });
      await tx.inventoryAdminEvent.create({ data: { shopId, actorId: actorId(req), supportSessionId: created.id, action: "SUPPORT_SESSION_STARTED", reason: why, requestId: req.requestId || null, afterState: { shopName: shop.name } } });
      return created;
    });
    return res.status(201).json({ success: true, session, shop });
  } catch (error) {
    const mapped = error?.code === "P2002" ? Object.assign(new Error("Another support session became active; retry the request."), { statusCode: 409 }) : error;
    return send(req, res, mapped);
  }
}

export async function endInventorySupport(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId); const active = await session(req, shopId);
    const ended = await prisma.$transaction(async (tx) => {
      const row = await tx.inventorySupportSession.update({ where: { id: active.id }, data: { endedAt: new Date() } });
      await tx.inventoryAdminEvent.create({ data: { shopId, actorId: actorId(req), supportSessionId: active.id, action: "SUPPORT_SESSION_ENDED", reason: why, requestId: req.requestId || null } }); return row;
    });
    return res.json({ success: true, session: ended });
  } catch (error) { return send(req, res, error); }
}

export async function listSupportInventory(req, res) {
  try {
    const shopId = text(req.params.shopId); await session(req, shopId);
    const q = text(req.query.q); const where = { pawnShopId: shopId, ...(req.query.archived === "true" ? {} : { isDeleted: false }), ...(req.query.category ? { category: text(req.query.category) } : {}), ...(req.query.condition ? { condition: text(req.query.condition) } : {}), ...(req.query.availability ? { availability: text(req.query.availability).toUpperCase() } : {}), ...(req.query.locationId ? { locationId: text(req.query.locationId) } : {}), ...(q ? { OR: ["title", "sku", "barcode", "serialNumber", "category", "condition"].map((field) => ({ [field]: { contains: q, mode: "insensitive" } })) } : {}) };
    const items = await prisma.item.findMany({ where, include: { location: true, marketplaceListings: { select: { id: true, status: true, updatedAt: true } } }, orderBy: { updatedAt: "desc" } });
    return res.json({ success: true, items });
  } catch (error) { return send(req, res, error); }
}

export async function createSupportInventory(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId); const active = await session(req, shopId);
    const quantity = Number(req.body.quantity ?? 1); const price = Number(req.body.price ?? 0); const cost = req.body.cost === undefined || req.body.cost === "" || req.body.cost === null ? null : Number(req.body.cost); const availability = text(req.body.availability || "AVAILABLE").toUpperCase();
    if (!text(req.body.title)) throw http(400, "Item title is required.");
    if (!Number.isInteger(quantity) || quantity < 0) throw http(400, "Quantity must be a non-negative integer.");
    if (!Number.isFinite(price) || price < 0 || (cost !== null && (!Number.isFinite(cost) || cost < 0)) || !AVAILABILITY.has(availability)) throw http(400, "Invalid price, cost, or availability.");
    const locationId = text(req.body.locationId) || null;
    if (locationId && !(await prisma.inventoryLocation.findFirst({ where: { id: locationId, shopId, isArchived: false } }))) throw http(400, "Location must belong to the selected shop.");
    if (req.body.images !== undefined && !Array.isArray(req.body.images)) throw http(400, "Images must be an ordered array.");
    if (req.body.images?.length) throw http(400, "Create the item before attaching managed image uploads.");
    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.pawnShop.findUnique({ where: { id: shopId }, select: { id: true, name: true, ownerId: true } }); if (!shop) throw http(404, "Shop not found.");
      const item = await tx.item.create({ data: { pawnShopId: shopId, title: text(req.body.title), description: text(req.body.description) || null, price, cost, currency: "USD", images: Array.isArray(req.body.images) ? req.body.images.map(text).filter(Boolean) : [], category: text(req.body.category) || null, condition: text(req.body.condition) || null, sku: text(req.body.sku) || null, barcode: text(req.body.barcode) || null, serialNumber: text(req.body.serialNumber) || null, quantity, locationId, availability, status: availability === "SOLD" ? "SOLD" : "AVAILABLE", isDeleted: availability === "ARCHIVED" } });
      await tx.inventoryAdminEvent.create({ data: { shopId, itemId: item.id, actorId: actorId(req), supportSessionId: active.id, action: "CREATE_INVENTORY", reason: why, requestId: req.requestId || null, afterState: safeItem(item) } }); await notifyOwner(tx, shop, item, "CREATE_INVENTORY"); return item;
    }); return res.status(201).json({ success: true, item: result });
  } catch (error) { return send(req, res, error); }
}

export async function updateSupportInventory(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId); const itemId = text(req.params.itemId); const active = await session(req, shopId); const data = {};
    for (const [key, value] of Object.entries(req.body || {})) if (MUTABLE_FIELDS.has(key)) data[key] = value;
    if (Object.keys(data).length === 0) throw http(400, "At least one supported inventory field is required.");
    if (data.title !== undefined) { data.title = text(data.title); if (!data.title) throw http(400, "Item title is required."); }
    if (data.quantity !== undefined) { data.quantity = Number(data.quantity); if (!Number.isInteger(data.quantity) || data.quantity < 0) throw http(400, "Quantity must be a non-negative integer."); }
    if (data.price !== undefined) { if (data.price === null || data.price === "") throw http(400, "price is required."); data.price = Number(data.price); if (!Number.isFinite(data.price) || data.price < 0) throw http(400, "price must be non-negative."); }
    if (data.cost !== undefined) { data.cost = data.cost === "" || data.cost === null ? null : Number(data.cost); if (data.cost !== null && (!Number.isFinite(data.cost) || data.cost < 0)) throw http(400, "cost must be non-negative."); }
    if (data.availability) { data.availability = text(data.availability).toUpperCase(); if (!AVAILABILITY.has(data.availability)) throw http(400, "Invalid availability."); if (data.availability !== "ARCHIVED") data.status = data.availability === "SOLD" ? "SOLD" : "AVAILABLE"; data.isDeleted = data.availability === "ARCHIVED"; }
    if (data.images !== undefined && !Array.isArray(data.images)) throw http(400, "Images must be an ordered array.");
    if (data.locationId !== undefined) { data.locationId = text(data.locationId) || null; if (data.locationId && !(await prisma.inventoryLocation.findFirst({ where: { id: data.locationId, shopId, isArchived: false } }))) throw http(400, "Location must belong to the selected shop."); }
    if (data.images !== undefined) data.images = data.images.map(text).filter(Boolean);
    let removedAssets = [];
    const result = await prisma.$transaction(async (tx) => {
      const before = await lockItemImagesForUpdate(tx, itemId);
      const restoringArchived = before?.isDeleted && data.availability && data.availability !== "ARCHIVED";
      if (!before || (before.isDeleted && !restoringArchived) || before.pawnShopId !== shopId) throw http(404, "Inventory item not found in selected shop.");
      const fullBefore = await tx.item.findUnique({ where: { id: itemId } });
      if (fullBefore.availability === "ARCHIVED" && fullBefore.status === "SOLD" && data.availability === "AVAILABLE") { data.availability = "SOLD"; data.status = "SOLD"; data.isDeleted = false; }
      if (data.availability && data.availability !== fullBefore.availability && !LIFECYCLE[fullBefore.availability]?.has(data.availability)) throw http(409, `Invalid inventory lifecycle transition: ${fullBefore.availability} to ${data.availability}.`);
      await assertCommerceSafe(tx, fullBefore, data);
      const item = await tx.item.update({ where: { id: itemId }, data });
      if (data.images !== undefined) removedAssets = await reconcileAssetUrls({ tx, shopId, itemId, uploaderId: actorId(req), previousUrls: before.images || [], nextUrls: item.images || [], requireManaged: true });
      const shop = await tx.pawnShop.findUnique({ where: { id: shopId }, select: { id: true, name: true, ownerId: true } });
      await tx.inventoryAdminEvent.create({ data: { shopId, itemId, actorId: actorId(req), supportSessionId: active.id, action: "UPDATE_INVENTORY", reason: why, requestId: req.requestId || null, beforeState: safeItem(fullBefore), afterState: safeItem(item) } });
      await notifyOwner(tx, shop, item, "UPDATE_INVENTORY");
      return item;
    });
    await deleteTrackedAssets({ assets: removedAssets, storage: req.app.locals.uploadStorage, requestId: req.requestId });
    return res.json({ success: true, item: result });
  } catch (error) { return send(req, res, error); }
}

export async function changeListingState(req, res) {
  try {
    const why = reason(req);
    const shopId = text(req.params.shopId);
    const itemId = text(req.params.itemId);
    const action = text(req.body.action).toLowerCase();
    const next = LISTING_ACTIONS.get(action);
    if (!next) throw http(400, "Invalid listing action.");
    const active = await session(req, shopId);
    const result = await prisma.$transaction(async (tx) => {
      const locked = await lockItemImagesForUpdate(tx, itemId);
      if (!locked || locked.pawnShopId !== shopId) throw http(404, "Item not found.");
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (action === "publish" && (item.isDeleted || item.availability !== "AVAILABLE" || item.quantity < 1)) {
        throw http(409, "Only available, in-stock inventory can be published.");
      }
      await assertCommerceSafe(tx, item, { availability: action });
      const activeListings = await tx.marketplaceListing.findMany({
        where: { itemId, status: "ACTIVE" },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 2,
      });
      if (activeListings.length > 1) throw http(409, "Multiple active marketplace listings require manual resolution.");
      const listing = activeListings[0] || await tx.marketplaceListing.findFirst({
        where: { itemId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      if (!listing) throw http(409, "This inventory item has no existing marketplace listing.");
      if (["RESERVED", "SOLD"].includes(listing.status)) throw http(409, "Reserved or sold listings cannot be changed from support mode.");
      if (next === "ACTIVE") {
        await assertManagedPublicListingImages({ listing, prismaClient: tx });
      }
      const updated = await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: { status: next, ...(next === "ACTIVE" ? { publishedAt: new Date() } : {}) },
      });
      const shop = await tx.pawnShop.findUnique({ where: { id: shopId }, select: { id: true, name: true, ownerId: true } });
      await tx.inventoryAdminEvent.create({ data: { shopId, itemId, actorId: actorId(req), supportSessionId: active.id, action: `LISTING_${action.toUpperCase()}`, reason: why, requestId: req.requestId || null, beforeState: { id: listing.id, status: listing.status }, afterState: { id: updated.id, status: updated.status } } });
      await notifyOwner(tx, shop, item, `LISTING_${action.toUpperCase()}`);
      return updated;
    });
    return res.json({ success: true, listing: result });
  } catch (error) { return send(req, res, error); }
}

export async function listInventoryHistory(req, res) {
  try { const shopId = text(req.params.shopId); await session(req, shopId); const itemId = text(req.params.itemId); const events = await prisma.inventoryAdminEvent.findMany({ where: { shopId, ...(itemId ? { itemId } : {}) }, include: { actor: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 200 }); return res.json({ success: true, events }); } catch (error) { return send(req, res, error); }
}

export async function listInventoryLocations(req, res) { try { const shopId = text(req.params.shopId); await session(req, shopId); return res.json({ success: true, locations: await prisma.inventoryLocation.findMany({ where: { shopId, isArchived: false }, orderBy: { name: "asc" } }) }); } catch (error) { return send(req, res, error); } }
export async function createInventoryLocation(req, res) { try { const why = reason(req); const shopId = text(req.params.shopId); const active = await session(req, shopId); const name = text(req.body.name); if (!name) throw http(400, "Location name is required."); const location = await prisma.$transaction(async (tx) => { const row = await tx.inventoryLocation.create({ data: { shopId, name } }); await tx.inventoryAdminEvent.create({ data: { shopId, actorId: actorId(req), supportSessionId: active.id, action: "CREATE_INVENTORY_LOCATION", reason: why, requestId: req.requestId || null, afterState: { id: row.id, name: row.name } } }); return row; }); return res.status(201).json({ success: true, location }); } catch (error) { return send(req, res, error); } }

export async function listOwnerInventoryAdminHistory(req, res) {
  try {
    const item = await prisma.item.findFirst({ where: { id: text(req.params.id) }, select: { id: true, pawnShopId: true, shop: { select: { ownerId: true } } } });
    const role = text(req.user?.role).toUpperCase();
    const authorized = item && (["ADMIN", "SUPER_ADMIN"].includes(role) || item.shop.ownerId === text(req.user?.sub) || canAccessShopWithStaffPermission(req, "inventory:read", item.pawnShopId));
    if (!authorized) throw http(404, "Readable inventory item not found.");
    const events = await prisma.inventoryAdminEvent.findMany({ where: { itemId: item.id, shopId: item.pawnShopId }, select: { id: true, action: true, reason: true, beforeState: true, afterState: true, requestId: true, createdAt: true, actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "desc" } });
    return res.json({ success: true, events });
  } catch (error) { return send(req, res, error); }
}

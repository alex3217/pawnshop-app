import { prisma } from "../lib/prisma.js";

const AVAILABILITY = new Set(["AVAILABLE", "RESERVED", "SOLD", "PAWNED", "LAYAWAY", "UNAVAILABLE", "ARCHIVED"]);
const LISTING_ACTIONS = new Map([["publish", "ACTIVE"], ["unpublish", "DRAFT"], ["archive", "REMOVED"], ["restore", "DRAFT"]]);
const MUTABLE_FIELDS = new Set(["title", "description", "condition", "sku", "barcode", "serialNumber", "quantity", "price", "cost", "locationId", "availability", "category", "images"]);
const ACTIVE_COMMERCE = ["PENDING", "PAYMENT_PROCESSING", "PAID", "FULFILLING"];
const LIFECYCLE = {
  AVAILABLE: new Set(["RESERVED", "SOLD", "PAWNED", "LAYAWAY", "UNAVAILABLE", "ARCHIVED"]),
  RESERVED: new Set(["AVAILABLE", "SOLD", "UNAVAILABLE", "ARCHIVED"]),
  SOLD: new Set(["ARCHIVED"]),
  PAWNED: new Set(["AVAILABLE", "SOLD", "LAYAWAY", "UNAVAILABLE", "ARCHIVED"]),
  LAYAWAY: new Set(["AVAILABLE", "SOLD", "UNAVAILABLE", "ARCHIVED"]),
  UNAVAILABLE: new Set(["AVAILABLE", "ARCHIVED"]),
  ARCHIVED: new Set(["AVAILABLE", "UNAVAILABLE"]),
};

function http(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function actorId(req) { return text(req.superAdmin?.id || req.user?.sub); }
function send(res, error) { return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || "Inventory support failed." }); }
function reason(req) { const value = text(req.body?.reason); if (value.length < 8) throw http(400, "A specific support reason of at least 8 characters is required."); return value; }

function safeItem(item) {
  if (!item) return null;
  return Object.fromEntries(["id", "pawnShopId", "title", "description", "price", "cost", "currency", "images", "category", "condition", "status", "isDeleted", "sku", "barcode", "serialNumber", "quantity", "locationId", "availability", "createdAt", "updatedAt"].map((key) => [key, item[key] ?? null]));
}

async function session(req, shopId, { allowEnded = false } = {}) {
  const id = text(req.headers["x-support-session-id"] || req.body?.supportSessionId);
  if (!id) throw http(400, "An active support session is required.");
  const row = await prisma.inventorySupportSession.findFirst({ where: { id, shopId, actorId: actorId(req), ...(allowEnded ? {} : { endedAt: null }) } });
  if (!row) throw http(403, "Support session is invalid, ended, or belongs to another shop.");
  return row;
}

async function notifyOwner(tx, shop, item, action) {
  await tx.notification.create({ data: { userId: shop.ownerId, type: "ADMIN_INVENTORY_CHANGE", title: "Administrative inventory change", message: `${action.replaceAll("_", " ").toLowerCase()}: ${item?.title || "inventory"} at ${shop.name}.`, actionUrl: item?.id ? `/owner/inventory?itemId=${item.id}` : "/owner/inventory", dedupeKey: `admin-inventory:${action}:${item?.id || shop.id}:${Date.now()}` } });
}

async function assertCommerceSafe(tx, item, updates) {
  if (!item) return;
  const material = updates.availability || updates.quantity !== undefined || updates.price !== undefined || updates.locationId !== undefined || updates.images;
  if (!material) return;
  const [auction, offer, transaction] = await Promise.all([
    tx.auction.findFirst({ where: { itemId: item.id, status: { in: ["SCHEDULED", "LIVE"] } }, select: { id: true } }),
    tx.offer.findFirst({ where: { itemId: item.id, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } }, select: { id: true } }),
    tx.marketplaceTransaction.findFirst({ where: { listing: { itemId: item.id }, status: { in: ACTIVE_COMMERCE } }, select: { id: true } }),
  ]);
  if (auction || offer || transaction) throw http(409, "This item has an active auction, offer, reservation, purchase, or fulfillment and cannot be materially changed.");
}

export async function startInventorySupport(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId);
    const shop = await prisma.pawnShop.findFirst({ where: { id: shopId, isDeleted: false }, select: { id: true, name: true } });
    if (!shop) throw http(404, "Shop not found.");
    const session = await prisma.$transaction(async (tx) => {
      await tx.inventorySupportSession.updateMany({ where: { actorId: actorId(req), endedAt: null }, data: { endedAt: new Date() } });
      const created = await tx.inventorySupportSession.create({ data: { shopId, actorId: actorId(req), reason: why, requestId: req.requestId || null } });
      await tx.inventoryAdminEvent.create({ data: { shopId, actorId: actorId(req), supportSessionId: created.id, action: "SUPPORT_SESSION_STARTED", reason: why, requestId: req.requestId || null, afterState: { shopName: shop.name } } });
      return created;
    });
    return res.status(201).json({ success: true, session, shop });
  } catch (error) { return send(res, error); }
}

export async function endInventorySupport(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId); const active = await session(req, shopId);
    const ended = await prisma.$transaction(async (tx) => {
      const row = await tx.inventorySupportSession.update({ where: { id: active.id }, data: { endedAt: new Date() } });
      await tx.inventoryAdminEvent.create({ data: { shopId, actorId: actorId(req), supportSessionId: active.id, action: "SUPPORT_SESSION_ENDED", reason: why, requestId: req.requestId || null } }); return row;
    });
    return res.json({ success: true, session: ended });
  } catch (error) { return send(res, error); }
}

export async function listSupportInventory(req, res) {
  try {
    const shopId = text(req.params.shopId); await session(req, shopId);
    const q = text(req.query.q); const where = { pawnShopId: shopId, ...(req.query.archived === "true" ? {} : { isDeleted: false }), ...(req.query.category ? { category: text(req.query.category) } : {}), ...(req.query.condition ? { condition: text(req.query.condition) } : {}), ...(req.query.availability ? { availability: text(req.query.availability).toUpperCase() } : {}), ...(req.query.locationId ? { locationId: text(req.query.locationId) } : {}), ...(q ? { OR: ["title", "sku", "barcode", "serialNumber", "category", "condition"].map((field) => ({ [field]: { contains: q, mode: "insensitive" } })) } : {}) };
    const items = await prisma.item.findMany({ where, include: { location: true, marketplaceListings: { select: { id: true, status: true, updatedAt: true } } }, orderBy: { updatedAt: "desc" } });
    return res.json({ success: true, items });
  } catch (error) { return send(res, error); }
}

export async function createSupportInventory(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId); const active = await session(req, shopId);
    const quantity = Number(req.body.quantity ?? 1); const price = Number(req.body.price ?? 0); const availability = text(req.body.availability || "AVAILABLE").toUpperCase();
    if (!text(req.body.title)) throw http(400, "Item title is required.");
    if (!Number.isInteger(quantity) || quantity < 0) throw http(400, "Quantity must be a non-negative integer.");
    if (!Number.isFinite(price) || price < 0 || !AVAILABILITY.has(availability)) throw http(400, "Invalid price or availability.");
    const locationId = text(req.body.locationId) || null;
    if (locationId && !(await prisma.inventoryLocation.findFirst({ where: { id: locationId, shopId, isArchived: false } }))) throw http(400, "Location must belong to the selected shop.");
    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.pawnShop.findUnique({ where: { id: shopId }, select: { id: true, name: true, ownerId: true } }); if (!shop) throw http(404, "Shop not found.");
      const item = await tx.item.create({ data: { pawnShopId: shopId, title: text(req.body.title), description: text(req.body.description) || null, price, cost: req.body.cost === undefined || req.body.cost === "" ? null : Number(req.body.cost), currency: "USD", images: Array.isArray(req.body.images) ? req.body.images.map(text).filter(Boolean) : [], category: text(req.body.category) || null, condition: text(req.body.condition) || null, sku: text(req.body.sku) || null, barcode: text(req.body.barcode) || null, serialNumber: text(req.body.serialNumber) || null, quantity, locationId, availability, status: availability === "SOLD" ? "SOLD" : "AVAILABLE", isDeleted: availability === "ARCHIVED" } });
      await tx.inventoryAdminEvent.create({ data: { shopId, itemId: item.id, actorId: actorId(req), supportSessionId: active.id, action: "CREATE_INVENTORY", reason: why, requestId: req.requestId || null, afterState: safeItem(item) } }); await notifyOwner(tx, shop, item, "CREATE_INVENTORY"); return item;
    }); return res.status(201).json({ success: true, item: result });
  } catch (error) { return send(res, error); }
}

export async function updateSupportInventory(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId); const itemId = text(req.params.itemId); const active = await session(req, shopId); const data = {};
    for (const [key, value] of Object.entries(req.body || {})) if (MUTABLE_FIELDS.has(key)) data[key] = value;
    if (data.quantity !== undefined) { data.quantity = Number(data.quantity); if (!Number.isInteger(data.quantity) || data.quantity < 0) throw http(400, "Quantity must be a non-negative integer."); }
    for (const field of ["price", "cost"]) if (data[field] !== undefined) { data[field] = data[field] === "" || data[field] === null ? null : Number(data[field]); if (data[field] !== null && (!Number.isFinite(data[field]) || data[field] < 0)) throw http(400, `${field} must be non-negative.`); }
    if (data.availability) { data.availability = text(data.availability).toUpperCase(); if (!AVAILABILITY.has(data.availability)) throw http(400, "Invalid availability."); data.status = data.availability === "SOLD" ? "SOLD" : "AVAILABLE"; data.isDeleted = data.availability === "ARCHIVED"; }
    if (data.images !== undefined && !Array.isArray(data.images)) throw http(400, "Images must be an ordered array.");
    if (data.locationId !== undefined) { data.locationId = text(data.locationId) || null; if (data.locationId && !(await prisma.inventoryLocation.findFirst({ where: { id: data.locationId, shopId, isArchived: false } }))) throw http(400, "Location must belong to the selected shop."); }
    const result = await prisma.$transaction(async (tx) => { const before = await tx.item.findFirst({ where: { id: itemId, pawnShopId: shopId } }); if (!before) throw http(404, "Inventory item not found in selected shop."); if (data.availability && data.availability !== before.availability && !LIFECYCLE[before.availability]?.has(data.availability)) throw http(409, `Invalid inventory lifecycle transition: ${before.availability} to ${data.availability}.`); await assertCommerceSafe(tx, before, data); const item = await tx.item.update({ where: { id: itemId }, data }); const shop = await tx.pawnShop.findUnique({ where: { id: shopId }, select: { id: true, name: true, ownerId: true } }); await tx.inventoryAdminEvent.create({ data: { shopId, itemId, actorId: actorId(req), supportSessionId: active.id, action: "UPDATE_INVENTORY", reason: why, requestId: req.requestId || null, beforeState: safeItem(before), afterState: safeItem(item) } }); await notifyOwner(tx, shop, item, "UPDATE_INVENTORY"); return item; });
    return res.json({ success: true, item: result });
  } catch (error) { return send(res, error); }
}

export async function changeListingState(req, res) {
  try {
    const why = reason(req); const shopId = text(req.params.shopId); const itemId = text(req.params.itemId); const action = text(req.body.action).toLowerCase(); const next = LISTING_ACTIONS.get(action); if (!next) throw http(400, "Invalid listing action."); const active = await session(req, shopId);
    const result = await prisma.$transaction(async (tx) => { const item = await tx.item.findFirst({ where: { id: itemId, pawnShopId: shopId }, include: { marketplaceListings: true } }); if (!item) throw http(404, "Item not found."); await assertCommerceSafe(tx, item, { availability: action }); const listing = item.marketplaceListings[0]; if (!listing) throw http(409, "This inventory item has no existing marketplace listing."); if (["RESERVED", "SOLD"].includes(listing.status)) throw http(409, "Reserved or sold listings cannot be changed from support mode."); const updated = await tx.marketplaceListing.update({ where: { id: listing.id }, data: { status: next, ...(next === "ACTIVE" ? { publishedAt: new Date() } : {}) } }); const shop = await tx.pawnShop.findUnique({ where: { id: shopId }, select: { id: true, name: true, ownerId: true } }); await tx.inventoryAdminEvent.create({ data: { shopId, itemId, actorId: actorId(req), supportSessionId: active.id, action: `LISTING_${action.toUpperCase()}`, reason: why, requestId: req.requestId || null, beforeState: { id: listing.id, status: listing.status }, afterState: { id: updated.id, status: updated.status } } }); await notifyOwner(tx, shop, item, `LISTING_${action.toUpperCase()}`); return updated; }); return res.json({ success: true, listing: result });
  } catch (error) { return send(res, error); }
}

export async function listInventoryHistory(req, res) {
  try { const shopId = text(req.params.shopId); await session(req, shopId); const itemId = text(req.params.itemId); const events = await prisma.inventoryAdminEvent.findMany({ where: { shopId, ...(itemId ? { itemId } : {}) }, include: { actor: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 200 }); return res.json({ success: true, events }); } catch (error) { return send(res, error); }
}

export async function listInventoryLocations(req, res) { try { const shopId = text(req.params.shopId); await session(req, shopId); return res.json({ success: true, locations: await prisma.inventoryLocation.findMany({ where: { shopId, isArchived: false }, orderBy: { name: "asc" } }) }); } catch (error) { return send(res, error); } }
export async function createInventoryLocation(req, res) { try { const why = reason(req); const shopId = text(req.params.shopId); const active = await session(req, shopId); const name = text(req.body.name); if (!name) throw http(400, "Location name is required."); const location = await prisma.$transaction(async (tx) => { const row = await tx.inventoryLocation.create({ data: { shopId, name } }); await tx.inventoryAdminEvent.create({ data: { shopId, actorId: actorId(req), supportSessionId: active.id, action: "CREATE_INVENTORY_LOCATION", reason: why, requestId: req.requestId || null, afterState: { id: row.id, name: row.name } } }); return row; }); return res.status(201).json({ success: true, location }); } catch (error) { return send(res, error); } }

export async function listOwnerInventoryAdminHistory(req, res) {
  try {
    const item = await prisma.item.findFirst({ where: { id: text(req.params.id), shop: { ownerId: text(req.user?.sub) } }, select: { id: true, pawnShopId: true } });
    if (!item) throw http(404, "Owned inventory item not found.");
    const events = await prisma.inventoryAdminEvent.findMany({ where: { itemId: item.id, shopId: item.pawnShopId }, select: { id: true, action: true, reason: true, beforeState: true, afterState: true, requestId: true, createdAt: true, actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "desc" } });
    return res.json({ success: true, events });
  } catch (error) { return send(res, error); }
}

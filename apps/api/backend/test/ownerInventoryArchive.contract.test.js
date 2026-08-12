import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [routes, controller] = await Promise.all([
  readFile(new URL("../src/routes/items.routes.js", import.meta.url), "utf8"),
  readFile(new URL("../src/controllers/items.controller.js", import.meta.url), "utf8"),
]);

test("owner item archive lookup and restore routes enforce inventory permissions", () => {
  assert.match(
    routes,
    /router\.get\("\/mine\/:id", authRequired, requireOwnerAdminOrStaffPermission\("inventory:read"\), getMyItem\)/,
  );
  assert.match(
    routes,
    /router\.patch\("\/:id\/restore", authRequired, requireOwnerAdminOrStaffPermission\("inventory:write"\), restoreItem\)/,
  );
});

test("owner archived-item lookup is scoped to readable shops and restore checks write access", () => {
  assert.match(controller, /export async function getMyItem[\s\S]*getInventoryReadableShopIds\(req\)/);
  assert.match(controller, /pawnShopId: \{ in: shopIds \}/);
  assert.match(controller, /export async function restoreItem[\s\S]*canWriteInventoryForShop\(req, item\.shop\?\.id, item\.shop\?\.ownerId\)/);
  assert.match(controller, /isDeleted: false/);
});

test("archiving clears image URLs after tracked files are deleted", () => {
  assert.match(
    controller,
    /isDeleted: true,[\s\S]*itemColumns\.has\("images"\) \? \{ images: \[\] \}/,
  );
});

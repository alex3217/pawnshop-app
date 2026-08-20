import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath) => readFileSync(resolve(directory, relativePath), "utf8");
const routes = source("../src/routes/locations.routes.js");
const controller = source("../src/controllers/shops.controller.js");

const affectedRoutes = [
  {
    name: "GET /api/locations/mine",
    pattern: /router\.get\(\s*"\/mine",\s*authRequired,\s*asyncRoute\(myShops\),?\s*\)/,
  },
  {
    name: "POST /api/locations/:id/verify-location",
    pattern: /router\.post\(\s*"\/:id\/verify-location",\s*authRequired,\s*requireRole\(\.\.\.LOCATION_ROLES\),\s*requireMfaStepUpForRoles\("configuration\.location\.verify", "ADMIN", "SUPER_ADMIN"\),\s*validateLocationIdParam,\s*asyncRoute\(verifyShopLocation\),?\s*\)/,
  },
  {
    name: "PUT /api/locations/:id",
    pattern: /router\.put\(\s*"\/:id",\s*authRequired,\s*requireMfaStepUpForRoles\("privilege\.location\.update", "ADMIN", "SUPER_ADMIN"\),\s*validateLocationIdParam,\s*asyncRoute\(updateShop\),?\s*\)/,
  },
  {
    name: "PATCH /api/locations/:id",
    pattern: /router\.patch\(\s*"\/:id",\s*authRequired,\s*requireMfaStepUpForRoles\("privilege\.location\.update", "ADMIN", "SUPER_ADMIN"\),\s*validateLocationIdParam,\s*asyncRoute\(updateShop\),?\s*\)/,
  },
];

for (const route of affectedRoutes) {
  test(`${route.name} requires authentication before its handler`, () => {
    assert.match(routes, route.pattern);
  });
}

test("myShops enforces locations:read through its accessible-shop scope", () => {
  assert.match(
    controller,
    /export async function myShops[\s\S]*?getAccessibleShopScope\(\{\s*user: req\.user,\s*permission: "locations:read",\s*\}\)/,
  );
});

test("updateShop and verifyShopLocation enforce locations:write for the requested shop", () => {
  for (const handler of ["updateShop", "verifyShopLocation"]) {
    const start = controller.indexOf(`export async function ${handler}`);
    const next = controller.indexOf("\nexport async function ", start + 1);
    const body = controller.slice(start, next === -1 ? undefined : next);
    assert.ok(start >= 0, `${handler} must exist`);
    assert.match(
      body,
      /assertShopPermission\(\{ user: req\.user, shopId: id, permission: "locations:write" \}\)/,
    );
  }
});

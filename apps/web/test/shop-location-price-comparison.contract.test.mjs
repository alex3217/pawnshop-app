import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/OwnerLocationsPage.tsx", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../src/pages/OwnerOnboardingPage.tsx", import.meta.url), "utf8");
const itemDetail = await readFile(new URL("../src/pages/ItemDetailPage.tsx", import.meta.url), "utf8");
const routes = await readFile(new URL("../../api/backend/src/routes/locations.routes.js", import.meta.url), "utf8");
const controller = await readFile(new URL("../../api/backend/src/controllers/shops.controller.js", import.meta.url), "utf8");

test("owner location workflows expose structured address and verification controls", () => {
  for (const label of ["Street address", "City", "State / region", "ZIP / postal code", "Country code"]) {
    assert.match(page, new RegExp(label.replace("/", "\\/")));
    assert.match(onboarding, new RegExp(label.replace("/", "\\/")));
  }
  for (const status of ["Verified", "Missing coordinates", "Verification failed", "Verify location", "Update map location"]) assert.match(page, new RegExp(status));
});

test("location write, verify, and backfill routes retain role and ownership protection", () => {
  assert.match(routes, /requireRole\(\.\.\.LOCATION_ROLES\)/);
  assert.match(routes, /requireRole\("ADMIN", "SUPER_ADMIN"\)/);
  assert.match(routes, /\/:id\/verify-location/);
  assert.match(routes, /\/backfill-coordinates/);
  assert.match(controller, /shop\.ownerId !== req\.user\.sub/);
  assert.match(controller, /status\(403\).*Forbidden/);
});

test("Local Price Check explains each empty state distinctly", () => {
  assert.match(itemDetail, /Shop location unavailable/);
  assert.match(itemDetail, /No comparable items found/);
  assert.match(itemDetail, /Insufficient sample for a Deal Score/);
});

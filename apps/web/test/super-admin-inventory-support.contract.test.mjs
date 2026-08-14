import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/SuperAdminShopSupportPage.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../src/admin/services/adminApi.ts", import.meta.url), "utf8");

test("inventory support UI exposes explicit operational states", () => {
  for (const evidence of [
    "Loading inventory support data",
    "No inventory matches this shop-scoped search",
    "Permission denied",
    "Inventory conflict",
    "No administrative inventory changes",
  ]) assert.match(page, new RegExp(evidence));
});

test("inventory support UI requires reasons and exposes locations and history", () => {
  assert.match(page, /minLength=\{8\}/);
  assert.match(page, /createSupportLocation/);
  assert.match(page, /getSupportHistory/);
  assert.match(page, /support session is invalid, ended, or belongs/i);
  assert.match(page, /sessionStorage\.removeItem\(storageKey\)/);
  assert.match(api, /X-Support-Session-Id/);
  assert.match(api, /inventory-locations/);
  assert.match(api, /inventory.*history/);
});

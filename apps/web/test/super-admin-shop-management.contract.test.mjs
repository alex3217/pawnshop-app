import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/admin/pages/SuperAdminShopsPage.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/admin/services/adminApi.ts", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const pattern = new RegExp(
    `async function ${name}\\([\\s\\S]*?(?=\\n  async function ${nextName}\\()`,
  );
  const source = page.match(pattern)?.[0];
  assert.ok(source, `${name} implementation must exist`);
  return source;
}

test("shop list is server-paged with active filters and cancellation", () => {
  assert.match(page, /getSuperAdminShopsPaged\(\s*\{ page, limit, \.\.\.filters },\s*controller\.signal/);
  for (const field of ["q", "subscriptionPlan", "subscriptionStatus", "isDeleted"]) assert.match(page, new RegExp(`${field}:`));
  assert.match(page, /controller\.abort\(\)/); assert.doesNotMatch(page, /limit:\s*100\s*}\)/);
});
test("successful mutations invalidate the server-backed filtered list", () => {
  assert.match(page, /\[page, limit, filters, refreshVersion\]/);
  assert.match(page, /function refreshShops\(\)/);
  for (const [name, nextName] of [
    ["createShop", "saveProfile"],
    ["saveProfile", "saveBilling"],
    ["saveBilling", "toggleAccess"],
    ["toggleAccess", "reassign"],
    ["reassign", "exportAll"],
  ]) {
    assert.match(functionSource(name, nextName), /refreshShops\(\);/);
  }
  assert.doesNotMatch(page, /setShops\(\(rows\)/);
});
test("owner retrieval follows every eligible paginated page", () => {
  assert.match(page, /while \(!controller\.signal\.aborted\)/);
  assert.match(page, /page: ownerPage, limit: 250, role: "OWNER", isActive: true/);
  assert.match(page, /result\.pagination\?\.hasNextPage/);
  assert.match(page, /ownerPage \+= 1/);
});
test("billing confirmation requires and sends the user-entered reason", () => {
  assert.match(page, /role="dialog"[\s\S]*Billing override/); assert.match(page, /reason: reason\.trim\(\)/); assert.match(page, /Reason \(required\)/); assert.match(page, /"Confirm"/); assert.match(api, /reason\?: string/);
});
test("profile editor exposes only supported profile fields", () => {
  for (const field of ["name", "address", "phone", "description", "hours"]) assert.match(page, new RegExp(`"${field}"`));
  assert.match(page, /saveProfile/); assert.match(page, /Shop name is required/);
});
test("pagination and complete filtered export are explicit", () => {
  for (const label of ["Previous", "Next", "Page size", "matching shops", "Export All Matching Shops", "Refresh", "Created"]) assert.match(page, new RegExp(label));
  assert.match(page, /while \(true\)/); assert.match(page, /limit: 250,[\s\S]*\.\.\.filters/); assert.match(page, /hasNextPage/);
  assert.match(page, /shop\.ownerEmail/); assert.match(page, /shop\.ownerId/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath) => readFileSync(resolve(directory, relativePath), "utf8");

test("both owner location aliases delegate to the same entitlement-enforced creation path", () => {
  const locations = source("../src/routes/locations.routes.js");
  const shopsRoutes = source("../src/routes/shops.routes.js");
  const shops = source("../src/controllers/shops.controller.js");
  assert.match(locations, /router\.post\([\s\S]*asyncRoute\(createShop\)/);
  assert.match(shopsRoutes, /router\.post\("\/", authRequired, requireRole\("OWNER", "ADMIN"\), createShop\)/);
  assert.match(shops, /await assertCanCreateLocationForOwner\(userId\)/);
});

test("governed admin shop creation enforces owner location limits while preserving Super Admin", () => {
  const admin = source("../src/controllers/admin.controller.js");
  assert.match(admin, /role \|\| ""\)\.toUpperCase\(\) !== "SUPER_ADMIN"/);
  assert.match(admin, /await assertCanCreateLocationForOwner\(data\.ownerId\)/);
});

test("AI listing route preserves platform access and enforces owner shop entitlement", () => {
  const ai = source("../src/routes/ai.routes.js");
  assert.match(ai, /requireRole\("OWNER", "ADMIN", "SUPER_ADMIN"\)/);
  assert.match(ai, /permission: "inventory:write"/);
  assert.match(ai, /await assertCanUseAiListingAssistantForShop\(shopId\)/);
});

test("no seller analytics API route exists to gate beyond the shared level assertion", () => {
  const routeFiles = [
    "admin.routes.js", "ai.routes.js", "auctions.routes.js", "items.routes.js",
    "locations.routes.js", "sellerPlans.routes.js", "shops.routes.js",
  ].map((name) => source(`../src/routes/${name}`)).join("\n");
  assert.doesNotMatch(routeFiles, /seller[^\n]*analytics|analytics[^\n]*seller/i);
});

test("reconciliation CLI keeps dry-run read-only and delegates --apply to the idempotent audit service", () => {
  const script = source("../scripts/reconcile-seller-subscription-audit.mjs");
  assert.match(script, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(script, /if \(!apply\) \{[\s\S]*Read-only inspection complete/);
  assert.match(script, /else \{[\s\S]*await reconcileSellerSubscriptionAudit\(\{ shopId, prismaClient: prisma \}\)/);
  assert.doesNotMatch(script, /prisma\.(?:pawnShop\.)?(?:create|update|upsert|delete)|prisma\.\$executeRaw/);
});

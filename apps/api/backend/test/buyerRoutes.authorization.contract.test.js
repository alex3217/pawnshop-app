import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const stripeRoutes = await readFile(new URL("../src/routes/stripe.routes.js", import.meta.url), "utf8");
const planRoutes = await readFile(new URL("../src/routes/buyerPlans.routes.js", import.meta.url), "utf8");
const preferenceRoutes = await readFile(new URL("../src/routes/buyerPreferences.routes.js", import.meta.url), "utf8");
const planController = await readFile(new URL("../src/controllers/buyerPlans.controller.js", import.meta.url), "utf8");

test("buyer checkout requires auth and intentionally permits only consumer and admin", () => { assert.match(stripeRoutes, /"\/checkout\/buyer-subscription"[\s\S]*authRequired[\s\S]*requireRole\("CONSUMER", "ADMIN"\)/); assert.doesNotMatch(stripeRoutes.match(/"\/checkout\/buyer-subscription"[\s\S]{0,250}/)?.[0] || "", /OWNER|SUPER_ADMIN/); });
test("billing portal remains limited to authenticated supported roles", () => assert.match(stripeRoutes, /"\/billing-portal", authRequired, requireRole\("CONSUMER", "OWNER"\)/));
test("direct consumer buyer-plan mutation stays forbidden", () => { assert.match(planRoutes, /router\.put\([\s\S]*requireRole\(\.\.\.BUYER_ROLES\)/); assert.match(planController, /req\?\.user\?\.role === "CONSUMER"/); assert.match(planRoutes, /router\.delete\([\s\S]*requireRole\(\.\.\.ADMIN_ROLES\)/); });
test("buyer preferences require authentication and never accept a path user id", () => { assert.match(preferenceRoutes, /authRequired/); assert.match(preferenceRoutes, /requireRole\("CONSUMER", "ADMIN"\)/); assert.doesNotMatch(preferenceRoutes, /:userId/); });

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../src/pages/OwnerSubscriptionPage.tsx",
    import.meta.url,
  ),
  "utf8",
);
const ownerWorkspace = readFileSync(
  new URL("../src/services/ownerWorkspace.ts", import.meta.url),
  "utf8",
);
const apiClient = readFileSync(
  new URL("../src/services/apiClient.ts", import.meta.url),
  "utf8",
);
const stripeRoutes = readFileSync(
  new URL("../../api/backend/src/routes/stripe.routes.js", import.meta.url),
  "utf8",
);
const stripeController = readFileSync(
  new URL("../../api/backend/src/controllers/stripe.controller.js", import.meta.url),
  "utf8",
);

test("owners without shops can still compare seller plans", () => {
  assert.doesNotMatch(
    source,
    /\) : !hasShops \? \(/,
    "the no-shop condition must not replace the complete subscription body",
  );

  assert.match(
    source,
    /Compare plans before creating your shop/,
  );

  assert.match(
    source,
    /Create shop to choose this plan/,
  );

  const noShopMessageIndex = source.indexOf(
    "Compare plans before creating your shop",
  );

  const planGridIndex = source.indexOf(
    "{plans.map((plan) => {",
  );

  assert.ok(noShopMessageIndex >= 0);
  assert.ok(
    planGridIndex > noShopMessageIndex,
    "the plan grid must render after the no-shop guidance",
  );
});

test("founding-shop copy has no first-shop registration limit", () => {
  assert.match(
    source,
    /days free for registering shops/,
  );

  assert.equal(
    source.includes("foundingProgram.shopLimit"),
    false,
  );
});

test("all seller-plan actions are wired to authenticated API flows", () => {
  assert.match(source, /onClick=\{\(\) => switchPlan\(plan\.code\)\}/);
  assert.match(source, /\["FREE", "PRO", "PREMIUM", "ULTRA"\]/);
  assert.match(source, /if \(isPaidPlanCode\(normalizedPlanCode\)\)[\s\S]*createSubscriptionCheckoutSession/);
  assert.match(source, /updateShopSubscription\(selectedShopId, \{[\s\S]*plan: normalizedPlanCode/);
  assert.match(source, /window\.location\.assign\(checkoutSession\.url\)/);
  assert.match(source, /setEntitlementsError\([\s\S]*Unable to open Stripe checkout/);
  assert.match(ownerWorkspace, /api\.patch<unknown>\([\s\S]*\/shops\/\$\{encodeURIComponent\(shopId\)\}\/subscription/);
  assert.match(ownerWorkspace, /api\.post<CheckoutSessionResponse>\([\s\S]*"\/stripe\/checkout\/subscription"/);
  assert.match(apiClient, /getAuthHeaders\(false\)/);
  assert.match(apiClient, /throw new ApiError\([\s\S]*res\.status/);
  assert.match(stripeRoutes, /"\/checkout\/subscription",[\s\S]*authRequired,[\s\S]*requireRole\("OWNER", "ADMIN"\)/);
  assert.match(stripeController, /await ensureShopAccess\(req, shopId\)/);
});

test("API and authorization failures remain visible to the owner", () => {
  assert.match(source, /catch \(err: unknown\)[\s\S]*setEntitlementsError/);
  assert.match(apiClient, /if \(!res\.ok\)\s*\{[\s\S]*throw new ApiError/);
  assert.match(apiClient, /if \(res\.status === 401\)[\s\S]*handleAuthenticationFailure/);
});

test("seller-plan actions expose progress and reject duplicate submissions", () => {
  assert.match(source, /planActionInFlightRef\.current/);
  assert.match(source, /if \(planActionInFlightRef\.current\) return/);
  assert.match(source, /planActionInFlightRef\.current = true/);
  assert.match(source, /finally\s*\{[\s\S]*planActionInFlightRef\.current = false/);
  assert.match(source, /"Opening checkout\.\.\."/);
  assert.match(source, /"Updating plan\.\.\."/);
});

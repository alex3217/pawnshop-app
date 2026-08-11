import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/admin/pages/SuperAdminSellerPlansPage.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../src/styles/super-admin-seller-plans.css", import.meta.url),
  "utf8",
);
const api = await readFile(
  new URL("../src/admin/services/adminApi.ts", import.meta.url),
  "utf8",
);
const routes = await readFile(
  new URL("../../api/backend/src/routes/superAdmin.routes.js", import.meta.url),
  "utf8",
);

test("monthly and yearly pricing use an explicit non-overlapping segmented control", () => {
  assert.match(page, /role="group"[\s\S]*aria-label="Displayed billing period"/);
  assert.match(page, /aria-pressed=\{!yearly\}[\s\S]*setYearly\(false\)/);
  assert.match(page, /aria-pressed=\{yearly\}[\s\S]*setYearly\(true\)/);
  assert.doesNotMatch(page, /className="sr-only"/);
  assert.match(page, /month equivalent · save/);
  assert.match(css, /\.seller-plan-billing-toggle\s*\{[\s\S]*inline-grid/);
  assert.match(css, /button\[aria-pressed="true"\]/);
});

test("Stripe validation is an authenticated server action with card-level progress and results", () => {
  assert.match(api, /validateSellerPlanStripeReferences/);
  assert.match(api, /\/validate-stripe/);
  assert.match(routes, /router\.post\("\/plans\/seller\/:code\/validate-stripe"/);
  assert.match(page, /Validating with Stripe…/);
  assert.match(page, /seller-plan-action-result--\$\{feedback\.tone\}/);
  assert.match(page, /verified in Stripe/);
  assert.match(page, /role=\{feedback\.tone === "error" \? "alert" : "status"\}/);
});

test("every seller-plan card action has an observable effect", () => {
  for (const label of [
    "View details",
    "Edit plan",
    "Preview owner-facing plan",
    "Download duplicate draft",
    "Schedule future change",
    "Validate Stripe references",
  ]) {
    assert.match(page, new RegExp(label));
  }

  assert.match(page, /setSelected\(plan\)/);
  assert.match(page, /setOwnerPreview\(plan\)/);
  assert.match(page, /setSchedulePreview\(plan\)/);
  assert.match(page, /Future scheduling is not enabled yet/);
  assert.match(page, /No pricing, Stripe reference, entitlement, or subscriber change was/);
  assert.match(page, /duplicate draft downloaded/);
  assert.match(page, /No live plan was created or changed/);
});

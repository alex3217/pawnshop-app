import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/admin/pages/AdminSubscriptionsPage.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../src/styles/admin-subscriptions-readability.css", import.meta.url),
  "utf8",
);
const shopsPage = await readFile(
  new URL("../src/admin/pages/SuperAdminShopsPage.tsx", import.meta.url),
  "utf8",
);

test("expanded subscription details cannot stretch sibling actions", () => {
  assert.match(page, /className="seller-subscription-controls"/);
  assert.match(page, /className="seller-subscription-actions"/);
  assert.match(page, /className="seller-subscription-expanded-panel"/);
  assert.doesNotMatch(
    page,
    /display:\s*"flex"[\s\S]{0,160}<details>[\s\S]{0,500}Manage subscription/,
  );
  assert.match(css, /\.seller-subscription-actions\s*\{[\s\S]*align-items:\s*flex-start/);
  assert.match(css, /\.seller-subscription-action\s*\{[\s\S]*border-radius:\s*12px/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*grid-template-columns:\s*1fr/);
});

test("subscription cards mask Stripe references and explain separate payout state", () => {
  assert.match(page, /function maskStripeReference/);
  assert.match(page, /maskStripeReference\(subscription\.stripeCustomerId\)/);
  assert.match(page, /maskStripeReference\(subscription\.stripeSubscriptionId\)/);
  assert.match(page, /Subscription billing and Stripe Connect payouts are separate/);
  assert.match(page, /Subscription payment managed by Stripe · Active/);
  assert.match(page, /Payout onboarding not started/);
});

test("shop billing action has one clear destination and preserves its search query", () => {
  assert.match(page, />\s*Manage shop billing\s*</);
  assert.doesNotMatch(page, />\s*View shop and owner\s*</);
  assert.doesNotMatch(page, />\s*Manage subscription\s*</);
  assert.match(shopsPage, /useSearchParams/);
  assert.match(shopsPage, /searchParams\.get\("q"\) \|\| ""/);
});

test("seller subscription audit navigation uses the shop entity filter", () => {
  assert.match(page, /shopId: string/);
  assert.match(page, /shopId,\s*$/m);
  assert.match(page, /encodeURIComponent\(subscription\.shopId\)/);
  assert.match(page, /\/super-admin\/audit\?targetType=SHOP&targetId=/);
});

import { expect, test, type Locator, type Page } from "@playwright/test";

const supportedBuyerLinks = [
  ["Buyer Dashboard", "/buyer/dashboard"],
  ["My Bids", "/my-bids"],
  ["My Wins", "/my-wins"],
  ["My Purchases", "/marketplace/purchases"],
  ["Offers", "/offers"],
  ["Watchlist", "/watchlist"],
  ["Saved Searches", "/saved-searches"],
  ["My Listings", "/marketplace/listings/mine"],
  ["Create Listing", "/marketplace/listings/new"],
  ["Payment Methods", "/account/payment-methods"],
  ["Buyer Subscription", "/buyer/subscription"],
  ["Knowledge Center", "/knowledge"],
] as const;

async function installBuyer(page: Page, theme: "light" | "dark" = "light") {
  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("auth_token", "buyer-parity-test-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "buyer-parity", name: "Buyer Parity", email: "buyer@example.test", role: "CONSUMER",
    }));
    localStorage.setItem("pawnloop-navigation-assistance-CONSUMER-v2", JSON.stringify({
      automaticPrompts: false, completedTopics: [], dismissedGuidance: true, floatingButtonVisible: false,
    }));
  }, theme);
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith("/buyer-plans/mine/usage") ? {
      success: true,
      subscription: { id: null, storedPlan: "FREE", effectivePlan: "FREE", displayName: "Free", status: "ACTIVE", billingInterval: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, isPaid: false },
      entitlements: { savedSearchLimit: 5, wishListLimit: null, favoriteLimit: null, comparisonLimit: null, alertLevel: "basic", notificationPriority: "standard", workspaceLevel: "fixed", workspaceCustomizationEnabled: false, collectionManagerEnabled: false, collectionItemLimit: null, marketIntelligenceLevel: "none", conciergeEnabled: false, supportLevel: "standard" },
      usage: { savedSearches: { used: 0, limit: 5, unlimited: false, remaining: 5, atLimit: false }, watchlistItems: { used: 0, limit: 25, unlimited: false, remaining: 25, atLimit: false }, wishLists: { used: 0, limit: null, unlimited: true, remaining: null, atLimit: false }, comparisons: { used: 0, limit: null, unlimited: true, remaining: null, atLimit: false }, collectionItems: { used: 0, limit: null, unlimited: true, remaining: null, atLimit: false }, aiRequests: { used: 0, limit: null, unlimited: true, remaining: null, atLimit: false }, activeAlerts: 0, referralRewards: 0, loyaltyPoints: 0 },
      implementation: {}, coreCommerce: {},
    } : pathname.endsWith("/buyer-plans") ? { success: true, plans: [
      { code: "FREE", label: "Free", monthlyPriceCents: 0, yearlyPriceCents: 0, currency: "USD", annualSavingsCents: 0, isPaid: false, isFree: true, rank: 0, monthlyCheckoutConfigured: true, yearlyCheckoutConfigured: true, maxSavedSearches: 5, maxWatchlistItems: 25, features: ["Browse items and auctions"] },
      { code: "PLUS", label: "Plus", monthlyPriceCents: 699, yearlyPriceCents: 6900, currency: "USD", annualSavingsCents: 1488, isPaid: true, isFree: false, rank: 1, monthlyCheckoutConfigured: true, yearlyCheckoutConfigured: true, maxSavedSearches: 50, maxWatchlistItems: 250, features: ["Instant alerts"] },
      { code: "PREMIUM", label: "Premium", monthlyPriceCents: 1299, yearlyPriceCents: 12900, currency: "USD", annualSavingsCents: 2688, isPaid: true, isFree: false, rank: 2, monthlyCheckoutConfigured: true, yearlyCheckoutConfigured: false, maxSavedSearches: null, maxWatchlistItems: null, features: ["Advanced autobid tools"] },
      { code: "ULTRA", label: "Ultra", monthlyPriceCents: 2499, yearlyPriceCents: 24900, currency: "USD", annualSavingsCents: 5088, isPaid: true, isFree: false, rank: 3, monthlyCheckoutConfigured: true, yearlyCheckoutConfigured: true, maxSavedSearches: null, maxWatchlistItems: null, features: ["Earliest premium inventory access"] },
    ] } : {
      success: true, items: [], rows: [], data: [], shops: [], capabilities: {},
      notifications: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    };
    return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
    });
  });
}

async function contrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const channels = parse(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return {
      foreground: style.color,
      background: style.backgroundColor,
      ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
    };
  });
}

test("CONSUMER Buyer Tools exposes every supported unchanged URL and no privileged control", async ({ page }) => {
  await installBuyer(page);
  await page.goto("/marketplace");
  const menu = page.locator(".site-workspace-menu");
  await menu.locator("summary").click();
  for (const [label, path] of supportedBuyerLinks) {
    await expect(menu.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", path);
  }
  for (const privileged of ["Owner Tools", "Admin Tools", "Platform Tools", "Create Auction", "Staff", "Platform Settings"]) {
    await expect(page.getByText(privileged, { exact: true })).toHaveCount(0);
  }
});

test("Buyer Subscription route resolves for CONSUMER without privileged controls", async ({ page }) => {
  await installBuyer(page);
  await page.goto("/buyer/subscription");
  await expect(page.getByRole("heading", { name: "Buyer Subscription" })).toBeVisible();
  const comparison = page.getByRole("region", { name: "Compare plans" });
  for (const plan of ["Free", "Plus", "Premium", "Ultra"]) {
    await expect(comparison.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  }
  for (const privileged of ["Owner Tools", "Admin Tools", "Platform Tools", "Create Auction", "Platform Settings"]) {
    await expect(page.getByText(privileged, { exact: true })).toHaveCount(0);
  }
});

test("Buyer Subscription interval selection fails closed and checkout sends only plan and interval", async ({ page }) => {
  let checkoutBody: Record<string, unknown> | null = null;
  await installBuyer(page);
  await page.route("**/api/stripe/checkout/buyer-subscription", async (route) => {
    checkoutBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, url: "https://checkout.stripe.com/test-session" }) });
  });
  await page.goto("/buyer/subscription");
  await page.getByLabel("Yearly").check();
  await expect(page.getByText("$69.00 / year")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose Premium" })).toBeDisabled();
  await expect(page.getByText("This billing interval is not configured yet.", { exact: false })).toBeVisible();
  await page.getByLabel("Monthly").check();
  await page.getByRole("button", { name: "Choose Plus" }).click();
  await expect.poll(() => checkoutBody).not.toBeNull();
  expect(checkoutBody).toEqual({
    planCode: "PLUS",
    billingInterval: "MONTH",
  });
  expect(checkoutBody).not.toHaveProperty("priceId");
  expect(checkoutBody).not.toHaveProperty("amountCents");
});

test("active paid buyer manages another paid plan in the trusted Stripe portal without Checkout", async ({ page }) => {
  let checkoutCalls = 0;
  let portalCalls = 0;
  await installBuyer(page);
  await page.route("**/api/buyer-plans/mine/usage", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    success: true,
    subscription: { id: "subscription-1", storedPlan: "PLUS", effectivePlan: "PLUS", displayName: "Plus", status: "ACTIVE", billingInterval: "MONTH", currentPeriodStart: "2026-08-01T00:00:00.000Z", currentPeriodEnd: "2026-09-01T00:00:00.000Z", cancelAtPeriodEnd: false, isPaid: true },
    entitlements: {},
    usage: { savedSearches: { used: 1, limit: 50, unlimited: false, remaining: 49, atLimit: false }, watchlistItems: { used: 2, limit: 250, unlimited: false, remaining: 248, atLimit: false } },
    implementation: {}, coreCommerce: {},
  }) }));
  await page.route("**/api/stripe/checkout/buyer-subscription", (route) => { checkoutCalls += 1; return route.abort(); });
  await page.route("**/api/stripe/billing-portal", async (route) => {
    portalCalls += 1;
    expect(route.request().postDataJSON()).toEqual({ returnUrl: "http://127.0.0.1:5186/buyer/subscription" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, url: "https://billing.stripe.com/session/test" }) });
  });
  await page.route("https://billing.stripe.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "Stripe portal" }));
  await page.goto("/buyer/subscription");
  await expect(page.getByRole("button", { name: "Manage Plus plan in Stripe" })).toHaveCount(0);
  await expect(page.getByText("Current plan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manage Premium plan in Stripe" }).click();
  await page.waitForURL("https://billing.stripe.com/session/test");
  expect(portalCalls).toBe(1);
  expect(checkoutCalls).toBe(0);
});

test("active paid buyer rejects an untrusted Billing Portal URL in the status area", async ({ page }) => {
  let checkoutCalls = 0;
  await installBuyer(page);
  await page.route("**/api/buyer-plans/mine/usage", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    success: true,
    subscription: { id: "subscription-1", storedPlan: "PLUS", effectivePlan: "PLUS", displayName: "Plus", status: "ACTIVE", billingInterval: "MONTH", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, isPaid: true },
    entitlements: {}, usage: { savedSearches: { used: 0, limit: 50, unlimited: false, remaining: 50, atLimit: false }, watchlistItems: { used: 0, limit: 250, unlimited: false, remaining: 250, atLimit: false } }, implementation: {}, coreCommerce: {},
  }) }));
  await page.route("**/api/stripe/checkout/buyer-subscription", (route) => { checkoutCalls += 1; return route.abort(); });
  await page.route("**/api/stripe/billing-portal", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, url: "https://stripe.example.test/phishing" }) }));
  await page.goto("/buyer/subscription");
  await page.getByRole("button", { name: "Manage Ultra plan in Stripe" }).click();
  await expect(page.getByRole("alert")).toContainText("Stripe returned an untrusted billing URL.");
  expect(checkoutCalls).toBe(0);
  await expect(page).toHaveURL(/\/buyer\/subscription$/);
});

test("paid cancellation schedules period end and scheduled cancellation offers resume only", async ({ page }) => {
  let cancelCalls = 0;
  let usageCalls = 0;
  await installBuyer(page);
  const subscription = { id: "subscription-1", storedPlan: "PLUS", effectivePlan: "PLUS", displayName: "Plus", status: "ACTIVE", billingInterval: "MONTH", currentPeriodStart: null, currentPeriodEnd: "2026-09-01T00:00:00.000Z", cancelAtPeriodEnd: false, isPaid: true };
  await page.route("**/api/buyer-plans/mine/usage", (route) => {
    usageCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      success: true, subscription, entitlements: {}, usage: { savedSearches: { used: 0, limit: 50, unlimited: false, remaining: 50, atLimit: false }, watchlistItems: { used: 0, limit: 250, unlimited: false, remaining: 250, atLimit: false } }, implementation: {}, coreCommerce: {},
    }) });
  });
  await page.route("**/api/buyer-plans/mine/cancel-at-period-end", async (route) => {
    cancelCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, pendingWebhookSync: true, cancelAtPeriodEnd: true }) });
  });
  await page.goto("/buyer/subscription");
  await expect(page.getByRole("button", { name: "Downgrade to Free" })).toBeVisible();
  const usageCallsBeforeCancellation = usageCalls;
  await page.getByRole("button", { name: "Downgrade to Free" }).click();
  await expect(page.getByText("Stripe confirmation is pending.")).toBeVisible();
  expect(cancelCalls).toBe(1);
  expect(usageCalls).toBe(usageCallsBeforeCancellation);
  await expect(page.getByRole("button", { name: "Resume subscription" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Downgrade to Free" })).toHaveCount(0);
});

test("failed cancellation preserves the paid state and permits a later retry", async ({ page }) => {
  let cancelCalls = 0;
  await installBuyer(page);
  await page.route("**/api/buyer-plans/mine/usage", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    success: true,
    subscription: { id: "subscription-1", storedPlan: "PLUS", effectivePlan: "PLUS", displayName: "Plus", status: "ACTIVE", billingInterval: "MONTH", currentPeriodStart: null, currentPeriodEnd: "2026-09-01T00:00:00.000Z", cancelAtPeriodEnd: false, isPaid: true },
    entitlements: {}, usage: { savedSearches: { used: 0, limit: 50, unlimited: false, remaining: 50, atLimit: false }, watchlistItems: { used: 0, limit: 250, unlimited: false, remaining: 250, atLimit: false } }, implementation: {}, coreCommerce: {},
  }) }));
  await page.route("**/api/buyer-plans/mine/cancel-at-period-end", async (route) => {
    cancelCalls += 1;
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Stripe cancellation failed" }) });
  });
  await page.goto("/buyer/subscription");
  await page.getByRole("button", { name: "Downgrade to Free" }).click();
  await expect(page.getByRole("alert")).toContainText("Stripe cancellation failed");
  await expect(page.getByRole("button", { name: "Downgrade to Free" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume subscription" })).toHaveCount(0);
  expect(cancelCalls).toBe(1);
});

test("ended buyer with effective Free can begin a new paid Checkout", async ({ page }) => {
  let checkoutCalls = 0;
  await installBuyer(page);
  await page.route("**/api/buyer-plans/mine/usage", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    success: true,
    subscription: { id: "subscription-ended", storedPlan: "PLUS", effectivePlan: "FREE", displayName: "Free", status: "CANCELED", billingInterval: "MONTH", currentPeriodStart: null, currentPeriodEnd: "2026-07-01T00:00:00.000Z", cancelAtPeriodEnd: false, isPaid: false },
    entitlements: {}, usage: { savedSearches: { used: 0, limit: 5, unlimited: false, remaining: 5, atLimit: false }, watchlistItems: { used: 0, limit: 25, unlimited: false, remaining: 25, atLimit: false } }, implementation: {}, coreCommerce: {},
  }) }));
  await page.route("**/api/stripe/checkout/buyer-subscription", async (route) => {
    checkoutCalls += 1;
    expect(route.request().postDataJSON()).toEqual({ planCode: "PLUS", billingInterval: "MONTH" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, url: "https://checkout.stripe.com/test-session" }) });
  });
  await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "Stripe checkout" }));
  await page.goto("/buyer/subscription");
  await page.getByRole("button", { name: "Choose Plus" }).click();
  await page.waitForURL("https://checkout.stripe.com/test-session");
  expect(checkoutCalls).toBe(1);
});

test("Buyer Subscription remains usable on desktop/mobile in light/dark themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await installBuyer(page, theme);
      await page.goto("/buyer/subscription");
      await expect(page.getByRole("heading", { name: "Buyer Subscription" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Billing interval" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Choose Plus" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  }
});

test("Buyer Tools supports keyboard, Escape, outside click, focus return, and viewport containment", async ({ page }) => {
  await installBuyer(page);
  await page.goto("/marketplace");
  const menu = page.locator(".site-workspace-menu");
  const trigger = menu.locator("summary");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  const box = await menu.locator(".site-workspace-panel").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(menu).not.toHaveAttribute("open", "");
});

test("desktop header and mobile buyer navigation stay within the viewport", async ({ page }) => {
  await installBuyer(page);
  await page.goto("/marketplace");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await page.setViewportSize({ width: 375, height: 760 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.locator('summary[aria-label="Toggle navigation menu"]').click();
  const mobile = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobile).toBeVisible();
  for (const [label, path] of supportedBuyerLinks) {
    await expect(mobile.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", path);
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`Knowledge Center empty state and controls are readable in ${theme} mode`, async ({ page }) => {
    await installBuyer(page, theme);
    await page.goto("/knowledge");
    const empty = page.getByRole("status").filter({ hasText: "No lessons found" });
    await expect(empty).toBeVisible();
    await expect(empty.getByRole("heading", { name: "No lessons found" })).toBeVisible();
    await expect(empty).toContainText("No published lessons are available");
    const search = page.getByRole("button", { name: "Search", exact: true });
    await expect(search).toBeEnabled();
    const contrast = await contrastRatio(search);
    expect(contrast.ratio, `${contrast.foreground} on ${contrast.background}`).toBeGreaterThanOrEqual(4.5);
    await search.focus();
    await expect(search).toBeFocused();
    expect(await search.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  });
}

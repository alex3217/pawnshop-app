import { expect, test, type Page, type Route } from "@playwright/test";

type Shop = Record<string, unknown> & { id: string; name: string };
const LIMIT = 25;

const lifecycleShops: Shop[] = [
  { id: "free", name: "Free Loop", address: "1 Main", ownerName: "Fran Free", ownerEmail: "free@example.test", subscriptionPlan: "FREE", subscriptionStatus: "ACTIVE", subscriptionBillingInterval: "MONTHLY", cancelAtPeriodEnd: false, stripeCustomerId: null, stripeSubscriptionId: null, isDeleted: false },
  { id: "active", name: "Active Pro", address: "2 Main", ownerName: "Avery Active", ownerEmail: "active@example.test", subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE", subscriptionBillingInterval: "MONTHLY", cancelAtPeriodEnd: false, stripeCustomerId: "cus_active", stripeSubscriptionId: "sub_active", isDeleted: false },
  { id: "canceling", name: "Canceling Premium", address: "3 Main", ownerName: "Casey Cancel", ownerEmail: "cancel@example.test", subscriptionPlan: "PREMIUM", subscriptionStatus: "TRIALING", subscriptionBillingInterval: "MONTHLY", cancelAtPeriodEnd: true, stripeCustomerId: "cus_cancel", stripeSubscriptionId: "sub_cancel", isDeleted: false },
  { id: "canceled", name: "Canceled Ultra", address: "4 Main", ownerName: "Cam Canceled", ownerEmail: "canceled@example.test", subscriptionPlan: "ULTRA", subscriptionStatus: "CANCELED", subscriptionBillingInterval: "YEARLY", cancelAtPeriodEnd: true, stripeCustomerId: "cus_canceled", stripeSubscriptionId: "sub_canceled", isDeleted: false },
  { id: "unpaid", name: "Unpaid Pro", address: "5 Main", ownerName: "Uma Unpaid", ownerEmail: "unpaid@example.test", subscriptionPlan: "PRO", subscriptionStatus: "UNPAID", subscriptionBillingInterval: "MONTHLY", cancelAtPeriodEnd: false, stripeCustomerId: "cus_unpaid", stripeSubscriptionId: "sub_unpaid", isDeleted: false },
  { id: "expired", name: "Expired Pro", address: "6 Main", ownerName: "Evan Expired", ownerEmail: "expired@example.test", subscriptionPlan: "PRO", subscriptionStatus: "INCOMPLETE_EXPIRED", subscriptionBillingInterval: "MONTHLY", cancelAtPeriodEnd: true, stripeCustomerId: "cus_expired", stripeSubscriptionId: "sub_expired", isDeleted: false },
  { id: "unlinked", name: "Unlinked Pro", address: "7 Main", ownerName: "Pat Unlinked", ownerEmail: "unlinked@example.test", subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE", subscriptionBillingInterval: "MONTHLY", cancelAtPeriodEnd: false, stripeCustomerId: "cus_unlinked", stripeSubscriptionId: null, isDeleted: false },
  { id: "unknown", name: "Unknown Pro", address: "8 Main", ownerName: "Uri Unknown", ownerEmail: "unknown@example.test", subscriptionPlan: "PRO", subscriptionStatus: "FUTURE_STATUS", subscriptionBillingInterval: "MONTHLY", cancelAtPeriodEnd: true, stripeCustomerId: "cus_unknown", stripeSubscriptionId: "sub_unknown", isDeleted: false },
  { id: "deleted", name: "Deleted Deals", address: "9 Main", ownerName: "Dana Deleted", ownerEmail: "deleted@example.test", subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE", subscriptionBillingInterval: "MONTHLY", cancelAtPeriodEnd: false, stripeSubscriptionId: "sub_deleted", isDeleted: true },
];

const plans = [
  { code: "FREE", monthlyPriceCents: 0, yearlyPriceCents: 0 },
  { code: "PRO", monthlyPriceCents: 4900, yearlyPriceCents: 49000 },
  { code: "PREMIUM", yearlyPriceCents: 149000 },
  { code: "ULTRA", monthlyPriceCents: 29900, yearlyPriceCents: 299000 },
];

function paged(rows: Shop[], page = 1, total = rows.length, metadata: Record<string, unknown> = {}) {
  const totalPages = Math.max(Math.ceil(total / LIMIT), 1);
  return { success: true, shops: rows, pagination: { page, limit: LIMIT, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1, ...metadata } };
}

async function authenticate(page: Page, role = "SUPER_ADMIN") {
  await page.addInitScript((activeRole) => {
    localStorage.setItem("auth_token", "seller-subscriptions-token");
    localStorage.setItem("auth_role", activeRole);
    localStorage.setItem("auth_user", JSON.stringify({ id: "admin-1", email: "admin@example.test", role: activeRole }));
  }, role);
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function filteredRows(url: URL, source = lifecycleShops) {
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const plan = url.searchParams.get("subscriptionPlan");
  const status = url.searchParams.get("subscriptionStatus");
  const excludeDeleted = url.searchParams.get("isDeleted") === "false";
  return source.filter((shop) => {
    const haystack = [shop.name, shop.address, shop.ownerName, shop.ownerEmail, shop.stripeCustomerId, shop.stripeSubscriptionId].filter(Boolean).join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (!plan || shop.subscriptionPlan === plan) && (!status || shop.subscriptionStatus === status) && (!excludeDeleted || shop.isDeleted !== true);
  });
}

async function installApi(page: Page, shopsHandler?: (route: Route, url: URL) => Promise<void>) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/super-admin/shops")) {
      if (shopsHandler) return shopsHandler(route, url);
      const rows = filteredRows(url);
      const requestedPage = Number(url.searchParams.get("page") || 1);
      return fulfillJson(route, paged(rows.slice((requestedPage - 1) * LIMIT, requestedPage * LIMIT), requestedPage, rows.length));
    }
    if (url.pathname.endsWith("/super-admin/plans/seller")) return fulfillJson(route, { success: true, plans });
    if (url.pathname.endsWith("/admin/subscriptions")) return fulfillJson(route, {
      success: true,
      subscriptions: [
        { id: "admin-pro", shopName: "Admin Pro Pawn", ownerName: "Ada Admin", ownerEmail: "ada@example.test", subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE", billingInterval: "MONTHLY", subscriptionCurrentPeriodEnd: "2026-09-01T00:00:00.000Z", stripeCustomerId: "cus_admin", stripeSubscriptionId: "sub_admin" },
        { id: "admin-ultra", shopName: "Admin Ultra Pawn", ownerName: "Uma Owner", ownerEmail: "uma@example.test", subscriptionPlan: "ULTRA", subscriptionStatus: "PAST_DUE", billingInterval: "YEARLY", subscriptionCurrentPeriodEnd: null, stripeCustomerId: null, stripeSubscriptionId: "sub_ultra_admin" },
      ],
    });
    return fulfillJson(route, { success: true });
  });
}

function card(page: Page, name: string) {
  return page.getByRole("article").filter({ hasText: name });
}

test.beforeEach(async ({ page }) => authenticate(page));

test("loads the first server page with truthful totals and read-only lifecycle labels", async ({ page }) => {
  await installApi(page);
  await page.goto("/super-admin/seller-subscriptions");
  await expect(page.getByRole("heading", { name: "Seller Subscriptions" })).toBeVisible();
  await expect(page.getByLabel("Seller subscription summary")).toContainText("Total matching sellers8");
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /cancel|renew/i })).toHaveCount(0);
  await expect(page.getByText(/require a separate Stripe-backed seller lifecycle endpoint/).first()).toBeVisible();
});

test("derives every renewal label from plan, status, linkage, and cancellation state", async ({ page }) => {
  await installApi(page);
  await page.goto("/super-admin/seller-subscriptions");
  await expect(card(page, "Free Loop")).toContainText("Not applicable");
  await expect(card(page, "Active Pro")).toContainText("Renews");
  await expect(card(page, "Canceling Premium")).toContainText("Cancels at period end");
  await expect(card(page, "Canceled Ultra")).toContainText("Inactive");
  await expect(card(page, "Unpaid Pro")).toContainText("Inactive");
  await expect(card(page, "Expired Pro")).toContainText("Inactive");
  await expect(card(page, "Unlinked Pro")).toContainText("Unavailable");
  await expect(card(page, "Unknown Pro")).toContainText("Unavailable");
});

test("preserves all plans, explicit zero, missing price, and strict unknown intervals", async ({ page }) => {
  const source = [...lifecycleShops, { ...lifecycleShops[1], id: "future-interval", name: "Future Interval", subscriptionBillingInterval: "FORTNIGHT" }];
  await installApi(page, async (route, url) => {
    const rows = filteredRows(url, source);
    return fulfillJson(route, paged(rows, 1, rows.length));
  });
  await page.goto("/super-admin/seller-subscriptions");
  for (const plan of ["FREE", "PRO", "PREMIUM", "ULTRA"]) await expect(page.getByRole("article").filter({ hasText: plan }).first()).toBeVisible();
  await expect(card(page, "Free Loop")).toContainText("$0.00/month");
  await expect(card(page, "Canceling Premium")).toContainText("Not available");
  await expect(card(page, "Future Interval")).toContainText("Not available");
  await expect(card(page, "Future Interval")).not.toContainText("$49.00/month");
});

test("navigates next and previous using one requested server page", async ({ page }) => {
  const source = Array.from({ length: 26 }, (_, index) => ({ ...lifecycleShops[1], id: `shop-${index + 1}`, name: `Shop ${index + 1}` }));
  const requested: number[] = [];
  await installApi(page, async (route, url) => {
    const requestedPage = Number(url.searchParams.get("page"));
    requested.push(requestedPage);
    const start = (requestedPage - 1) * LIMIT;
    return fulfillJson(route, paged(source.slice(start, start + LIMIT), requestedPage, source.length));
  });
  await page.goto("/super-admin/seller-subscriptions");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(card(page, "Shop 26")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  expect(requested.at(-2)).toBe(2);
  expect(requested.at(-1)).toBe(1);
});

test("sends global search, plan, status, and deletion filters and resets to page one", async ({ page }) => {
  const seen: URL[] = [];
  await installApi(page, async (route, url) => {
    seen.push(url);
    const rows = filteredRows(url);
    return fulfillJson(route, paged(rows, Number(url.searchParams.get("page")), rows.length));
  });
  await page.goto("/super-admin/seller-subscriptions");
  await page.getByLabel("Search").fill("Avery Active");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Seller plan").selectOption("PRO");
  await page.getByLabel("Status").selectOption("ACTIVE");
  await expect(card(page, "Active Pro")).toBeVisible();
  const last = seen.at(-1)!;
  expect(last.searchParams.get("page")).toBe("1");
  expect(last.searchParams.get("q")).toBe("Avery Active");
  expect(last.searchParams.get("subscriptionPlan")).toBe("PRO");
  expect(last.searchParams.get("subscriptionStatus")).toBe("ACTIVE");
  expect(last.searchParams.get("isDeleted")).toBe("false");
});

test("clears applied server filters", async ({ page }) => {
  await installApi(page);
  await page.goto("/super-admin/seller-subscriptions");
  await page.getByLabel("Search").fill("no match");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No matching seller subscriptions")).toBeVisible();
  await page.getByLabel("Seller subscription filters").getByRole("button", { name: "Clear filters" }).click();
  await expect(card(page, "Active Pro")).toBeVisible();
});

test("defensively excludes deleted shops from rows and page summaries", async ({ page }) => {
  await installApi(page, async (route) => fulfillJson(route, paged(lifecycleShops, 1, lifecycleShops.length)));
  await page.goto("/super-admin/seller-subscriptions");
  await expect(page.getByText("Deleted Deals")).toHaveCount(0);
  await expect(page.getByLabel("Seller subscription summary")).toContainText("This page · Non-free7");
});

test("superseded search requests cannot publish stale rows or loading state", async ({ page }) => {
  await installApi(page, async (route, url) => {
    const q = url.searchParams.get("q");
    if (q === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return fulfillJson(route, paged([{ ...lifecycleShops[0], id: "stale", name: "Stale Shop" }]));
    }
    if (q === "fast") return fulfillJson(route, paged([{ ...lifecycleShops[1], id: "fresh", name: "Fresh Shop" }]));
    return fulfillJson(route, paged(filteredRows(url)));
  });
  await page.goto("/super-admin/seller-subscriptions");
  await page.getByLabel("Search").fill("slow");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Search").fill("fast");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(card(page, "Fresh Shop")).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.getByText("Stale Shop")).toHaveCount(0);
  await expect(page.getByText("Loading seller subscriptions…")).toHaveCount(0);
});

test("a normal filter load clears and supersedes an explicitly delayed refresh", async ({ page }) => {
  let delayRefresh = false;
  let signalRefreshStarted!: () => void;
  let signalRefreshSettled!: () => void;
  let releaseRefresh!: () => void;
  const refreshStarted = new Promise<void>((resolve) => { signalRefreshStarted = resolve; });
  const refreshSettled = new Promise<void>((resolve) => { signalRefreshSettled = resolve; });
  const refreshRelease = new Promise<void>((resolve) => { releaseRefresh = resolve; });

  await installApi(page, async (route, url) => {
    if (delayRefresh && !url.searchParams.has("subscriptionPlan")) {
      signalRefreshStarted();
      await refreshRelease;
      try {
        return await fulfillJson(route, paged([{ ...lifecycleShops[0], id: "obsolete-refresh", name: "Obsolete Refresh Shop" }]));
      } catch {
        return;
      } finally {
        signalRefreshSettled();
      }
    }
    if (url.searchParams.get("subscriptionPlan") === "PRO") {
      return fulfillJson(route, paged([{ ...lifecycleShops[1], id: "newer-filter", name: "Newer Filter Shop" }]));
    }
    return fulfillJson(route, paged(filteredRows(url)));
  });

  await page.goto("/super-admin/seller-subscriptions");
  await expect(card(page, "Active Pro")).toBeVisible();
  delayRefresh = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await refreshStarted;
  await expect(page.getByRole("button", { name: "Refreshing…", exact: true })).toBeDisabled();

  await page.getByLabel("Seller plan").selectOption("PRO");
  await expect(card(page, "Newer Filter Shop")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Refreshing…", exact: true })).toHaveCount(0);

  releaseRefresh();
  await refreshSettled;
  await expect(page.getByText("Obsolete Refresh Shop")).toHaveCount(0);
  await expect(card(page, "Newer Filter Shop")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Loading seller subscriptions…")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Refreshing…", exact: true })).toHaveCount(0);
});

test("refresh failure preserves displayed rows and offers an accessible retry", async ({ page }) => {
  let fail = false;
  await installApi(page, async (route, url) => fail ? fulfillJson(route, { success: false, error: "Refresh unavailable" }, 503) : fulfillJson(route, paged(filteredRows(url))));
  await page.goto("/super-admin/seller-subscriptions");
  await expect(card(page, "Active Pro")).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("alert")).toContainText("Existing subscription data is still shown");
  await expect(page.getByRole("button", { name: "Retry refresh" })).toBeVisible();
  await expect(card(page, "Active Pro")).toBeVisible();
});

for (const [name, metadata] of [
  ["malformed totalPages formula", { totalPages: 2 }],
  ["inconsistent hasNextPage", { hasNextPage: true }],
  ["inconsistent hasPreviousPage", { hasPreviousPage: true }],
] as const) {
  test(`rejects ${name}`, async ({ page }) => {
    await installApi(page, async (route) => fulfillJson(route, paged(lifecycleShops.slice(0, 1), 1, 1, metadata)));
    await page.goto("/super-admin/seller-subscriptions");
    await expect(page.getByRole("alert")).toContainText("pagination metadata is invalid");
    await expect(page.getByRole("article")).toHaveCount(0);
  });
}

test("recovers once when deletion leaves the requested page beyond the final page", async ({ page }) => {
  const source = Array.from({ length: 26 }, (_, index) => ({ ...lifecycleShops[1], id: `shrinking-${index}`, name: `Shrinking ${index}` }));
  const requested: number[] = [];
  let shrunk = false;
  await installApi(page, async (route, url) => {
    const requestedPage = Number(url.searchParams.get("page"));
    if (shrunk) requested.push(requestedPage);
    if (requestedPage === 2 && shrunk) return fulfillJson(route, paged([], 2, 1));
    const active = shrunk ? source.slice(0, 1) : source;
    const start = (requestedPage - 1) * LIMIT;
    return fulfillJson(route, paged(active.slice(start, start + LIMIT), requestedPage, active.length));
  });
  await page.goto("/super-admin/seller-subscriptions");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  shrunk = true;
  requested.length = 0;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await expect(card(page, "Shrinking 0")).toBeVisible();
  await page.waitForTimeout(100);
  expect(requested).toEqual([2, 1]);
});

test("a single failed refresh recovery preserves rows and exposes a retryable warning", async ({ page }) => {
  const source = Array.from({ length: 26 }, (_, index) => ({ ...lifecycleShops[1], id: `recovery-${index}`, name: `Recovery ${index}` }));
  const requested: number[] = [];
  let shrinking = false;
  await installApi(page, async (route, url) => {
    const requestedPage = Number(url.searchParams.get("page"));
    if (shrinking) {
      requested.push(requestedPage);
      if (requestedPage === 2) return fulfillJson(route, paged([], 2, 1));
      return fulfillJson(route, { success: false, error: "Fallback unavailable" }, 503);
    }
    const start = (requestedPage - 1) * LIMIT;
    return fulfillJson(route, paged(source.slice(start, start + LIMIT), requestedPage, source.length));
  });
  await page.goto("/super-admin/seller-subscriptions");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(card(page, "Recovery 25")).toBeVisible();
  shrinking = true;
  requested.length = 0;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("alert")).toContainText("Fallback unavailable");
  await expect(page.getByRole("button", { name: "Retry refresh" })).toBeVisible();
  await expect(card(page, "Recovery 25")).toBeVisible();
  await page.waitForTimeout(100);
  expect(requested).toEqual([2, 1]);
});

test("rejects a returned page greater than totalPages when recovery also returns malformed data", async ({ page }) => {
  await installApi(page, async (route) => fulfillJson(route, paged([], 2, 1, { hasPreviousPage: true })));
  await page.goto("/super-admin/seller-subscriptions");
  await expect(page.getByRole("alert")).toContainText("pagination metadata is invalid");
});

test("renders a valid empty result and retries an initial failure", async ({ page }) => {
  let fail = true;
  await installApi(page, async (route) => fail ? fulfillJson(route, { success: false, error: "Shop service unavailable" }, 503) : fulfillJson(route, paged([])));
  await page.goto("/super-admin/seller-subscriptions");
  await expect(page.getByRole("alert")).toContainText("Shop service unavailable");
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No matching seller subscriptions")).toBeVisible();
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
});

test("uses the real dark Admin theme without mobile overflow or clipped focus targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApi(page);
  await page.goto("/super-admin/seller-subscriptions");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await card(page, "Active Pro").getByText("Administrative identifiers").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const focusables = page.locator(".seller-subscriptions-page a, .seller-subscriptions-page button, .seller-subscriptions-page input, .seller-subscriptions-page select, .seller-subscriptions-page summary");
  for (const element of await focusables.all()) {
    const box = await element.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});

test("blocks Admin users while retaining Super Admin seller/buyer route separation", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("auth_role", "ADMIN");
    localStorage.setItem("auth_user", JSON.stringify({ id: "admin-1", role: "ADMIN" }));
  });
  await installApi(page);
  await page.goto("/super-admin/seller-subscriptions");
  await expect(page).not.toHaveURL(/\/super-admin\/seller-subscriptions$/);
});

test("regular Admin subscriptions use the existing complete Admin contract and client-side global filters", async ({ page }) => {
  await authenticate(page, "ADMIN");
  await installApi(page);
  await page.goto("/admin/subscriptions");
  await expect(page).toHaveURL(/\/admin\/subscriptions$/);
  await expect(page.getByRole("heading", { name: "Seller Subscriptions & Plans" })).toBeVisible();
  await expect(card(page, "Admin Pro Pawn")).toContainText("PRO");
  await expect(card(page, "Admin Pro Pawn")).toContainText("ACTIVE");
  await expect(card(page, "Admin Pro Pawn")).toContainText("MONTHLY");
  await expect(card(page, "Admin Pro Pawn")).toContainText("Not available");
  await expect(card(page, "Admin Pro Pawn")).not.toContainText("Not applicable");
  await expect(page.getByLabel("Seller subscription summary")).toContainText("Total matching sellers2");
  await expect(page.getByLabel("Seller subscription summary")).toContainText("Cancellation stateNot available");

  await page.getByLabel("Search").fill("Uma Owner");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(card(page, "Admin Ultra Pawn")).toBeVisible();
  await expect(card(page, "Admin Pro Pawn")).toHaveCount(0);
  await expect(page.getByLabel("Seller subscription summary")).toContainText("Total matching sellers1");
  await page.getByLabel("Seller plan").selectOption("ULTRA");
  await page.getByLabel("Status").selectOption("PAST_DUE");
  await expect(card(page, "Admin Ultra Pawn")).toBeVisible();
  await page.getByLabel("Seller subscription filters").getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);

  await page.goto("/super-admin/seller-subscriptions");
  await expect(page).not.toHaveURL(/\/super-admin\/seller-subscriptions$/);
});

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "buyer-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "buyer-1", name: "Payment Methods Buyer", email: "buyer@example.test", role: "CONSUMER" }));
  });
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/api/auth/me"
      ? {
          success: true,
          user: {
            id: "buyer-1",
            name: "Payment Methods Buyer",
            email: "buyer@example.test",
            role: "CONSUMER",
          },
        }
      : {
          success: true,
          data: [],
          items: [],
          rows: [],
          notifications: [],
          unreadCount: 0,
          pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
        };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
});

test("buyer wallet lists only masked methods and supports default and removal actions", async ({ page }) => {
  let methods = [
    { id: "pm_visa", type: "card", brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, funding: "credit", default: false, expired: false, status: "READY" },
    { id: "pm_bank", type: "us_bank_account", brand: "Test Bank", last4: "6789", expMonth: null, expYear: null, funding: null, default: true, expired: false, status: "READY" },
  ];
  await page.route("**/api/stripe/payment-methods**", async (route) => {
    const request = route.request();
    if (request.method() === "DELETE") methods = methods.filter((method) => method.id !== "pm_visa");
    if (request.method() === "POST" && request.url().endsWith("/pm_visa/default")) methods = methods.map((method) => ({ ...method, default: method.id === "pm_visa" }));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, methods, defaultPaymentMethodId: methods.find((method) => method.default)?.id ?? null, syncStatus: "SYNCED" }) });
  });

  await page.goto("/account/payment-methods");
  await expect(page.getByRole("heading", { name: "Payment Methods", exact: true })).toBeVisible();
  await expect(page.getByText("Visa ending in 4242")).toBeVisible();
  await expect(page.getByText("Test Bank ending in 6789")).toBeVisible();
  await expect(page.getByText("Synced with Stripe")).toBeVisible();
  await page.getByRole("button", { name: "Set as default" }).click();
  await expect(page.getByRole("status")).toContainText("Default payment method updated");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("Visa ending in 4242")).not.toBeVisible();
});

test("secure setup clearly requires explicit future-charge consent", async ({ page }) => {
  await page.route("**/api/stripe/payment-methods", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, methods: [], defaultPaymentMethodId: null, syncStatus: "NOT_CONFIGURED" }) }));
  await page.goto("/account/payment-methods");
  const setupButton = page.getByRole("button", { name: "Add payment method" });
  await expect(setupButton).toBeDisabled();
  await expect(page.getByText("Select the authorization checkbox to continue.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No saved payment methods" })).toBeVisible();
  await page.getByRole("button", { name: "Start secure payment method setup" }).click();
  await expect(page.getByRole("checkbox")).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Review and authorize the secure setup");
  await page.getByRole("checkbox").check();
  await expect(setupButton).toBeEnabled();

  const shell = await page.locator(".payment-methods-page").boundingBox();
  const checkbox = await page.getByRole("checkbox").boundingBox();
  const viewport = page.viewportSize();
  expect(shell).not.toBeNull();
  expect(checkbox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(shell!.x).toBeGreaterThanOrEqual(16);
  expect(shell!.x + shell!.width).toBeLessThanOrEqual(viewport!.width - 16);
  expect(checkbox!.width).toBeLessThanOrEqual(24);
});

test("billing portal opens a trusted Stripe session", async ({ page }) => {
  await page.route("**/api/stripe/payment-methods", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, methods: [], defaultPaymentMethodId: null, syncStatus: "NOT_CONFIGURED" }) }));
  await page.route("**/api/stripe/billing-portal", async (route) => {
    const payload = route.request().postDataJSON() as { shopId: string | null; returnUrl: string };
    expect(payload.shopId).toBeNull();
    expect(payload.returnUrl).toContain("/account/payment-methods");
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, url: "https://billing.stripe.com/session/test" }) });
  });
  await page.route("https://billing.stripe.com/session/test", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Stripe billing</h1>" }));

  await page.goto("/account/payment-methods");
  await page.getByRole("button", { name: "Open Stripe billing portal" }).click();
  await expect(page).toHaveURL("https://billing.stripe.com/session/test");
  await expect(page.getByRole("heading", { name: "Stripe billing" })).toBeVisible();
});

test("setup cancellation is visible and Stripe lookalike redirects are rejected", async ({ page }) => {
  await page.route("**/api/stripe/payment-methods", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, methods: [], defaultPaymentMethodId: null, syncStatus: "NOT_CONFIGURED" }) }));
  await page.route("**/api/stripe/payment-methods/setup-session", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, sessionId: "cs_test", url: "https://maliciousstripe.com/setup" }) }));
  await page.goto("/account/payment-methods?setup=canceled");
  await expect(page.getByRole("status")).toContainText("setup was canceled");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add payment method" }).click();
  await expect(page.getByRole("alert")).toContainText("untrusted setup URL");
  await expect(page).toHaveURL(/account\/payment-methods/);
});

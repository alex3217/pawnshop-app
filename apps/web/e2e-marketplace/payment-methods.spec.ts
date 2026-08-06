import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "buyer-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "buyer-1", email: "buyer@example.test", role: "CONSUMER" }));
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
  await expect(page.getByRole("heading", { name: "Payment Methods" })).toBeVisible();
  await expect(page.getByText("visa •••• 4242")).toBeVisible();
  await expect(page.getByText("Test Bank •••• 6789")).toBeVisible();
  await page.getByRole("button", { name: "Set default" }).click();
  await expect(page.getByRole("status")).toContainText("Default payment method updated");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("visa •••• 4242")).not.toBeVisible();
});

test("secure setup requires explicit future-charge consent", async ({ page }) => {
  await page.route("**/api/stripe/payment-methods", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, methods: [], defaultPaymentMethodId: null, syncStatus: "NOT_CONFIGURED" }) }));
  await page.goto("/account/payment-methods");
  await page.getByRole("button", { name: "Add or replace payment method" }).click();
  await expect(page.getByRole("alert")).toContainText("Consent is required");
  await expect(page.getByText("No payment methods saved")).toBeVisible();
});

test("payment methods retains production gutters and responsive control alignment", async ({ page }) => {
  await page.route("**/api/stripe/payment-methods", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        methods: [],
        defaultPaymentMethodId: null,
        syncStatus: "NOT_CONFIGURED",
      }),
    }),
  );

  await page.setViewportSize({ width: 1728, height: 1000 });
  await page.goto("/account/payment-methods");

  const pageShell = page.locator(".payment-methods-page");
  const desktopBox = await pageShell.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.x).toBeGreaterThanOrEqual(16);
  expect(desktopBox!.width).toBeLessThanOrEqual(1180);
  expect(desktopBox!.x).toBeCloseTo((1728 - desktopBox!.width) / 2, 0);

  const consent = page.locator(".payment-methods-consent");
  const checkbox = consent.getByRole("checkbox");
  const consentBox = await consent.boundingBox();
  const checkboxBox = await checkbox.boundingBox();
  expect(consentBox).not.toBeNull();
  expect(checkboxBox).not.toBeNull();
  expect(checkboxBox!.x).toBeGreaterThan(consentBox!.x);
  expect(checkboxBox!.x).toBeLessThan(consentBox!.x + 64);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBox = await pageShell.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.x).toBeGreaterThanOrEqual(8);
  expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(382);

  const primaryAction = page.getByRole("button", { name: "Add or replace payment method" });
  const portalAction = page.getByRole("button", { name: "Open Stripe billing portal" });
  const primaryBox = await primaryAction.boundingBox();
  const portalBox = await portalAction.boundingBox();
  expect(primaryBox).not.toBeNull();
  expect(portalBox).not.toBeNull();
  expect(primaryBox!.width).toBeCloseTo(portalBox!.width, 0);
});

test("setup cancellation is visible and Stripe lookalike redirects are rejected", async ({ page }) => {
  await page.route("**/api/stripe/payment-methods", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, methods: [], defaultPaymentMethodId: null, syncStatus: "NOT_CONFIGURED" }) }));
  await page.route("**/api/stripe/payment-methods/setup-session", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, sessionId: "cs_test", url: "https://maliciousstripe.com/setup" }) }));
  await page.goto("/account/payment-methods?setup=canceled");
  await expect(page.getByRole("status")).toContainText("setup was canceled");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add or replace payment method" }).click();
  await expect(page.getByRole("alert")).toContainText("untrusted setup URL");
  await expect(page).toHaveURL(/account\/payment-methods/);
});

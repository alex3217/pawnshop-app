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

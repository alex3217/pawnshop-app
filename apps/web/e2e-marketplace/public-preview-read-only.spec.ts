import { expect, test, type Page } from "@playwright/test";

async function installReadOnlyApi(page: Page) {
  let mutationRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutationRequests += 1;

    if (request.url().endsWith("/api/capabilities")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          publicPreview: {
            mode: "read-only",
            readOnly: true,
            productionWritesEnabled: false,
            errorCode: "PUBLIC_PREVIEW_READ_ONLY",
            retryAfterSeconds: 300,
          },
        }),
      });
    }

    if (request.url().includes("/api/marketplace-listings")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          rows: [{
            id: "preview-listing",
            itemId: "preview-item",
            sellerUserId: "preview-seller",
            sellerShopId: "preview-shop",
            listingType: "SHOP_TO_CUSTOMER",
            status: "ACTIVE",
            title: "Public preview listing",
            description: "Browsing-only test listing",
            category: "Electronics",
            condition: "Good",
            price: "100.00",
            currency: "USD",
            quantity: 1,
            images: [],
            allowOffers: true,
            pickupAvailable: true,
            shippingAvailable: false,
            seller: { id: "preview-seller", name: "Preview Seller", role: "OWNER" },
            sellerShop: { id: "preview-shop", name: "Preview Shop", ownerId: "preview-seller" },
            item: { id: "preview-item", title: "Public preview listing", status: "AVAILABLE" },
          }],
          pagination: { page: 1, limit: 48, total: 1, totalPages: 1 },
        }),
      });
    }

    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return () => mutationRequests;
}

test("public preview banner replaces registration and disables purchase CTA", async ({ page }) => {
  const mutationRequests = await installReadOnlyApi(page);

  await page.goto("/register");
  await expect(page.getByRole("status")).toContainText("Public preview — browsing only");
  await expect(page.getByRole("heading", { name: "Registration is paused" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create account/ })).toHaveCount(0);

  await page.goto("/marketplace/buy-now");
  const purchaseButton = page.getByRole("button", { name: "Purchases unavailable" });
  await expect(purchaseButton).toBeVisible();
  await expect(purchaseButton).toBeDisabled();
  await purchaseButton.click({ force: true });
  expect(mutationRequests()).toBe(0);
});

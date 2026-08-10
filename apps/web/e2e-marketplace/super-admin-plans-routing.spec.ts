import { expect, test } from "@playwright/test";

const sellerPlans = [
  {
    code: "FREE",
    label: "Free",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    maxActiveListings: 20,
    trialMaxActiveListings: 50,
    status: "ACTIVE",
    stripeSyncStatus: "NOT_REQUIRED",
    isPaid: false,
    isFree: true,
    version: "CONFIG",
    features: ["Up to 20 active products"],
  },
  {
    code: "PRO",
    label: "Pro",
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    maxActiveListings: 100,
    trialMaxActiveListings: 50,
    commissionBps: 900,
    status: "ACTIVE",
    stripeSyncStatus: "MISSING_REFERENCES",
    isPaid: true,
    isFree: false,
    version: "CONFIG",
    features: ["Up to 100 active listings", "Auction creation"],
  },
  {
    code: "PREMIUM",
    label: "Premium",
    monthlyPriceCents: 14900,
    yearlyPriceCents: 149000,
    status: "ACTIVE",
    stripeSyncStatus: "MISSING_REFERENCES",
    isPaid: true,
    isFree: false,
    version: "CONFIG",
    features: ["Unlimited active listings"],
  },
  {
    code: "ULTRA",
    label: "Ultra",
    monthlyPriceCents: 29900,
    yearlyPriceCents: 299000,
    status: "ACTIVE",
    stripeSyncStatus: "MISSING_REFERENCES",
    isPaid: true,
    isFree: false,
    version: "CONFIG",
    features: ["Unlimited locations", "Dedicated support"],
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "super-admin-token");
    localStorage.setItem("auth_role", "SUPER_ADMIN");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: "super-1",
        name: "Super Admin",
        email: "super@example.test",
        role: "SUPER_ADMIN",
      }),
    );
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/plans/seller") && request.method() === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ plans: sellerPlans }),
      });
    }

    if (path.endsWith("/plans/seller/PRO/impact")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          impact: {
            affectedShops: 1,
            affectedSubscriptions: 1,
            currentMrrCents: 4900,
            projectedMrrCents: 4900,
            mrrDeltaCents: 0,
            requiresGrandfathering: true,
          },
        }),
      });
    }

    if (path.endsWith("/plans/seller/PRO") && request.method() === "PATCH") {
      const input = request.postDataJSON();
      const pro = sellerPlans.find((plan) => plan.code === "PRO");
      if (pro) {
        Object.assign(pro, {
          stripeMonthlyPriceId: input.stripeMonthlyPriceId,
          stripeYearlyPriceId: input.stripeYearlyPriceId,
          stripeSyncStatus: "CONFIGURED",
          version: "2026-08-10T18:00:00.000Z",
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true, plans: sellerPlans }),
      });
    }

    if (path.endsWith("/plans/buyer")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ plans: [] }),
      });
    }
    if (path.includes("buyer-subscriptions")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          rows: [],
          pagination: {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      });
    }
    if (path.includes("/super-admin/shops")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          shops: [],
          pagination: {
            page: 1,
            limit: 250,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      });
    }
    return route.fulfill({ contentType: "application/json", body: "{}" });
  });
});

test("four distinct seller/buyer plan and subscription routes render the correct workflow", async ({
  page,
}) => {
  await page.goto("/super-admin/plans/seller");
  await expect(
    page.getByRole("heading", { name: "Seller Plan Control" }),
  ).toBeVisible();
  await expect(page.getByText("$49.00/month")).toBeVisible();
  await expect(page.getByText("20").first()).toBeVisible();

  await page.goto("/super-admin/seller-subscriptions");
  await expect(
    page.getByRole("heading", { name: "Seller Subscriptions" }),
  ).toBeVisible();

  await page.goto("/super-admin/plans/buyer");
  await expect(
    page.getByRole("heading", { name: "Buyer Plan Control" }),
  ).toBeVisible();

  await page.goto("/super-admin/buyer-subscriptions");
  await expect(
    page.getByRole("heading", { name: "Buyer Subscriptions" }),
  ).toBeVisible();
});

test("seller-plan page actions, dialogs, downloads, and pricing toggle work", async ({
  page,
}) => {
  await page.goto("/super-admin/plans/seller");

  await expect(
    page.getByLabel("Seller plan actions").getByRole("link", { name: "Seller Subscriptions" }),
  ).toHaveAttribute("href", "/super-admin/seller-subscriptions");
  await expect(
    page.getByRole("link", { name: "View audit history" }),
  ).toHaveAttribute("href", "/super-admin/audit?q=SELLER_PLAN");

  await page.getByRole("button", { name: "Compare plans" }).click();
  await expect(
    page.getByRole("heading", { name: "Seller plan comparison" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hide comparison" }),
  ).toBeVisible();

  await page.getByRole("switch", { name: "Show yearly pricing" }).click();
  await expect(page.getByText("$490.00/year")).toBeVisible();

  const proCard = page
    .locator("article.seller-plan-card")
    .filter({ has: page.getByRole("heading", { name: "PRO", exact: true }) });

  await proCard.getByRole("button", { name: "View details" }).click();
  await expect(
    page.getByRole("dialog", { name: "PRO seller-plan details" }),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  await proCard
    .getByRole("button", { name: "Preview owner-facing plan" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Pro owner-facing preview" }),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  const duplicate = page.waitForEvent("download");
  await proCard.getByRole("button", { name: "Duplicate plan" }).click();
  await expect((await duplicate).suggestedFilename()).toBe("pro-seller-plan-draft.json");

  const exportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export plans" }).click();
  await expect((await exportDownload).suggestedFilename()).toBe("seller-plans.json");

  await proCard
    .getByRole("button", { name: "Validate Stripe references" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "missing its monthly Price ID and yearly Price ID",
  );

  await proCard
    .getByRole("button", { name: "Schedule future change" })
    .click();
  const scheduleDialog = page.getByRole("dialog");
  await expect(
    scheduleDialog.getByRole("heading", { name: "Schedule changes for PRO" }),
  ).toBeVisible();
  await expect(scheduleDialog.getByLabel("Future effective date")).not.toHaveValue("");
  await scheduleDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("status")).toContainText("Seller plans refreshed");
});

test("Edit plan saves paid-plan monthly and yearly Stripe Price IDs", async ({
  page,
}) => {
  await page.goto("/super-admin/plans/seller");
  const proCard = page
    .locator("article.seller-plan-card")
    .filter({ has: page.getByRole("heading", { name: "PRO", exact: true }) });

  await proCard.getByRole("button", { name: "Edit plan" }).click();
  const editor = page.getByRole("dialog");
  await expect(
    editor.getByRole("heading", { name: "Edit PRO" }),
  ).toBeVisible();

  await editor
    .getByLabel("Monthly Stripe Price ID")
    .fill("price_1U2vlFBdZzXFlZiTqzPSJdnq");
  await editor
    .getByLabel("Yearly Stripe Price ID")
    .fill("price_1U2vmXBdZzXFlZiTp9sMhsWP");

  page.once("dialog", (dialog) => dialog.accept());
  await editor
    .getByRole("button", { name: "Preview impact and publish" })
    .click();

  await expect(page.getByRole("status")).toContainText("Seller plan updated");
  await expect(proCard.getByText("CONFIGURED")).toBeVisible();

  await proCard.getByRole("button", { name: "Edit plan" }).click();
  const reopened = page.getByRole("dialog");
  await expect(reopened.getByLabel("Monthly Stripe Price ID")).toHaveValue(
    "price_1U2vlFBdZzXFlZiTqzPSJdnq",
  );
  await expect(reopened.getByLabel("Yearly Stripe Price ID")).toHaveValue(
    "price_1U2vmXBdZzXFlZiTp9sMhsWP",
  );
});

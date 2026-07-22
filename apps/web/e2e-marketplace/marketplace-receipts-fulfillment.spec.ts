import {
  expect,
  test,
  type Page,
} from "@playwright/test";

const TRANSACTION_ID = "marketplace-receipt-browser-test";
const BUYER_ID = "marketplace-receipt-buyer";
const ACTOR_USER_ID = "internal-actor-user-id-must-not-render";

type FixtureOptions = {
  status?: "PENDING" | "PAID" | "COMPLETED";
  fulfillmentStatus?:
    | "PAYMENT_PENDING"
    | "READY_FOR_PICKUP"
    | "SHIPPED"
    | "COMPLETED";
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  carrier?: string;
  trackingNumber?: string;
  pickupInstructions?: string;
  history?: Array<Record<string, unknown>> | null;
};

function transactionFixture({
  status = "PAID",
  fulfillmentStatus = "PAYMENT_PENDING",
  pickupAvailable = true,
  shippingAvailable = false,
  carrier = "",
  trackingNumber = "",
  pickupInstructions = "",
  history = [],
}: FixtureOptions = {}) {
  const fulfillment: Record<string, unknown> = {
    status: fulfillmentStatus,
    carrier: carrier || null,
    trackingNumber: trackingNumber || null,
    pickupInstructions: pickupInstructions || null,
    updatedAt: "2026-07-20T16:00:00.000Z",
  };

  if (history !== null) {
    fulfillment.history = history;
  }

  return {
    id: TRANSACTION_ID,
    listingId: "marketplace-receipt-listing",
    buyerUserId: BUYER_ID,
    buyerShopId: null,
    sellerUserId: "marketplace-receipt-seller",
    sellerShopId: null,
    type: "DIRECT_PURCHASE",
    status,
    quantity: 1,
    subtotal: "120.00",
    platformFee: "18.00",
    shippingFee: shippingAvailable ? "12.00" : "0.00",
    taxAmount: "9.60",
    totalAmount: shippingAvailable ? "141.60" : "129.60",
    currency: "USD",
    paymentIntentId: status === "PENDING" ? null : "pi_receipt_browser",
    fulfillmentStatus,
    completedAt:
      status === "COMPLETED" ? "2026-07-21T18:30:00.000Z" : null,
    canceledAt: null,
    metadata: {
      sellerNetCents: 10200,
      fulfillment,
    },
    createdAt: "2026-07-20T14:00:00.000Z",
    updatedAt: "2026-07-21T18:30:00.000Z",
    listing: {
      id: "marketplace-receipt-listing",
      itemId: null,
      sellerUserId: "marketplace-receipt-seller",
      sellerShopId: null,
      listingType: "CUSTOMER_TO_CUSTOMER",
      status: status === "PENDING" ? "RESERVED" : "SOLD",
      title: "Receipt browser test item",
      description: "Deterministic receipt and fulfillment fixture.",
      category: "Collectibles",
      condition: "Excellent",
      price: "120.00",
      currency: "USD",
      quantity: 0,
      images: [],
      pickupAvailable,
      shippingAvailable,
      createdAt: "2026-07-20T14:00:00.000Z",
      updatedAt: "2026-07-21T18:30:00.000Z",
    },
    buyer: {
      id: BUYER_ID,
      name: "Receipt Browser Buyer",
      role: "CONSUMER",
    },
    buyerShop: null,
    seller: {
      id: "marketplace-receipt-seller",
      name: "Receipt Browser Seller",
      role: "CONSUMER",
    },
    sellerShop: null,
  };
}

async function installAuth(page: Page) {
  await page.addInitScript(({ buyerId }) => {
    localStorage.setItem("auth_token", "marketplace-receipt-browser-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: buyerId,
      name: "Receipt Browser Buyer",
      email: "buyer@receipt-browser.pawnloop.test",
      role: "CONSUMER",
    }));
  }, { buyerId: BUYER_ID });
}

async function installMocks(
  page: Page,
  transaction = transactionFixture(),
) {
  await page.route("https://js.stripe.com/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let body: unknown;

    if (pathname === `/api/marketplace-transactions/${TRANSACTION_ID}`) {
      body = { success: true, transaction };
    } else if (pathname === "/api/marketplace-transactions/mine/purchases") {
      body = {
        success: true,
        rows: [transaction],
        pagination: { page: 1, limit: 12, total: 1, pages: 1 },
      };
    } else if (pathname === "/api/auth/me") {
      body = {
        success: true,
        user: {
          id: BUYER_ID,
          name: "Receipt Browser Buyer",
          email: "buyer@receipt-browser.pawnloop.test",
          role: "CONSUMER",
        },
      };
    } else {
      body = { success: true, rows: [] };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function openTransaction(page: Page, options?: FixtureOptions) {
  await installAuth(page);
  await installMocks(page, transactionFixture(options));
  await page.goto(`/marketplace/transactions/${TRANSACTION_ID}`);
  await expect(page.getByRole("heading", { name: "Receipt browser test item" }))
    .toBeVisible();
}

test("paid transaction shows a printable transaction confirmation", async ({ page }) => {
  await openTransaction(page, { status: "PAID" });

  const confirmation = page.getByRole("region", { name: "Transaction confirmation" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "Print confirmation" }))
    .toBeVisible();
});

test("completed transaction shows its completion date", async ({ page }) => {
  await openTransaction(page, {
    status: "COMPLETED",
    fulfillmentStatus: "COMPLETED",
  });

  const confirmation = page.getByRole("region", { name: "Transaction confirmation" });
  const completedField = confirmation
    .locator("small")
    .getByText("Completed", { exact: true })
    .locator("..");
  await expect(completedField).toContainText("2026");
});

test("pending transaction hides confirmation and retains cancellation", async ({ page }) => {
  await openTransaction(page, { status: "PENDING" });

  await expect(page.getByRole("region", { name: "Transaction confirmation" }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel reservation" }))
    .toBeEnabled();
});

test("pickup shows instructions without shipping tracking", async ({ page }) => {
  await openTransaction(page, {
    fulfillmentStatus: "READY_FOR_PICKUP",
    pickupAvailable: true,
    shippingAvailable: false,
    pickupInstructions: "Bring photo ID to the service counter.",
  });

  const fulfillment = page.getByRole("heading", { name: "Fulfillment", exact: true })
    .locator("..");
  await expect(fulfillment.getByText("Bring photo ID to the service counter.")).toBeVisible();
  await expect(fulfillment.getByText("Tracking number", { exact: true })).toHaveCount(0);
});

test("shipping shows carrier and tracking without pickup instructions", async ({ page }) => {
  await openTransaction(page, {
    fulfillmentStatus: "SHIPPED",
    pickupAvailable: false,
    shippingAvailable: true,
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
  });

  const fulfillment = page.getByRole("heading", { name: "Fulfillment", exact: true })
    .locator("..");
  await expect(fulfillment.getByText("UPS", { exact: true })).toBeVisible();
  await expect(fulfillment.getByRole("link", { name: "1Z999AA10123456784" })).toBeVisible();
  await expect(fulfillment.getByText("Pickup instructions", { exact: true })).toHaveCount(0);
});

for (const { carrier, trackingNumber, href } of [
  {
    carrier: "USPS",
    trackingNumber: "9400111899223856928499",
    href: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223856928499",
  },
  {
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
    href: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
  },
  {
    carrier: "FedEx",
    trackingNumber: "999999999999",
    href: "https://www.fedex.com/fedextrack/?trknbr=999999999999",
  },
  {
    carrier: "DHL",
    trackingNumber: "1234567890",
    href: "https://www.dhl.com/global-en/home/tracking.html?tracking-id=1234567890",
  },
]) {
  test(`${carrier} tracking uses its trusted external link`, async ({ page }) => {
    await openTransaction(page, {
      fulfillmentStatus: "SHIPPED",
      pickupAvailable: false,
      shippingAvailable: true,
      carrier,
      trackingNumber,
    });

    const link = page.getByRole("link", { name: trackingNumber });
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });
}

test("unknown carrier renders tracking as plain text", async ({ page }) => {
  await openTransaction(page, {
    fulfillmentStatus: "SHIPPED",
    pickupAvailable: false,
    shippingAvailable: true,
    carrier: "Local Courier",
    trackingNumber: "LOCAL-8675309",
  });

  await expect(page.getByText("LOCAL-8675309", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "LOCAL-8675309" })).toHaveCount(0);
});

test("fulfillment history is chronological and never exposes actorUserId", async ({ page }) => {
  await openTransaction(page, {
    fulfillmentStatus: "SHIPPED",
    pickupAvailable: false,
    shippingAvailable: true,
    history: [
      {
        status: "SHIPPED",
        at: "2026-07-21T16:00:00.000Z",
        note: "Third chronological update",
        actorUserId: ACTOR_USER_ID,
      },
      {
        status: "PAYMENT_PENDING",
        at: "2026-07-20T15:00:00.000Z",
        note: "First chronological update",
        actorUserId: ACTOR_USER_ID,
      },
      {
        status: "READY_FOR_PICKUP",
        at: "2026-07-21T14:00:00.000Z",
        note: "Second chronological update",
        actorUserId: ACTOR_USER_ID,
      },
    ],
  });

  const timeline = page.getByRole("list").filter({
    has: page.getByText("First chronological update"),
  });
  await expect(timeline.locator("li")).toHaveText([
    /Payment Pending.*First chronological update/,
    /Ready For Pickup.*Second chronological update/,
    /Shipped.*Third chronological update/,
  ]);
  await expect(page.getByText(ACTOR_USER_ID, { exact: false })).toHaveCount(0);
});

test("missing fulfillment history shows unavailable state without crashing", async ({ page }) => {
  await openTransaction(page, { history: null });

  await expect(page.getByText("No fulfillment history is available yet.", { exact: true }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Transaction lifecycle" })).toBeVisible();
});

test("purchases route renders safely", async ({ page }) => {
  const transaction = transactionFixture({
    fulfillmentStatus: "SHIPPED",
    pickupAvailable: false,
    shippingAvailable: true,
  });
  await installAuth(page);
  await installMocks(page, transaction);
  await page.goto("/marketplace/purchases");

  await expect(page.getByRole("heading", { name: "My marketplace purchases" }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Receipt browser test item" }))
    .toBeVisible();
  await expect(page.getByText(ACTOR_USER_ID, { exact: false })).toHaveCount(0);
});

test("print media retains a readable confirmation and hides interactive chrome", async ({ page }) => {
  await openTransaction(page, { status: "PAID" });
  await page.emulateMedia({ media: "print" });

  const confirmation = page.getByRole("region", { name: "Transaction confirmation" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText(TRANSACTION_ID, { exact: true })).toBeVisible();
  await expect(confirmation.getByText("$129.60", { exact: true })).toBeVisible();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".marketplace-transaction__screen-actions")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print confirmation" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeHidden();
});

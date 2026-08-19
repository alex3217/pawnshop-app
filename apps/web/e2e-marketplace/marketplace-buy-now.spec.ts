import {
  expect,
  test,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const LISTING_ID =
  "buy-now-browser-listing";

const TRANSACTION_ID =
  "buy-now-browser-transaction";

const BUYER_ID =
  "buy-now-browser-buyer";

const SELLER_ID =
  "buy-now-browser-seller";

type MockState = {
  reserveRequests: number;
  lastReservation:
    | Record<string, unknown>
    | null;
};

function jsonBody(
  value: unknown,
) {
  return JSON.stringify(value);
}

function listingRecord(
  overrides: Record<string, unknown> = {},
) {
  return {
    id:
      LISTING_ID,

    itemId:
      "buy-now-browser-item",

    sellerUserId:
      SELLER_ID,

    sellerShopId:
      "buy-now-browser-shop",

    listingType:
      "SHOP_TO_CUSTOMER",

    status:
      "ACTIVE",

    title:
      "Buy Now browser test item",

    description:
      "An active listing used by the isolated Buy Now browser test.",

    category:
      "Electronics",

    condition:
      "Good",

    price:
      "120.00",

    currency:
      "USD",

    quantity:
      2,

    images: [
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400'%3E%3Crect width='800' height='400' fill='%234338ca'/%3E%3C/svg%3E",
    ],

    allowOffers:
      true,

    pickupAvailable:
      true,

    shippingAvailable:
      false,

    expiresAt:
      null,

    featuredUntil:
      null,

    publishedAt:
      "2026-07-19T13:00:00.000Z",

    createdAt:
      "2026-07-19T12:00:00.000Z",

    updatedAt:
      "2026-07-19T13:00:00.000Z",

    seller: {
      id:
        SELLER_ID,

      name:
        "Buy Now Browser Seller",

      role:
        "OWNER",
    },

    sellerShop: {
      id:
        "buy-now-browser-shop",

      name:
        "Buy Now Browser Shop",

      address:
        "100 Test Street",

      city:
        "Houston",

      state:
        "TX",

      zip:
        "77001",

      phone:
        "555-0100",

      ownerId:
        SELLER_ID,
    },

    item: {
      id:
        "buy-now-browser-item",

      title:
        "Buy Now browser test item",

      status:
        "AVAILABLE",

      pawnShopId:
        "buy-now-browser-shop",
    },

    ...overrides,
  };
}

function listingListPayload(
  rows = [listingRecord()],
) {
  return {
    success:
      true,

    rows,

    pagination: {
      page:
        1,

      limit:
        48,

      total:
        rows.length,

      totalPages:
        1,
    },
  };
}

function transactionRecord() {
  const listing =
    listingRecord();

  return {
    id:
      TRANSACTION_ID,

    listingId:
      LISTING_ID,

    buyerUserId:
      BUYER_ID,

    buyerShopId:
      null,

    sellerUserId:
      SELLER_ID,

    sellerShopId:
      "buy-now-browser-shop",

    type:
      "DIRECT_PURCHASE",

    status:
      "PENDING",

    quantity:
      1,

    subtotal:
      "120.00",

    platformFee:
      "0.00",

    shippingFee:
      "0.00",

    taxAmount:
      "0.00",

    totalAmount:
      "120.00",

    currency:
      "USD",

    paymentIntentId:
      null,

    fulfillmentStatus:
      "PAYMENT_PENDING",

    completedAt:
      null,

    canceledAt:
      null,

    metadata:
      {},

    createdAt:
      "2026-07-19T13:10:00.000Z",

    updatedAt:
      "2026-07-19T13:10:00.000Z",

    listing: {
      id:
        listing.id,

      itemId:
        listing.itemId,

      sellerUserId:
        listing.sellerUserId,

      sellerShopId:
        listing.sellerShopId,

      listingType:
        listing.listingType,

      status:
        "RESERVED",

      title:
        listing.title,

      description:
        listing.description,

      category:
        listing.category,

      condition:
        listing.condition,

      price:
        listing.price,

      currency:
        listing.currency,

      quantity:
        1,

      images:
        listing.images,

      pickupAvailable:
        listing.pickupAvailable,

      shippingAvailable:
        listing.shippingAvailable,

      createdAt:
        listing.createdAt,

      updatedAt:
        listing.updatedAt,
    },

    buyer: {
      id:
        BUYER_ID,

      name:
        "Buy Now Browser Buyer",

      role:
        "CONSUMER",
    },

    buyerShop:
      null,

    seller:
      listing.seller,

    sellerShop:
      listing.sellerShop,
  };
}

async function installAuth(
  page: Page,
  {
    userId = BUYER_ID,
    role = "CONSUMER",
  }: {
    userId?: string;
    role?:
      | "CONSUMER"
      | "OWNER"
      | "ADMIN"
      | "SUPER_ADMIN";
  } = {},
) {
  await page.addInitScript(
    ({
      storedUserId,
      storedRole,
    }) => {
      localStorage.setItem(
        "auth_token",
        "buy-now-browser-token",
      );

      localStorage.setItem(
        "auth_role",
        storedRole,
      );

      localStorage.setItem(
        "auth_user",
        JSON.stringify({
          id:
            storedUserId,

          name:
            "Buy Now Browser User",

          email:
            "buy-now-browser@pawnloop.test",

          role:
            storedRole,
        }),
      );
    },
    {
      storedUserId:
        userId,

      storedRole:
        role,
    },
  );
}

async function installMocks(
  page: Page,
  state: MockState,
  rows = [listingRecord()],
) {
  await page.route(
    "https://js.stripe.com/**",
    async (route) => {
      await route.abort();
    },
  );

  await page.route(
    "**/api/**",
    async (route) => {
      const request =
        route.request();

      const method =
        request.method();

      const pathname =
        new URL(
          request.url(),
        ).pathname;

      if (
        method === "GET" &&
        pathname === "/api/notifications"
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonBody({ success: true, notifications: [] }),
        });
        return;
      }

      if (
        method === "GET" &&
        pathname ===
          "/api/marketplace-listings"
      ) {
        await route.fulfill({
          status:
            200,

          contentType:
            "application/json",

          body:
            jsonBody(
              listingListPayload(rows),
            ),
        });

        return;
      }

      if (
        method === "POST" &&
        pathname ===
          "/api/auth/login"
      ) {
        await route.fulfill({
          status:
            200,

          contentType:
            "application/json",

          body:
            jsonBody({
              token:
                "buy-now-browser-login-token",

              user: {
                id:
                  BUYER_ID,

                name:
                  "Buy Now Browser Buyer",

                email:
                  "buy-now-browser@pawnloop.test",

                role:
                  "CONSUMER",
              },
            }),
        });

        return;
      }

      if (
        method === "POST" &&
        pathname ===
          "/api/marketplace-transactions/reserve"
      ) {
        state.reserveRequests +=
          1;

        state.lastReservation =
          request.postDataJSON() as Record<
            string,
            unknown
          >;

        await route.fulfill({
          status:
            201,

          contentType:
            "application/json",

          body:
            jsonBody({
              success:
                true,

              transaction:
                transactionRecord(),
            }),
        });

        return;
      }

      if (
        method === "GET" &&
        pathname ===
          `/api/marketplace-transactions/${TRANSACTION_ID}`
      ) {
        await route.fulfill({
          status:
            200,

          contentType:
            "application/json",

          body:
            jsonBody({
              success:
                true,

              transaction:
                transactionRecord(),
            }),
        });

        return;
      }

      await route.fulfill({
        status:
          200,

        contentType:
          "application/json",

        body:
          jsonBody({
            success:
              true,
          }),
      });
    },
  );
}

async function keepNavigationHelpVisible(
  page: Page,
) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "pawnloop-navigation-assistance-CONSUMER-v2",
      JSON.stringify({
        automaticPrompts: false,
        completedTopics: [],
        dismissedGuidance: true,
        floatingButtonVisible: true,
      }),
    );
  });
}

test("one published customer listing keeps a bounded 4:3 card and clears navigation help", async ({ page }) => {
  const state: MockState = { reserveRequests: 0, lastReservation: null };
  await installAuth(page);
  await keepNavigationHelpVisible(page);
  await installMocks(page, state, [
    listingRecord({
      itemId: null,
      sellerShopId: null,
      sellerShop: null,
      listingType: "CUSTOMER_TO_CUSTOMER",
    }),
  ]);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/marketplace/buy-now");

  const card = page.locator(".marketplace-buy-now-card");
  const media = page.locator(".marketplace-buy-now-card-media");
  const image = media.locator("img");
  const resultCount = page.locator(".marketplace-buy-now-result-count");
  const siteHeader = page.locator(".site-header");
  const help = page.getByLabel("Setup and instructions tutorial");
  const action = page.getByRole("button", { name: "Buy now", exact: true });

  await expect(card).toBeVisible();
  await expect(help).toBeVisible();
  const cardBox = await card.boundingBox();
  const mediaBox = await media.boundingBox();
  const resultBox = await resultCount.boundingBox();
  const headerBox = await siteHeader.boundingBox();
  const helpBox = await help.boundingBox();
  const actionBox = await action.boundingBox();
  expect(cardBox?.width).toBeGreaterThanOrEqual(340);
  expect(cardBox?.width).toBeLessThanOrEqual(380);
  expect((mediaBox?.width || 0) / (mediaBox?.height || 1)).toBeCloseTo(4 / 3, 1);
  await expect(image).toHaveCSS("object-fit", "contain");
  expect(await image.evaluate((node) => ({ width: node.naturalWidth, height: node.naturalHeight }))).toEqual({ width: 800, height: 400 });
  expect(resultBox?.y || 0).toBeGreaterThan((headerBox?.y || 0) + (headerBox?.height || 0));
  expect(helpBox?.y || 0).toBeGreaterThan((actionBox?.y || 0) + (actionBox?.height || 0));
  expect(actionBox?.height || 0).toBeGreaterThanOrEqual(44);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  ).toEqual([]);
  if (process.env.BUY_NOW_SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${process.env.BUY_NOW_SCREENSHOT_DIR}/buy-now-after-desktop.png`,
      fullPage: true,
    });
  }
});

test("Buy Now cards form a left-aligned three-column desktop grid", async ({ page }) => {
  const state: MockState = { reserveRequests: 0, lastReservation: null };
  const rows = Array.from({ length: 4 }, (_, index) =>
    listingRecord({ id: `${LISTING_ID}-${index}`, itemId: null, title: `Grid listing ${index + 1}` }),
  );
  await installMocks(page, state, rows);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/marketplace/buy-now");
  const cards = page.locator(".marketplace-buy-now-card");
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width };
  }));
  expect(boxes.slice(0, 3).every((box) => box.top === boxes[0].top)).toBe(true);
  expect(boxes[3].top).toBeGreaterThan(boxes[0].top);
  expect(boxes[3].left).toBe(boxes[0].left);
  expect(boxes.every((box) => box.width <= 380)).toBe(true);
});

test("mobile Buy Now uses one readable column without horizontal overflow or help overlap", async ({ page }) => {
  const state: MockState = { reserveRequests: 0, lastReservation: null };
  await installAuth(page);
  await keepNavigationHelpVisible(page);
  await installMocks(page, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/marketplace/buy-now");
  const card = page.locator(".marketplace-buy-now-card");
  const help = page.getByLabel("Setup and instructions tutorial");
  const action = page.getByRole("button", { name: "Buy now", exact: true });
  await expect(card).toBeVisible();
  await expect(help).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const cardBox = await card.boundingBox();
  const helpBox = await help.boundingBox();
  const actionBox = await action.boundingBox();
  expect(cardBox?.width || 0).toBeLessThanOrEqual(358);
  expect(helpBox?.y || 0).toBeGreaterThan((actionBox?.y || 0) + (actionBox?.height || 0));
  if (process.env.BUY_NOW_SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${process.env.BUY_NOW_SCREENSHOT_DIR}/buy-now-after-mobile.png`,
      fullPage: true,
    });
  }
});

test(
  "guest Buy Now sends the user to login with a return path",
  async ({
    page,
  }) => {
    const state: MockState = {
      reserveRequests:
        0,

      lastReservation:
        null,
    };

    await installMocks(
      page,
      state,
    );

    await page.goto(
      "/marketplace/buy-now",
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Buy Now",

          exact:
            true,
        },
      ),
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Sign in to buy",

          exact:
            true,
        },
      )
      .click();

    await expect(
      page,
    ).toHaveURL(
      /\/login\?next=%2Fmarketplace%2Fbuy-now$/,
    );

    expect(
      state.reserveRequests,
    ).toBe(0);
  },
);

test(
  "login returns the buyer to the Buy Now page",
  async ({
    page,
  }) => {
    const state: MockState = {
      reserveRequests:
        0,

      lastReservation:
        null,
    };

    await installMocks(
      page,
      state,
    );

    await page.goto(
      "/login?next=%2Fmarketplace%2Fbuy-now",
    );

    await page
      .getByLabel(
        "Email address",
      )
      .fill(
        "buy-now-browser@pawnloop.test",
      );

    await page
      .getByRole(
        "textbox",
        { name: "Password" },
      )
      .fill(
        "Buyer123!",
      );

    await page
      .getByRole(
        "button",
        {
          name:
            "Sign in",

          exact:
            true,
        },
      )
      .click();

    await expect(
      page,
    ).toHaveURL(
      /\/marketplace\/buy-now$/,
    );

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Buy now",

          exact:
            true,
        },
      ),
    ).toBeEnabled();
  },
);

test(
  "authenticated buyer reserves a listing and reaches transaction checkout",
  async ({
    page,
  }) => {
    const state: MockState = {
      reserveRequests:
        0,

      lastReservation:
        null,
    };

    await installAuth(
      page,
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      "/marketplace/buy-now",
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Buy now",

          exact:
            true,
        },
      )
      .click();

    await expect
      .poll(
        () =>
          state.reserveRequests,
      )
      .toBe(1);

    expect(
      state.lastReservation,
    ).toEqual({
      listingId:
        LISTING_ID,

      quantity:
        1,

      buyerShopId:
        null,
    });

    await expect(
      page,
    ).toHaveURL(
      new RegExp(
        `/marketplace/transactions/${TRANSACTION_ID}$`,
      ),
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Checkout actions",
        },
      ),
    ).toBeVisible();
  },
);

test(
  "seller cannot purchase their own Buy Now listing",
  async ({
    page,
  }) => {
    const state: MockState = {
      reserveRequests:
        0,

      lastReservation:
        null,
    };

    await installAuth(
      page,
      {
        userId:
          SELLER_ID,

        role:
          "OWNER",
      },
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      "/marketplace/buy-now",
    );

    await expect(page.getByText("Your listing", { exact: true })).toHaveClass(/marketplace-buy-now-owner-badge/);
    await expect(page.getByRole("link", { name: "Edit listing", exact: true })).toHaveAttribute(
      "href",
      `/marketplace/listings/${LISTING_ID}/edit`,
    );
    await expect(page.getByRole("button", { name: "Buy now", exact: true })).toHaveCount(0);

    expect(
      state.reserveRequests,
    ).toBe(0);
  },
);

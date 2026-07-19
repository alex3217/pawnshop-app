import {
  expect,
  test,
  type Page,
} from "@playwright/test";

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

function listingRecord() {
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

    images:
      [],

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
  };
}

function listingListPayload() {
  return {
    success:
      true,

    rows: [
      listingRecord(),
    ],

    pagination: {
      page:
        1,

      limit:
        48,

      total:
        1,

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
              listingListPayload(),
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
      .getByLabel(
        "Password",
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

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Your listing",

          exact:
            true,
        },
      ),
    ).toBeDisabled();

    expect(
      state.reserveRequests,
    ).toBe(0);
  },
);

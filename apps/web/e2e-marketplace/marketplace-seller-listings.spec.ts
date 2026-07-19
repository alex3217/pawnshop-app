import {
  expect,
  test,
  type Page,
} from "@playwright/test";

const OWNER_ID =
  "seller-listings-browser-owner";

const CONSUMER_ID =
  "seller-listings-browser-consumer";

const SHOP_ID =
  "seller-listings-browser-shop";

const ITEM_ID =
  "seller-listings-browser-item";

const LISTING_ID =
  "seller-listings-browser-listing";

const LISTING_TITLE =
  "Seller listings browser item";

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
      ITEM_ID,

    sellerUserId:
      OWNER_ID,

    sellerShopId:
      SHOP_ID,

    listingType:
      "SHOP_TO_CUSTOMER",

    status:
      "DRAFT",

    title:
      LISTING_TITLE,

    description:
      "A marketplace listing used by isolated seller browser tests.",

    category:
      "Electronics",

    condition:
      "Good",

    price:
      "150.00",

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
      null,

    createdAt:
      "2026-07-19T15:00:00.000Z",

    updatedAt:
      "2026-07-19T15:00:00.000Z",

    seller: {
      id:
        OWNER_ID,

      name:
        "Seller Listings Browser Owner",

      role:
        "OWNER",
    },

    sellerShop: {
      id:
        SHOP_ID,

      name:
        "Seller Listings Browser Shop",

      address:
        "100 Browser Test Street",

      city:
        "Houston",

      state:
        "TX",

      zip:
        "77001",

      phone:
        "555-0110",

      ownerId:
        OWNER_ID,
    },

    item: {
      id:
        ITEM_ID,

      title:
        LISTING_TITLE,

      status:
        "AVAILABLE",

      pawnShopId:
        SHOP_ID,
    },

    ...overrides,
  };
}

type ListingRecord =
  ReturnType<typeof listingRecord>;

type MockState = {
  listings:
    ListingRecord[];

  createRequests:
    number;

  updateRequests:
    number;

  actions:
    string[];

  lastCreate:
    Record<string, unknown> |
    null;

  lastUpdate:
    Record<string, unknown> |
    null;
};

async function installAuth(
  page: Page,
  role:
    | "CONSUMER"
    | "OWNER",
) {
  const userId =
    role === "OWNER"
      ? OWNER_ID
      : CONSUMER_ID;

  await page.addInitScript(
    ({
      storedUserId,
      storedRole,
    }) => {
      localStorage.setItem(
        "auth_token",
        "seller-listings-browser-token",
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
            "Seller Listings Browser User",

          email:
            "seller-listings@pawnloop.test",

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

function replaceListing(
  state: MockState,
  updated: ListingRecord,
) {
  state.listings =
    state.listings.map(
      (listing) =>
        listing.id === updated.id
          ? updated
          : listing,
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
          "/api/marketplace-listings/mine"
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

              rows:
                state.listings,
            }),
        });

        return;
      }

      if (
        method === "GET" &&
        pathname ===
          "/api/shops/mine"
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

              rows: [
                {
                  id:
                    SHOP_ID,

                  name:
                    "Seller Listings Browser Shop",

                  ownerId:
                    OWNER_ID,
                },
              ],
            }),
        });

        return;
      }

      if (
        method === "GET" &&
        pathname ===
          "/api/items/mine"
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

              rows: [
                {
                  id:
                    ITEM_ID,

                  pawnShopId:
                    SHOP_ID,

                  title:
                    LISTING_TITLE,

                  description:
                    "Inventory description",

                  price:
                    "150.00",

                  status:
                    "AVAILABLE",

                  category:
                    "Electronics",

                  condition:
                    "Good",

                  images:
                    [],
                },
              ],
            }),
        });

        return;
      }

      if (
        method === "POST" &&
        pathname ===
          "/api/marketplace-listings"
      ) {
        const payload =
          request.postDataJSON() as Record<
            string,
            unknown
          >;

        state.createRequests +=
          1;

        state.lastCreate =
          payload;

        const created =
          listingRecord({
            id:
              "created-browser-listing",

            sellerUserId:
              String(
                payload.listingType,
              ).startsWith("CUSTOMER_")
                ? CONSUMER_ID
                : OWNER_ID,

            sellerShopId:
              payload.sellerShopId ??
              null,

            itemId:
              payload.itemId ??
              null,

            listingType:
              payload.listingType,

            status:
              "DRAFT",

            title:
              payload.title,

            description:
              payload.description,

            category:
              payload.category,

            condition:
              payload.condition,

            price:
              payload.price,

            quantity:
              payload.quantity,

            images:
              payload.images,

            allowOffers:
              payload.allowOffers,

            pickupAvailable:
              payload.pickupAvailable,

            shippingAvailable:
              payload.shippingAvailable,

            expiresAt:
              payload.expiresAt,
          });

        state.listings = [
          created,
          ...state.listings,
        ];

        await route.fulfill({
          status:
            201,

          contentType:
            "application/json",

          body:
            jsonBody({
              success:
                true,

              listing:
                created,
            }),
        });

        return;
      }

      const updateMatch =
        pathname.match(
          /^\/api\/marketplace-listings\/([^/]+)$/,
        );

      if (
        method === "PATCH" &&
        updateMatch
      ) {
        const listingId =
          decodeURIComponent(
            updateMatch[1],
          );

        const payload =
          request.postDataJSON() as Record<
            string,
            unknown
          >;

        state.updateRequests +=
          1;

        state.lastUpdate =
          payload;

        const current =
          state.listings.find(
            (listing) =>
              listing.id === listingId,
          ) ||
          listingRecord({
            id:
              listingId,
          });

        const updated =
          listingRecord({
            ...current,
            ...payload,

            id:
              listingId,

            updatedAt:
              "2026-07-19T16:00:00.000Z",
          });

        replaceListing(
          state,
          updated,
        );

        await route.fulfill({
          status:
            200,

          contentType:
            "application/json",

          body:
            jsonBody({
              success:
                true,

              listing:
                updated,
            }),
        });

        return;
      }

      const actionMatch =
        pathname.match(
          /^\/api\/marketplace-listings\/([^/]+)\/(publish|pause|cancel)$/,
        );

      if (
        method === "POST" &&
        actionMatch
      ) {
        const listingId =
          decodeURIComponent(
            actionMatch[1],
          );

        const action =
          actionMatch[2];

        state.actions.push(
          action,
        );

        const status =
          action === "publish"
            ? "ACTIVE"
            : action === "pause"
              ? "PAUSED"
              : "CANCELED";

        const current =
          state.listings.find(
            (listing) =>
              listing.id === listingId,
          ) ||
          listingRecord({
            id:
              listingId,
          });

        const updated =
          listingRecord({
            ...current,

            id:
              listingId,

            status,
          });

        replaceListing(
          state,
          updated,
        );

        await route.fulfill({
          status:
            200,

          contentType:
            "application/json",

          body:
            jsonBody({
              success:
                true,

              listing:
                updated,
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
  "consumer creates a customer marketplace draft",
  async ({
    page,
  }) => {
    const state: MockState = {
      listings:
        [],

      createRequests:
        0,

      updateRequests:
        0,

      actions:
        [],

      lastCreate:
        null,

      lastUpdate:
        null,
    };

    await installAuth(
      page,
      "CONSUMER",
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      "/marketplace/listings/new",
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Create Marketplace Listing",
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByLabel(
        "Listing type",
      ),
    ).toHaveValue(
      "CUSTOMER_TO_CUSTOMER",
    );

    await page
      .getByLabel(
        "Listing title",
      )
      .fill(
        "Consumer browser listing",
      );

    await page
      .getByLabel(
        "Price",
      )
      .fill(
        "85",
      );

    await page
      .getByRole(
        "button",
        {
          name:
            "Save draft",
        },
      )
      .click();

    await expect(
      page,
    ).toHaveURL(
      /\/marketplace\/listings\/mine$/,
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "My Marketplace Listings",
        },
      ),
    ).toBeVisible();

    expect(
      state.createRequests,
    ).toBe(1);

    expect(
      state.lastCreate?.listingType,
    ).toBe(
      "CUSTOMER_TO_CUSTOMER",
    );

    expect(
      state.lastCreate?.sellerShopId,
    ).toBeNull();

    expect(
      state.lastCreate?.itemId,
    ).toBeNull();
  },
);

test(
  "owner creates a shop listing linked to inventory",
  async ({
    page,
  }) => {
    const state: MockState = {
      listings:
        [],

      createRequests:
        0,

      updateRequests:
        0,

      actions:
        [],

      lastCreate:
        null,

      lastUpdate:
        null,
    };

    await installAuth(
      page,
      "OWNER",
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      "/marketplace/listings/new",
    );

    await expect(
      page.getByLabel(
        "Listing type",
      ),
    ).toHaveValue(
      "SHOP_TO_CUSTOMER",
    );

    await expect(
      page.getByLabel(
        "Seller shop",
      ),
    ).toHaveValue(
      SHOP_ID,
    );

    await page
      .getByLabel(
        "Link existing inventory",
      )
      .selectOption(
        ITEM_ID,
      );

    await expect(
      page.getByLabel(
        "Listing title",
      ),
    ).toHaveValue(
      LISTING_TITLE,
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Save draft",
        },
      )
      .click();

    await expect(
      page,
    ).toHaveURL(
      /\/marketplace\/listings\/mine$/,
    );

    expect(
      state.createRequests,
    ).toBe(1);

    expect(
      state.lastCreate?.listingType,
    ).toBe(
      "SHOP_TO_CUSTOMER",
    );

    expect(
      state.lastCreate?.sellerShopId,
    ).toBe(
      SHOP_ID,
    );

    expect(
      state.lastCreate?.itemId,
    ).toBe(
      ITEM_ID,
    );
  },
);

test(
  "seller edits a draft marketplace listing",
  async ({
    page,
  }) => {
    const state: MockState = {
      listings: [
        listingRecord(),
      ],

      createRequests:
        0,

      updateRequests:
        0,

      actions:
        [],

      lastCreate:
        null,

      lastUpdate:
        null,
    };

    await installAuth(
      page,
      "OWNER",
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      `/marketplace/listings/${LISTING_ID}/edit`,
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Edit Marketplace Listing",
        },
      ),
    ).toBeVisible();

    await page
      .getByLabel(
        "Listing title",
      )
      .fill(
        "Updated seller browser listing",
      );

    await page
      .getByRole(
        "button",
        {
          name:
            "Save changes",
        },
      )
      .click();

    await expect(
      page,
    ).toHaveURL(
      /\/marketplace\/listings\/mine$/,
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Updated seller browser listing",
        },
      ),
    ).toBeVisible();

    expect(
      state.updateRequests,
    ).toBe(1);

    expect(
      state.lastUpdate?.title,
    ).toBe(
      "Updated seller browser listing",
    );
  },
);

test(
  "seller publishes pauses and cancels a listing",
  async ({
    page,
  }) => {
    const state: MockState = {
      listings: [
        listingRecord(),
      ],

      createRequests:
        0,

      updateRequests:
        0,

      actions:
        [],

      lastCreate:
        null,

      lastUpdate:
        null,
    };

    await installAuth(
      page,
      "OWNER",
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      "/marketplace/listings/mine",
    );

    const card =
      page
        .locator(
          "article.seller-listing-card",
        )
        .filter({
          hasText:
            LISTING_TITLE,
        });

    await card
      .getByRole(
        "button",
        {
          name:
            "Publish",
          exact:
            true,
        },
      )
      .click();

    await expect(
      card.getByText(
        "Active",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await card
      .getByRole(
        "button",
        {
          name:
            "Pause",
          exact:
            true,
        },
      )
      .click();

    await expect(
      card.getByText(
        "Paused",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    page.once(
      "dialog",
      async (dialog) => {
        await dialog.accept();
      },
    );

    await card
      .getByRole(
        "button",
        {
          name:
            "Cancel",
          exact:
            true,
        },
      )
      .click();

    await expect(
      card.getByText(
        "Canceled",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    expect(
      state.actions,
    ).toEqual([
      "publish",
      "pause",
      "cancel",
    ]);
  },
);

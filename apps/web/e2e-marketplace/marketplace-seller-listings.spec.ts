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
      ["https://assets.invalid/listing.jpg"],

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
  role: "CONSUMER" | "OWNER",
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

      const userId =
        role === "OWNER"
          ? OWNER_ID
          : CONSUMER_ID;

      if (
        method === "GET" &&
        pathname === "/api/auth/me"
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonBody({
            user: {
              id: userId,
              name: "Seller Listings Browser User",
              email: "seller-listings@pawnloop.test",
              role,
              ...(role === "OWNER"
                ? {
                    ownerApplication: {
                      id: "seller-listings-owner-application",
                      status: "APPROVED",
                    },
                  }
                : {}),
            },
          }),
        });

        return;
      }

      if (
        method === "GET" &&
        pathname === "/api/auth/shop-access"
      ) {
        const ownerAccess =
          role === "OWNER";

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonBody({
            access: {
              role,
              unrestricted: ownerAccess,
              shopIds: ownerAccess ? [SHOP_ID] : [],
              permissions: [],
              capabilities: {
                inventoryRead: ownerAccess,
                inventoryWrite: ownerAccess,
                auctionsRead: false,
                auctionsWrite: false,
                offersRead: false,
                offersWrite: false,
                locationsRead: false,
                locationsWrite: false,
                staffRead: false,
                staffWrite: false,
                settlementsRead: false,
              },
              shops: ownerAccess
                ? [
                    {
                      shopId: SHOP_ID,
                      shopName: "Seller Listings Browser Shop",
                      source: "OWNER",
                      staffId: null,
                      staffRole: null,
                      permissions: [],
                    },
                  ]
                : [],
            },
          }),
        });

        return;
      }

      if (
        method === "GET" &&
        pathname === "/api/notifications"
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonBody({
            success: true,
            notifications: [],
          }),
        });

        return;
      }

      if (
        method === "GET" &&
        pathname === "/api/marketplace-listings/destinations/customers"
      ) {
        await route.fulfill({ status: 200, contentType: "application/json", body: jsonBody({ success: true, rows: [{ reference: "destination_buyer", displayName: "Destination Buyer", publicIdentifier: "destination_buyer" }] }) });
        return;
      }

      if (method === "GET" && pathname === "/api/marketplace-listings/destinations/shops") {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.fulfill({ status: 200, contentType: "application/json", body: jsonBody({ success: true, rows: [{ id: "destination-shop", name: "Destination Pawn", city: "Austin", state: "TX" }] }) });
        return;
      }

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

test("consumer creates a public customer marketplace draft by default", async ({ page }) => {
  const state: MockState = { listings: [], createRequests: 0, updateRequests: 0, actions: [], lastCreate: null, lastUpdate: null };
  await installAuth(page, "CONSUMER");
  await installMocks(page, state, "CONSUMER");
  await page.goto("/marketplace/listings/new");
  await expect(page.getByRole("radio", { name: "Public Marketplace" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await page.getByLabel("Listing title").fill("Public customer listing");
  await page.getByLabel("Price").fill("50");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/marketplace\/listings\/mine$/);
  expect(state.lastCreate?.audience).toBe("PUBLIC_MARKETPLACE");
  expect(state.lastCreate?.destinationCustomerReference).toBeNull();
  expect(state.lastCreate?.destinationShopId).toBeNull();
});

test(
  "consumer creates a specific-customer marketplace draft",
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
      "CONSUMER",
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

    await expect(page.getByRole("radio", { name: "Public Marketplace" })).toBeChecked();
    await page.getByRole("radio", { name: "Specific Customer" }).check();
    await page.getByRole("combobox", { name: "Find receiving customer" }).fill("destination");
    await expect(page.getByRole("option", { name: "Destination Buyer (@destination_buyer)" })).toBeVisible();
    await page.getByRole("option", { name: "Destination Buyer (@destination_buyer)" }).click();

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

    expect(state.lastCreate?.destinationCustomerReference).toBe("destination_buyer");
    expect(state.lastCreate?.destinationShopId).toBeNull();

    expect(
      state.lastCreate?.itemId,
    ).toBeNull();
  },
);

test("consumer searches and selects a customer-to-shop destination", async ({ page }) => {
  const state: MockState = { listings: [], createRequests: 0, updateRequests: 0, actions: [], lastCreate: null, lastUpdate: null };
  await installAuth(page, "CONSUMER");
  await installMocks(page, state, "CONSUMER");
  await page.goto("/marketplace/listings/new");
  await page.getByLabel("Listing type").selectOption("CUSTOMER_TO_SHOP");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  const combobox = page.getByRole("combobox", { name: "Find receiving shop" });
  await combobox.fill("d");
  await expect(page.getByText("Enter 2 or more characters.")).toBeVisible();
  await combobox.fill("destination");
  await page.getByRole("option", { name: "Destination Pawn — Austin, TX" }).click();
  await expect(page.getByRole("group", { name: "Selected shop destination" })).toContainText("Destination Pawn");
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
});

test("destination combobox debounces, cancels stale work, reports failures, and supports keyboard/mobile use", async ({ page }) => {
  const state: MockState = { listings: [], createRequests: 0, updateRequests: 0, actions: [], lastCreate: null, lastUpdate: null };
  await installAuth(page, "CONSUMER");
  await installMocks(page, state, "CONSUMER");
  const requested: string[] = [];
  await page.route("**/api/marketplace-listings/destinations/customers?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("search") || "";
    requested.push(query);
    if (query === "failure") return route.fulfill({ status: 500, contentType: "application/json", body: jsonBody({ error: "Search unavailable" }) });
    if (query === "zz-no-results") return route.fulfill({ status: 200, contentType: "application/json", body: jsonBody({ rows: [] }) });
    if (query === "older") await new Promise((resolve) => setTimeout(resolve, 500));
    return route.fulfill({ status: 200, contentType: "application/json", body: jsonBody({ rows: [{ reference: query, displayName: query === "newer" ? "New Result" : "Old Result", publicIdentifier: query }] }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/marketplace/listings/new");
  await page.getByRole("radio", { name: "Specific Customer" }).check();
  const input = page.getByRole("combobox", { name: "Find receiving customer" });
  await input.fill("o");
  await page.waitForTimeout(350);
  expect(requested).toEqual([]);
  await input.fill("older");
  await page.waitForTimeout(350);
  await expect(page.locator(".destination-search-status")).toContainText("Searching destinations…");
  await input.fill("newer");
  await expect(page.getByRole("option", { name: "New Result (@newer)" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Old Result (@older)" })).toHaveCount(0);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page.getByRole("group", { name: "Selected customer destination" })).toContainText("New Result");
  await page.getByRole("button", { name: "Change" }).click();
  await input.fill("failure");
  await expect(page.locator(".destination-search-status")).toContainText("Search failed: Search unavailable");
  await input.fill("zz-no-results");
  await expect(page.locator(".destination-search-status")).toContainText("No destinations found.");
  const box = await input.boundingBox();
  expect(box?.width || 0).toBeLessThanOrEqual(390);
});

test("editing a directed draft restores its audience and selected destination", async ({ page }) => {
  const state: MockState = { listings: [listingRecord({ itemId: null, sellerUserId: CONSUMER_ID, sellerShopId: null, listingType: "CUSTOMER_TO_CUSTOMER", destinationUserId: "internal-destination-id", destinationUser: { publicDisplayName: "Restored Buyer", publicMessageIdentifier: "restored_buyer" } })], createRequests: 0, updateRequests: 0, actions: [], lastCreate: null, lastUpdate: null };
  await installAuth(page, "CONSUMER");
  await installMocks(page, state, "CONSUMER");
  await page.goto(`/marketplace/listings/${LISTING_ID}/edit`);
  await expect(page.getByRole("radio", { name: "Specific Customer" })).toBeChecked();
  await expect(page.getByRole("group", { name: "Selected customer destination" })).toContainText("Restored Buyer (@restored_buyer)");
  await page.getByRole("button", { name: "Save changes" }).click();
  expect(state.lastUpdate?.destinationCustomerReference).toBe("restored_buyer");
  expect(state.lastUpdate?.audience).toBe("SPECIFIC_CUSTOMER");
});

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
      "OWNER",
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
      "OWNER",
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
      "OWNER",
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

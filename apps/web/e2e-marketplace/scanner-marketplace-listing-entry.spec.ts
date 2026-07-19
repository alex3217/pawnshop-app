import {
  expect,
  test,
  type Page,
} from "@playwright/test";

const OWNER_ID =
  "scanner-marketplace-browser-owner";

const SHOP_ID =
  "scanner-marketplace-browser-shop";

const ITEM_ID =
  "scanner-marketplace-browser-item";

type Scenario = {
  name:
    string;

  destination:
    | "CUSTOMER_MARKETPLACE"
    | "DEALER_LISTING";

  listingType:
    | "SHOP_TO_CUSTOMER"
    | "SHOP_TO_SHOP";

  buttonName:
    string;

  code:
    string;

  intakeId:
    string;

  title:
    string;

  reviewRequired:
    boolean;
};

type MockState = {
  scanRequests:
    number;

  createRequests:
    number;

  lastScan:
    Record<string, unknown> |
    null;

  lastCreate:
    Record<string, unknown> |
    null;

  listings:
    Record<string, unknown>[];
};

function jsonBody(
  value: unknown,
) {
  return JSON.stringify(
    value,
  );
}

function shopRecord() {
  return {
    id:
      SHOP_ID,

    name:
      "Scanner Marketplace Browser Shop",

    address:
      "100 Scanner Test Street",

    city:
      "Houston",

    state:
      "TX",

    zip:
      "77001",

    phone:
      "555-0199",

    ownerId:
      OWNER_ID,
  };
}

function itemRecord(
  scenario: Scenario,
) {
  return {
    id:
      ITEM_ID,

    pawnShopId:
      SHOP_ID,

    title:
      scenario.title,

    description:
      "Scanned browser-test item description.",

    price:
      "245.00",

    status:
      "AVAILABLE",

    category:
      "Electronics",

    condition:
      "Good",

    images:
      [],
  };
}

function listingRecord(
  scenario: Scenario,
  payload: Record<string, unknown>,
) {
  return {
    id:
      `scanner-created-${scenario.destination.toLowerCase()}`,

    itemId:
      payload.itemId ??
      null,

    sellerUserId:
      OWNER_ID,

    sellerShopId:
      payload.sellerShopId ??
      null,

    listingType:
      payload.listingType,

    status:
      "DRAFT",

    title:
      payload.title,

    description:
      payload.description ??
      null,

    category:
      payload.category ??
      null,

    condition:
      payload.condition ??
      null,

    price:
      String(
        payload.price ??
        "0",
      ),

    currency:
      payload.currency ??
      "USD",

    quantity:
      payload.quantity ??
      1,

    images:
      Array.isArray(
        payload.images,
      )
        ? payload.images
        : [],

    allowOffers:
      payload.allowOffers ??
      true,

    pickupAvailable:
      payload.pickupAvailable ??
      true,

    shippingAvailable:
      payload.shippingAvailable ??
      false,

    expiresAt:
      payload.expiresAt ??
      null,

    featuredUntil:
      null,

    publishedAt:
      null,

    createdAt:
      "2026-07-19T17:00:00.000Z",

    updatedAt:
      "2026-07-19T17:00:00.000Z",

    seller: {
      id:
        OWNER_ID,

      name:
        "Scanner Marketplace Browser Owner",

      role:
        "OWNER",
    },

    sellerShop:
      shopRecord(),

    item: {
      id:
        ITEM_ID,

      title:
        scenario.title,

      status:
        "AVAILABLE",

      pawnShopId:
        SHOP_ID,
    },
  };
}

async function installAuth(
  page: Page,
) {
  await page.addInitScript(
    ({
      ownerId,
    }) => {
      localStorage.setItem(
        "auth_token",
        "scanner-marketplace-browser-token",
      );

      localStorage.setItem(
        "auth_role",
        "OWNER",
      );

      localStorage.setItem(
        "auth_user",
        JSON.stringify({
          id:
            ownerId,

          name:
            "Scanner Marketplace Browser Owner",

          email:
            "scanner-marketplace@pawnloop.test",

          role:
            "OWNER",
        }),
      );
    },
    {
      ownerId:
        OWNER_ID,
    },
  );
}

async function installMocks(
  page: Page,
  state: MockState,
  scenario: Scenario,
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
                shopRecord(),
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
                itemRecord(
                  scenario,
                ),
              ],
            }),
        });

        return;
      }

      if (
        method === "POST" &&
        pathname ===
          "/api/items/scan"
      ) {
        const payload =
          request.postDataJSON() as Record<
            string,
            unknown
          >;

        state.scanRequests +=
          1;

        state.lastScan =
          payload;

        const intakeStatus =
          scenario.reviewRequired
            ? "NEEDS_REVIEW"
            : "APPROVED";

        const duplicateStatus =
          scenario.reviewRequired
            ? "MATCH_FOUND"
            : "CLEAR";

        await route.fulfill({
          status:
            200,

          contentType:
            "application/json",

          body:
            jsonBody({
              data: {
                item:
                  itemRecord(
                    scenario,
                  ),

                code:
                  scenario.code,

                source:
                  "scan-console",

                intakeId:
                  scenario.intakeId,

                intakeStatus,

                duplicateStatus,

                screeningStatus:
                  "CLEAR",

                destination:
                  scenario.destination,

                codeType:
                  "UPC",
              },

              intake: {
                id:
                  scenario.intakeId,

                shopId:
                  SHOP_ID,

                capturedByUserId:
                  OWNER_ID,

                source:
                  "MANUAL",

                destination:
                  scenario.destination,

                status:
                  intakeStatus,

                code:
                  scenario.code,

                normalizedCode:
                  scenario.code,

                codeType:
                  "UPC",

                duplicateStatus,

                screeningStatus:
                  "CLEAR",

                linkedItemId:
                  ITEM_ID,
              },
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
          listingRecord(
            scenario,
            payload,
          );

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

              pagination: {
                page:
                  1,

                limit:
                  24,

                total:
                  state.listings.length,

                totalPages:
                  state.listings.length
                    ? 1
                    : 0,
              },
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

            rows:
              [],

            pagination: {
              page:
                1,

              limit:
                24,

              total:
                0,

              totalPages:
                0,
            },
          }),
      });
    },
  );
}

async function runScenario(
  page: Page,
  scenario: Scenario,
) {
  const state: MockState = {
    scanRequests:
      0,

    createRequests:
      0,

    lastScan:
      null,

    lastCreate:
      null,

    listings:
      [],
  };

  await installAuth(
    page,
  );

  await installMocks(
    page,
    state,
    scenario,
  );

  await page.goto(
    "/owner/scan-console",
  );

  await expect(
    page.getByRole(
      "heading",
      {
        name:
          "Mobile Scan Console",
      },
    ),
  ).toBeVisible();

  await page
    .getByLabel(
      "Intake destination",
    )
    .selectOption(
      scenario.destination,
    );

  await page
    .getByLabel(
      "Manual barcode / SKU / QR value",
    )
    .fill(
      scenario.code,
    );

  await page
    .getByRole(
      "button",
      {
        name:
          "Resolve scan",
      },
    )
    .click();

  await expect(
    page.getByRole(
      "heading",
      {
        name:
          scenario.title,
      },
    ),
  ).toBeVisible();

  await expect(
    page.getByRole(
      "button",
      {
        name:
          scenario.buttonName,
      },
    ),
  ).toBeVisible();

  if (
    scenario.reviewRequired
  ) {
    await expect(
      page.getByText(
        "Scan recorded. Manual review is required.",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();
  } else {
    await expect(
      page.getByText(
        "Scan recorded successfully.",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();
  }

  await page
    .getByRole(
      "button",
      {
        name:
          scenario.buttonName,
      },
    )
    .click();

  await expect(
    page,
  ).toHaveURL(
    /\/marketplace\/listings\/new\?/,
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
    page.getByText(
      "Scanner prefill loaded",
      {
        exact:
          true,
      },
    ),
  ).toBeVisible();

  await expect(
    page.getByText(
      `Scanned code: ${scenario.code}`,
      {
        exact:
          true,
      },
    ),
  ).toBeVisible();

  await expect(
    page.getByText(
      `Intake ID: ${scenario.intakeId}`,
      {
        exact:
          true,
      },
    ),
  ).toBeVisible();

  const reviewNotice =
    page.getByText(
      "Manual intake review is required before this listing should be published.",
      {
        exact:
          true,
      },
    );

  if (
    scenario.reviewRequired
  ) {
    await expect(
      reviewNotice,
    ).toBeVisible();
  } else {
    await expect(
      reviewNotice,
    ).toHaveCount(0);
  }

  await expect(
    page.getByLabel(
      "Listing type",
    ),
  ).toHaveValue(
    scenario.listingType,
  );

  await expect(
    page.getByLabel(
      "Seller shop",
    ),
  ).toHaveValue(
    SHOP_ID,
  );

  await expect(
    page.getByLabel(
      "Link existing inventory",
    ),
  ).toHaveValue(
    ITEM_ID,
  );

  await expect(
    page.getByLabel(
      "Listing title",
    ),
  ).toHaveValue(
    scenario.title,
  );

  await expect(
    page.getByLabel(
      "Price",
    ),
  ).toHaveValue(
    "245.00",
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

  await expect(
    page.getByRole(
      "heading",
      {
        name:
          scenario.title,
      },
    ),
  ).toBeVisible();

  expect(
    state.scanRequests,
  ).toBe(1);

  expect(
    state.createRequests,
  ).toBe(1);

  expect(
    state.lastScan?.destination,
  ).toBe(
    scenario.destination,
  );

  expect(
    state.lastScan?.shopId,
  ).toBe(
    SHOP_ID,
  );

  expect(
    state.lastScan?.code,
  ).toBe(
    scenario.code,
  );

  expect(
    state.lastCreate?.listingType,
  ).toBe(
    scenario.listingType,
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

  expect(
    state.lastCreate?.title,
  ).toBe(
    scenario.title,
  );

  expect(
    state.lastCreate?.price,
  ).toBe(
    245,
  );
}

test(
  "customer marketplace scan opens and saves a reviewed listing draft",
  async ({
    page,
  }) => {
    await runScenario(
      page,
      {
        name:
          "customer marketplace",

        destination:
          "CUSTOMER_MARKETPLACE",

        listingType:
          "SHOP_TO_CUSTOMER",

        buttonName:
          "Create marketplace listing draft",

        code:
          "012345678905",

        intakeId:
          "customer-marketplace-browser-intake",

        title:
          "Customer marketplace scanned item",

        reviewRequired:
          true,
      },
    );
  },
);

test(
  "dealer scan opens and saves a shop-to-shop listing draft",
  async ({
    page,
  }) => {
    await runScenario(
      page,
      {
        name:
          "dealer marketplace",

        destination:
          "DEALER_LISTING",

        listingType:
          "SHOP_TO_SHOP",

        buttonName:
          "Create dealer listing draft",

        code:
          "DEALER-QR-1001",

        intakeId:
          "dealer-marketplace-browser-intake",

        title:
          "Dealer marketplace scanned item",

        reviewRequired:
          false,
      },
    );
  },
);

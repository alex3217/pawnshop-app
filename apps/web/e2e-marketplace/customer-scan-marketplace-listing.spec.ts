import {
  expect,
  test,
  type Page,
} from "@playwright/test";

const BUYER_ID =
  "customer-scanner-browser-buyer";

type TestScenario = {
  code: string;
  title: string;
  estimatedValue: string;
  intakeId: string;
  reviewRequired: boolean;
};

type MockState = {
  scanRequests: number;
  submissionRequests: number;
  listingRequests: number;

  lastScan:
    | Record<string, unknown>
    | null;

  lastSubmission:
    | Record<string, unknown>
    | null;

  lastListing:
    | Record<string, unknown>
    | null;
};

function jsonBody(
  value: unknown,
) {
  return JSON.stringify(
    value,
  );
}

function createState():
  MockState {
  return {
    scanRequests:
      0,

    submissionRequests:
      0,

    listingRequests:
      0,

    lastScan:
      null,

    lastSubmission:
      null,

    lastListing:
      null,
  };
}

async function installAuth(
  page: Page,
) {
  await page.addInitScript(
    ({
      buyerId,
    }) => {
      localStorage.setItem(
        "auth_token",
        "customer-scanner-browser-token",
      );

      localStorage.setItem(
        "auth_role",
        "CONSUMER",
      );

      localStorage.setItem(
        "auth_user",
        JSON.stringify({
          id:
            buyerId,

          name:
            "Customer Scanner Browser Buyer",

          email:
            "customer-scanner@pawnloop.test",

          role:
            "CONSUMER",
        }),
      );
    },
    {
      buyerId:
        BUYER_ID,
    },
  );
}

function scanResponse(
  scenario: TestScenario,
) {
  const status =
    scenario.reviewRequired
      ? "NEEDS_REVIEW"
      : "SCANNED";

  const duplicateStatus =
    scenario.reviewRequired
      ? "MATCH_FOUND"
      : "CLEAR";

  return {
    success:
      true,

    data: {
      title:
        scenario.title,

      description:
        "Customer scanner browser-test item.",

      category:
        "Electronics",

      condition:
        "Good",

      estimatedValue:
        scenario.estimatedValue,

      price:
        scenario.estimatedValue,

      images:
        [],

      code:
        scenario.code,

      codeType:
        "UPC",

      source:
        "customer-scan",

      destination:
        "CUSTOMER_MARKETPLACE",

      intakeId:
        scenario.intakeId,

      intakeStatus:
        status,

      duplicateStatus,

      screeningStatus:
        "CLEAR",

      reviewRequired:
        scenario.reviewRequired,
    },

    intake: {
      id:
        scenario.intakeId,

      shopId:
        null,

      capturedByUserId:
        BUYER_ID,

      customerId:
        BUYER_ID,

      source:
        "MANUAL",

      destination:
        "CUSTOMER_MARKETPLACE",

      status,

      code:
        scenario.code,

      normalizedCode:
        scenario.code,

      codeType:
        "UPC",

      upc:
        scenario.code,

      duplicateStatus,

      duplicateMatches:
        scenario.reviewRequired
          ? [
              {
                type:
                  "ITEM_INTAKE",

                id:
                  "prior-customer-intake",
              },
            ]
          : [],

      screeningStatus:
        "CLEAR",

      linkedSubmissionId:
        null,
    },
  };
}

function listingResponse(
  scenario: TestScenario,
  payload: Record<
    string,
    unknown
  >,
) {
  return {
    id:
      "customer-marketplace-browser-listing",

    itemId:
      null,

    sellerUserId:
      BUYER_ID,

    sellerShopId:
      null,

    listingType:
      "CUSTOMER_TO_CUSTOMER",

    status:
      "DRAFT",

    title:
      payload.title ??
      scenario.title,

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
        scenario.estimatedValue,
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
      null,

    featuredUntil:
      null,

    publishedAt:
      null,

    metadata:
      payload.metadata ??
      null,

    createdAt:
      "2026-07-19T18:00:00.000Z",

    updatedAt:
      "2026-07-19T18:00:00.000Z",

    seller: {
      id:
        BUYER_ID,

      name:
        "Customer Scanner Browser Buyer",

      role:
        "CONSUMER",
    },

    sellerShop:
      null,

    item:
      null,
  };
}

async function installMocks(
  page: Page,
  state: MockState,
  scenario: TestScenario,
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
          "/api/buyer/item-submissions/mine"
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

              submissions:
                [],
            }),
        });

        return;
      }

      if (
        method === "GET" &&
        pathname ===
          "/api/buyer/item-submissions/offers/mine"
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

              offers:
                [],
            }),
        });

        return;
      }

      if (
        method === "POST" &&
        pathname ===
          "/api/buyer/item-submissions/scan"
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

        await route.fulfill({
          status:
            200,

          contentType:
            "application/json",

          body:
            jsonBody(
              scanResponse(
                scenario,
              ),
            ),
        });

        return;
      }

      if (
        method === "POST" &&
        pathname ===
          "/api/buyer/item-submissions"
      ) {
        const payload =
          request.postDataJSON() as Record<
            string,
            unknown
          >;

        state.submissionRequests +=
          1;

        state.lastSubmission =
          payload;

        await route.fulfill({
          status:
            201,

          contentType:
            "application/json",

          body:
            jsonBody({
              success:
                true,

              submission: {
                id:
                  "customer-browser-submission",

                buyerId:
                  BUYER_ID,

                title:
                  payload.title,

                description:
                  payload.description ??
                  null,

                category:
                  payload.category,

                condition:
                  payload.condition,

                estimatedValue:
                  payload.estimatedValue ??
                  null,

                images:
                  payload.images ??
                  [],

                intent:
                  payload.intent,

                radiusMiles:
                  payload.radiusMiles ??
                  25,

                status:
                  "SUBMITTED",
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

        state.listingRequests +=
          1;

        state.lastListing =
          payload;

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
                listingResponse(
                  scenario,
                  payload,
                ),
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
          }),
      });
    },
  );
}

async function uploadPhoto(
  page: Page,
) {
  await page
    .locator(
      'input[type="file"]',
    )
    .setInputFiles({
      name:
        "customer-scanner-item.png",

      mimeType:
        "image/png",

      buffer:
        Buffer.from(
          "customer scanner browser image",
        ),
    });

  await expect(
    page.getByAltText(
      "Item preview 1",
    ),
  ).toBeVisible();
}

test(
  "customer scan creates a reviewed marketplace draft",
  async ({
    page,
  }) => {
    const scenario: TestScenario = {
      code:
        "012345678905",

      title:
        "Scanned Customer Marketplace Item",

      estimatedValue:
        "425.50",

      intakeId:
        "customer-reviewed-intake",

      reviewRequired:
        true,
    };

    const state =
      createState();

    await installAuth(
      page,
    );

    await installMocks(
      page,
      state,
      scenario,
    );

    await page.goto(
      "/buyer/sell-item",
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Scan or photograph your item and send it for offers.",
        },
      ),
    ).toBeVisible();

    await page
      .getByLabel(
        "What do you want?",
      )
      .selectOption(
        "MARKETPLACE_LISTING",
      );

    await page
      .getByLabel(
        "Manual scan value",
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
      page.getByText(
        "Scan prefill loaded",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        /Manual intake review is required before this item should be published/,
      ),
    ).toBeVisible();

    await expect(
      page.getByLabel(
        "Item title",
      ),
    ).toHaveValue(
      scenario.title,
    );

    await expect(
      page.getByLabel(
        "Estimated value",
      ),
    ).toHaveValue(
      scenario.estimatedValue,
    );

    await uploadPhoto(
      page,
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Create marketplace draft",
        },
      )
      .click();

    await expect(
      page.getByText(
        /Customer marketplace draft customer-marketplace-browser-listing created/,
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        /Manual intake review is required before publishing the marketplace draft/,
      ),
    ).toBeVisible();

    expect(
      state.scanRequests,
    ).toBe(
      1,
    );

    expect(
      state.submissionRequests,
    ).toBe(
      0,
    );

    expect(
      state.listingRequests,
    ).toBe(
      1,
    );

    expect(
      state.lastScan?.destination,
    ).toBe(
      "CUSTOMER_MARKETPLACE",
    );

    expect(
      state.lastListing?.listingType,
    ).toBe(
      "CUSTOMER_TO_CUSTOMER",
    );

    expect(
      state.lastListing?.sellerShopId,
    ).toBeNull();

    expect(
      state.lastListing?.title,
    ).toBe(
      scenario.title,
    );

    expect(
      state.lastListing?.price,
    ).toBe(
      425.5,
    );

    const metadata =
      state.lastListing?.metadata as Record<
        string,
        unknown
      >;

    expect(
      metadata.workflow,
    ).toBe(
      "customer-scan-marketplace-listing-v1",
    );

    expect(
      metadata.scanCode,
    ).toBe(
      scenario.code,
    );

    expect(
      metadata.intakeId,
    ).toBe(
      scenario.intakeId,
    );

    expect(
      metadata.reviewRequired,
    ).toBe(
      true,
    );
  },
);

test(
  "customer scan creates both a pawn request and marketplace draft",
  async ({
    page,
  }) => {
    const scenario: TestScenario = {
      code:
        "036000291452",

      title:
        "Scanned Customer Combined Item",

      estimatedValue:
        "275.00",

      intakeId:
        "customer-clear-intake",

      reviewRequired:
        false,
    };

    const state =
      createState();

    await installAuth(
      page,
    );

    await installMocks(
      page,
      state,
      scenario,
    );

    await page.goto(
      "/buyer/sell-item",
    );

    await page
      .getByLabel(
        "What do you want?",
      )
      .selectOption(
        "BOTH",
      );

    await page
      .getByLabel(
        "Manual scan value",
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
      page.getByText(
        "Scan prefill loaded",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await uploadPhoto(
      page,
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Submit offers request + draft",
        },
      )
      .click();

    await expect(
      page.getByText(
        /Pawnshop offer request submitted/,
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        /Customer marketplace draft customer-marketplace-browser-listing created/,
      ),
    ).toBeVisible();

    expect(
      state.scanRequests,
    ).toBe(
      1,
    );

    expect(
      state.submissionRequests,
    ).toBe(
      1,
    );

    expect(
      state.listingRequests,
    ).toBe(
      1,
    );

    expect(
      state.lastSubmission?.intent,
    ).toBe(
      "BOTH",
    );

    expect(
      state.lastSubmission?.title,
    ).toBe(
      scenario.title,
    );

    expect(
      state.lastListing?.listingType,
    ).toBe(
      "CUSTOMER_TO_CUSTOMER",
    );

    const metadata =
      state.lastListing?.metadata as Record<
        string,
        unknown
      >;

    expect(
      metadata.intakeId,
    ).toBe(
      scenario.intakeId,
    );

    expect(
      metadata.reviewRequired,
    ).toBe(
      false,
    );
  },
);

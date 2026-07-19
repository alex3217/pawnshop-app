import {
  expect,
  test,
  type Page,
} from "@playwright/test";

const TRANSACTION_ID =
  "marketplace-fulfillment-browser-test";

const SELLER_ID =
  "marketplace-fulfillment-seller";

const BUYER_ID =
  "marketplace-fulfillment-buyer";

type TransactionStatus =
  | "PAID"
  | "FULFILLING"
  | "COMPLETED";

type FulfillmentStatus =
  | "PAYMENT_PENDING"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "SHIPPED"
  | "COMPLETED";

type MockState = {
  status:
    TransactionStatus;

  fulfillmentStatus:
    FulfillmentStatus;

  pickupAvailable:
    boolean;

  shippingAvailable:
    boolean;

  fulfillmentRequests:
    number;

  carrier:
    string;

  trackingNumber:
    string;

  note:
    string;

  lastPayload:
    Record<string, unknown> |
    null;
};

function jsonBody(
  value: unknown,
) {
  return JSON.stringify(
    value,
  );
}

function transactionPayload(
  state: MockState,
) {
  const completed =
    state.status ===
    "COMPLETED";

  return {
    id:
      TRANSACTION_ID,

    listingId:
      "marketplace-fulfillment-listing",

    buyerUserId:
      BUYER_ID,

    buyerShopId:
      null,

    sellerUserId:
      SELLER_ID,

    sellerShopId:
      null,

    type:
      "DIRECT_PURCHASE",

    status:
      state.status,

    quantity:
      1,

    subtotal:
      "100.00",

    platformFee:
      "15.00",

    shippingFee:
      "0.00",

    taxAmount:
      "0.00",

    totalAmount:
      "100.00",

    currency:
      "USD",

    paymentIntentId:
      "pi_marketplace_fulfillment_browser",

    fulfillmentStatus:
      state.fulfillmentStatus,

    completedAt:
      completed
        ? "2026-07-19T15:00:00.000Z"
        : null,

    canceledAt:
      null,

    metadata: {
      sellerNetCents:
        8500,

      fulfillment: {
        status:
          state.fulfillmentStatus,

        carrier:
          state.carrier ||
          null,

        trackingNumber:
          state.trackingNumber ||
          null,

        note:
          state.note ||
          null,

        updatedAt:
          state.fulfillmentRequests > 0
            ? "2026-07-19T14:00:00.000Z"
            : null,
      },
    },

    createdAt:
      "2026-07-19T10:00:00.000Z",

    updatedAt:
      "2026-07-19T14:00:00.000Z",

    listing: {
      id:
        "marketplace-fulfillment-listing",

      itemId:
        null,

      sellerUserId:
        SELLER_ID,

      sellerShopId:
        null,

      listingType:
        "CUSTOMER_TO_CUSTOMER",

      status:
        "SOLD",

      title:
        "Marketplace fulfillment browser item",

      description:
        "Browser test for seller fulfillment controls.",

      category:
        "Electronics",

      condition:
        "Good",

      price:
        "100.00",

      currency:
        "USD",

      quantity:
        0,

      images:
        [],

      pickupAvailable:
        state.pickupAvailable,

      shippingAvailable:
        state.shippingAvailable,

      createdAt:
        "2026-07-19T10:00:00.000Z",

      updatedAt:
        "2026-07-19T14:00:00.000Z",
    },

    buyer: {
      id:
        BUYER_ID,

      name:
        "Marketplace Fulfillment Buyer",

      role:
        "CONSUMER",
    },

    buyerShop:
      null,

    seller: {
      id:
        SELLER_ID,

      name:
        "Marketplace Fulfillment Seller",

      role:
        "CONSUMER",
    },

    sellerShop:
      null,
  };
}

async function installAuth(
  page: Page,
) {
  await page.addInitScript(
    ({
      sellerId,
    }) => {
      localStorage.setItem(
        "auth_token",
        "marketplace-fulfillment-browser-token",
      );

      localStorage.setItem(
        "auth_role",
        "CONSUMER",
      );

      localStorage.setItem(
        "auth_user",
        JSON.stringify({
          id:
            sellerId,

          name:
            "Marketplace Fulfillment Seller",

          email:
            "seller@marketplace-fulfillment.pawnloop.test",

          role:
            "CONSUMER",
        }),
      );
    },
    {
      sellerId:
        SELLER_ID,
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

      const transactionPath =
        `/api/marketplace-transactions/${TRANSACTION_ID}`;

      if (
        method === "GET" &&
        pathname ===
          "/api/marketplace-transactions/mine/sales"
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
                transactionPayload(
                  state,
                ),
              ],

              pagination: {
                page:
                  1,

                limit:
                  12,

                total:
                  1,

                pages:
                  1,
              },
            }),
        });

        return;
      }

      if (
        method === "GET" &&
        pathname ===
          transactionPath
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
                transactionPayload(
                  state,
                ),
            }),
        });

        return;
      }

      if (
        method === "PATCH" &&
        pathname ===
          `${transactionPath}/fulfillment`
      ) {
        state.fulfillmentRequests +=
          1;

        const payload =
          request.postDataJSON() as
            Record<string, unknown>;

        state.lastPayload =
          payload;

        const target =
          String(
            payload.fulfillmentStatus ||
            "",
          ) as FulfillmentStatus;

        state.fulfillmentStatus =
          target;

        state.status =
          target ===
            "COMPLETED"
            ? "COMPLETED"
            : "FULFILLING";

        state.carrier =
          String(
            payload.carrier ||
            state.carrier ||
            "",
          );

        state.trackingNumber =
          String(
            payload.trackingNumber ||
            state.trackingNumber ||
            "",
          );

        state.note =
          String(
            payload.note ||
            state.note ||
            "",
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

              handled:
                true,

              idempotent:
                false,

              transaction:
                transactionPayload(
                  state,
                ),
            }),
        });

        return;
      }

      if (
        pathname ===
        "/api/auth/me"
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

              user: {
                id:
                  SELLER_ID,

                name:
                  "Marketplace Fulfillment Seller",

                email:
                  "seller@marketplace-fulfillment.pawnloop.test",

                role:
                  "CONSUMER",
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
          }),
      });
    },
  );
}

function createState({
  pickupAvailable = true,
  shippingAvailable = false,
}: {
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
} = {}): MockState {
  return {
    status:
      "PAID",

    fulfillmentStatus:
      "PAYMENT_PENDING",

    pickupAvailable,
    shippingAvailable,

    fulfillmentRequests:
      0,

    carrier:
      "",

    trackingNumber:
      "",

    note:
      "",

    lastPayload:
      null,
  };
}

test(
  "seller sales show platform fees and net proceeds",
  async ({
    page,
  }) => {
    const state =
      createState();

    await installAuth(
      page,
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      "/marketplace/sales",
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "My marketplace sales",
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Net proceeds",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Net proceeds on page",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        "$85.00",
        {
          exact:
            true,
        },
      ),
    ).toHaveCount(
      2,
    );
  },
);

test(
  "seller marks a paid pickup transaction ready for pickup",
  async ({
    page,
  }) => {
    const state =
      createState({
        pickupAvailable:
          true,

        shippingAvailable:
          false,
      });

    await installAuth(
      page,
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      `/marketplace/transactions/${TRANSACTION_ID}`,
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Seller fulfillment actions",
        },
      ),
    ).toBeVisible();

    await page
      .getByLabel(
        "Next fulfillment status",
      )
      .selectOption(
        "READY_FOR_PICKUP",
      );

    await page
      .getByLabel(
        "Fulfillment note",
      )
      .fill(
        "Item is ready at the front counter.",
      );

    await page
      .getByRole(
        "button",
        {
          name:
            "Update fulfillment",
        },
      )
      .click();

    await expect
      .poll(
        () =>
          state.fulfillmentRequests,
      )
      .toBe(
        1,
      );

    expect(
      state.lastPayload,
    ).toMatchObject({
      fulfillmentStatus:
        "READY_FOR_PICKUP",

      note:
        "Item is ready at the front counter.",
    });

    await expect(
      page.getByText(
        "Fulfillment updated to Ready For Pickup.",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Ready For Pickup",
        {
          exact:
            true,
        },
      ).first(),
    ).toBeVisible();
  },
);

test(
  "seller ships a transaction with carrier and tracking",
  async ({
    page,
  }) => {
    const state =
      createState({
        pickupAvailable:
          false,

        shippingAvailable:
          true,
      });

    await installAuth(
      page,
    );

    await installMocks(
      page,
      state,
    );

    await page.goto(
      `/marketplace/transactions/${TRANSACTION_ID}`,
    );

    await page
      .getByLabel(
        "Next fulfillment status",
      )
      .selectOption(
        "SHIPPED",
      );

    await page
      .getByLabel(
        "Carrier",
      )
      .fill(
        "UPS",
      );

    await page
      .getByLabel(
        "Tracking number",
      )
      .fill(
        "1Z999AA10123456784",
      );

    await page
      .getByLabel(
        "Fulfillment note",
      )
      .fill(
        "Package handed to the carrier.",
      );

    await page
      .getByRole(
        "button",
        {
          name:
            "Update fulfillment",
        },
      )
      .click();

    await expect
      .poll(
        () =>
          state.fulfillmentRequests,
      )
      .toBe(
        1,
      );

    expect(
      state.lastPayload,
    ).toMatchObject({
      fulfillmentStatus:
        "SHIPPED",

      carrier:
        "UPS",

      trackingNumber:
        "1Z999AA10123456784",
    });

    await expect(
      page.getByText(
        "Fulfillment updated to Shipped.",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        "UPS",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        "1Z999AA10123456784",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();
  },
);

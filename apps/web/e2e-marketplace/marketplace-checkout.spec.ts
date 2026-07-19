import {
  expect,
  test,
  type Page,
} from "@playwright/test";

const TRANSACTION_ID =
  "marketplace-checkout-browser-test";

const BUYER_ID =
  "marketplace-browser-buyer";

const SELLER_ID =
  "marketplace-browser-seller";

type TransactionStatus =
  | "PENDING"
  | "PAYMENT_PROCESSING"
  | "PAID"
  | "CANCELED";

type MockState = {
  status:
    TransactionStatus;

  paymentRequests:
    number;

  cancellationRequests:
    number;
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
  const canceled =
    state.status ===
    "CANCELED";

  const paid =
    state.status ===
    "PAID";

  return {
    success: true,

    transaction: {
      id:
        TRANSACTION_ID,

      listingId:
        "marketplace-browser-listing",

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
        2,

      subtotal:
        "95.00",

      platformFee:
        "0.00",

      shippingFee:
        "0.00",

      taxAmount:
        "0.00",

      totalAmount:
        "95.00",

      currency:
        "USD",

      paymentIntentId:
        paid
          ? "pi_marketplace_browser_paid"
          : null,

      fulfillmentStatus:
        canceled
          ? "CANCELED"
          : "PAYMENT_PENDING",

      completedAt:
        null,

      canceledAt:
        canceled
          ? "2026-07-19T12:00:00.000Z"
          : null,

      metadata:
        {},

      createdAt:
        "2026-07-19T10:00:00.000Z",

      updatedAt:
        "2026-07-19T12:00:00.000Z",

      listing: {
        id:
          "marketplace-browser-listing",

        itemId:
          null,

        sellerUserId:
          SELLER_ID,

        sellerShopId:
          null,

        listingType:
          "CUSTOMER_TO_CUSTOMER",

        status:
          canceled
            ? "ACTIVE"
            : paid
              ? "SOLD"
              : "RESERVED",

        title:
          "Marketplace checkout browser test item",

        description:
          "Browser-level checkout control test.",

        category:
          "Electronics",

        condition:
          "Good",

        price:
          "95.00",

        currency:
          "USD",

        quantity:
          canceled
            ? 3
            : 1,

        images:
          [],

        pickupAvailable:
          true,

        shippingAvailable:
          false,

        createdAt:
          "2026-07-19T10:00:00.000Z",

        updatedAt:
          "2026-07-19T12:00:00.000Z",
      },

      buyer: {
        id:
          BUYER_ID,

        name:
          "Marketplace Browser Buyer",

        role:
          "CONSUMER",
      },

      buyerShop:
        null,

      seller: {
        id:
          SELLER_ID,

        name:
          "Marketplace Browser Seller",

        role:
          "CONSUMER",
      },

      sellerShop:
        null,
    },
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
        "marketplace-browser-test-token",
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
            "Marketplace Browser User",

          email:
            "marketplace-browser-user@pawnloop.test",

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

      const transactionPath =
        `/api/marketplace-transactions/${TRANSACTION_ID}`;

      if (
        method === "GET" &&
        pathname ===
          transactionPath
      ) {
        await route.fulfill({
          status: 200,
          contentType:
            "application/json",
          body:
            jsonBody(
              transactionPayload(
                state,
              ),
            ),
        });

        return;
      }

      if (
        method === "POST" &&
        pathname ===
          `${transactionPath}/payment-intent`
      ) {
        state.paymentRequests +=
          1;

        state.status =
          "PAID";

        await route.fulfill({
          status: 200,
          contentType:
            "application/json",
          body:
            jsonBody({
              success:
                true,

              transactionId:
                TRANSACTION_ID,

              paymentIntentId:
                "pi_marketplace_browser_paid",

              clientSecret:
                null,

              amount:
                9500,

              currency:
                "usd",

              paymentStatus:
                "succeeded",

              transactionStatus:
                "PAYMENT_PROCESSING",

              reused:
                true,

              finalized:
                true,
            }),
        });

        return;
      }

      if (
        method === "POST" &&
        pathname ===
          `${transactionPath}/cancel-reservation`
      ) {
        state.cancellationRequests +=
          1;

        state.status =
          "CANCELED";

        await route.fulfill({
          status: 200,
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

              transactionId:
                TRANSACTION_ID,

              transactionStatus:
                "CANCELED",

              quantityRestored:
                2,

              listingStatus:
                "ACTIVE",

              paymentIntentId:
                null,

              paymentIntentStatus:
                null,

              paymentIntentCanceled:
                false,

              paymentIntentAlreadyCanceled:
                false,
            }),
        });

        return;
      }

      if (
        pathname ===
        "/api/auth/me"
      ) {
        await route.fulfill({
          status: 200,
          contentType:
            "application/json",
          body:
            jsonBody({
              success:
                true,

              user: {
                id:
                  BUYER_ID,

                name:
                  "Marketplace Browser Buyer",

                email:
                  "marketplace-browser-user@pawnloop.test",

                role:
                  "CONSUMER",
              },
            }),
        });

        return;
      }

      await route.fulfill({
        status: 200,
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

test(
  "buyer sees marketplace payment and cancellation controls",
  async ({
    page,
  }) => {
    const state: MockState = {
      status:
        "PENDING",

      paymentRequests:
        0,

      cancellationRequests:
        0,
    };

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
            "Marketplace checkout browser test item",
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Checkout actions",
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Pay now",
        },
      ),
    ).toBeEnabled();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Cancel reservation",
        },
      ),
    ).toBeEnabled();
  },
);

test(
  "finalized PaymentIntent refreshes the transaction as paid",
  async ({
    page,
  }) => {
    const state: MockState = {
      status:
        "PENDING",

      paymentRequests:
        0,

      cancellationRequests:
        0,
    };

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
      .getByRole(
        "button",
        {
          name:
            "Pay now",
        },
      )
      .click();

    await expect
      .poll(
        () =>
          state.paymentRequests,
      )
      .toBe(1);

    await expect(
      page.getByText(
        "Paid",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        /Stripe already reports this payment as successful/i,
      ),
    ).toBeVisible();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Pay now",
        },
      ),
    ).toBeDisabled();
  },
);

test(
  "buyer cancellation refreshes the transaction and reports restored inventory",
  async ({
    page,
  }) => {
    const state: MockState = {
      status:
        "PENDING",

      paymentRequests:
        0,

      cancellationRequests:
        0,
    };

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

    page.once(
      "dialog",
      async (dialog) => {
        await dialog.accept();
      },
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Cancel reservation",
        },
      )
      .click();

    await expect
      .poll(
        () =>
          state.cancellationRequests,
      )
      .toBe(1);

    await expect(
      page.getByText(
        "Canceled",
        {
          exact:
            true,
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByText(
        /Reservation canceled\. 2 items returned to the listing\./i,
      ),
    ).toBeVisible();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Cancel reservation",
        },
      ),
    ).toBeDisabled();
  },
);

test(
  "non-buyer account does not receive checkout controls",
  async ({
    page,
  }) => {
    const state: MockState = {
      status:
        "PENDING",

      paymentRequests:
        0,

      cancellationRequests:
        0,
    };

    await installAuth(
      page,
      {
        userId:
          "marketplace-browser-outsider",

        role:
          "OWNER",
      },
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
            "Marketplace checkout browser test item",
        },
      ),
    ).toBeVisible();

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Checkout actions",
        },
      ),
    ).toHaveCount(0);
  },
);

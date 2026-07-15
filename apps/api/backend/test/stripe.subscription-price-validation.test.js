import assert from "node:assert/strict";
import test from "node:test";

import {
  createValidatedSellerSubscriptionCheckoutSession,
  normalizeSellerBillingInterval,
} from "../src/services/stripeSubscriptionPrice.service.js";

const TEST_CATALOG = [
  {
    code: "PRO",
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    stripeMonthlyPriceId: "price_pro_month",
    stripeYearlyPriceId: "price_pro_year",
    currency: "USD",
  },
];

function createFakeStripe(price) {
  const calls = {
    retrieve: 0,
    checkoutCreate: 0,
    checkoutParams: null,
  };

  return {
    calls,
    prices: {
      async retrieve(priceId) {
        calls.retrieve += 1;

        return {
          ...price,
          id: price?.id || priceId,
        };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          calls.checkoutCreate += 1;
          calls.checkoutParams = params;

          return {
            id: "cs_test_validated",
            url: "https://checkout.example/test",
          };
        },
      },
    },
  };
}

function validMonthlyPrice(overrides = {}) {
  return {
    id: "price_pro_month",
    unit_amount: 4900,
    currency: "usd",
    active: true,
    type: "recurring",
    recurring: {
      interval: "month",
    },
    livemode: false,
    ...overrides,
  };
}

test("normalizes seller billing interval aliases", () => {
  assert.equal(
    normalizeSellerBillingInterval("monthly"),
    "MONTH",
  );

  assert.equal(
    normalizeSellerBillingInterval("annual"),
    "YEAR",
  );

  assert.equal(
    normalizeSellerBillingInterval(undefined),
    "MONTH",
  );
});

test("creates Checkout only after a valid Price passes", async () => {
  const stripe =
    createFakeStripe(validMonthlyPrice());

  const result =
    await createValidatedSellerSubscriptionCheckoutSession({
      stripe,
      catalog: TEST_CATALOG,
      planCode: "PRO",
      billingInterval: "MONTH",
      stripeSecretKey: "sk_test_core_only",
      checkoutParams: {
        mode: "subscription",
        customer: "cus_test",
      },
    });

  assert.equal(
    result.config.amountCents,
    4900,
  );

  assert.equal(
    stripe.calls.checkoutCreate,
    1,
  );

  assert.deepEqual(
    stripe.calls.checkoutParams.line_items,
    [
      {
        price: "price_pro_month",
        quantity: 1,
      },
    ],
  );
});

test("amount mismatch blocks Checkout Session creation", async () => {
  const stripe = createFakeStripe(
    validMonthlyPrice({
      unit_amount: 1900,
    }),
  );

  await assert.rejects(
    () =>
      createValidatedSellerSubscriptionCheckoutSession({
        stripe,
        catalog: TEST_CATALOG,
        planCode: "PRO",
        billingInterval: "MONTH",
        stripeSecretKey:
          "sk_test_core_only",
        checkoutParams: {
          mode: "subscription",
        },
      }),
    (error) => {
      assert.equal(
        error.code,
        "STRIPE_PRICE_AMOUNT_MISMATCH",
      );

      return true;
    },
  );

  assert.equal(
    stripe.calls.checkoutCreate,
    0,
  );
});

test("wrong recurring interval blocks Checkout", async () => {
  const stripe = createFakeStripe(
    validMonthlyPrice({
      recurring: {
        interval: "year",
      },
    }),
  );

  await assert.rejects(
    () =>
      createValidatedSellerSubscriptionCheckoutSession({
        stripe,
        catalog: TEST_CATALOG,
        planCode: "PRO",
        billingInterval: "MONTH",
        stripeSecretKey:
          "sk_test_core_only",
      }),
    (error) => {
      assert.equal(
        error.code,
        "STRIPE_PRICE_INTERVAL_MISMATCH",
      );

      return true;
    },
  );

  assert.equal(
    stripe.calls.checkoutCreate,
    0,
  );
});

test("Stripe account mode mismatch blocks Checkout", async () => {
  const stripe = createFakeStripe(
    validMonthlyPrice({
      livemode: true,
    }),
  );

  await assert.rejects(
    () =>
      createValidatedSellerSubscriptionCheckoutSession({
        stripe,
        catalog: TEST_CATALOG,
        planCode: "PRO",
        billingInterval: "MONTH",
        stripeSecretKey:
          "sk_test_core_only",
      }),
    (error) => {
      assert.equal(
        error.code,
        "STRIPE_PRICE_MODE_MISMATCH",
      );

      return true;
    },
  );

  assert.equal(
    stripe.calls.checkoutCreate,
    0,
  );
});

test("currency mismatch blocks Checkout", async () => {
  const stripe = createFakeStripe(
    validMonthlyPrice({
      currency: "cad",
    }),
  );

  await assert.rejects(
    () =>
      createValidatedSellerSubscriptionCheckoutSession({
        stripe,
        catalog: TEST_CATALOG,
        planCode: "PRO",
        billingInterval: "MONTH",
        stripeSecretKey: "sk_test_core_only",
      }),
    (error) => {
      assert.equal(
        error.code,
        "STRIPE_PRICE_CURRENCY_MISMATCH",
      );

      return true;
    },
  );

  assert.equal(
    stripe.calls.checkoutCreate,
    0,
  );
});

test("inactive Stripe Price blocks Checkout", async () => {
  const stripe = createFakeStripe(
    validMonthlyPrice({
      active: false,
    }),
  );

  await assert.rejects(
    () =>
      createValidatedSellerSubscriptionCheckoutSession({
        stripe,
        catalog: TEST_CATALOG,
        planCode: "PRO",
        billingInterval: "MONTH",
        stripeSecretKey: "sk_test_core_only",
      }),
    (error) => {
      assert.equal(
        error.code,
        "STRIPE_PRICE_INACTIVE",
      );

      return true;
    },
  );

  assert.equal(
    stripe.calls.checkoutCreate,
    0,
  );
});

test("Stripe Price retrieval failure blocks Checkout", async () => {
  const calls = {
    retrieve: 0,
    checkoutCreate: 0,
  };

  const stripe = {
    prices: {
      async retrieve() {
        calls.retrieve += 1;

        const error =
          new Error("Stripe Price does not exist");

        error.type =
          "StripeInvalidRequestError";

        throw error;
      },
    },
    checkout: {
      sessions: {
        async create() {
          calls.checkoutCreate += 1;

          return {
            id: "cs_should_not_exist",
          };
        },
      },
    },
  };

  await assert.rejects(
    () =>
      createValidatedSellerSubscriptionCheckoutSession({
        stripe,
        catalog: TEST_CATALOG,
        planCode: "PRO",
        billingInterval: "MONTH",
        stripeSecretKey: "sk_test_core_only",
      }),
    (error) => {
      assert.equal(
        error.code,
        "STRIPE_PRICE_LOOKUP_FAILED",
      );

      assert.equal(
        error.details?.stripeErrorType,
        "StripeInvalidRequestError",
      );

      return true;
    },
  );

  assert.equal(calls.retrieve, 1);
  assert.equal(calls.checkoutCreate, 0);
});

test("yearly checkout uses the yearly amount and Price", async () => {
  const stripe = createFakeStripe({
    id: "price_pro_year",
    unit_amount: 49000,
    currency: "usd",
    active: true,
    type: "recurring",
    recurring: {
      interval: "year",
    },
    livemode: false,
  });

  const result =
    await createValidatedSellerSubscriptionCheckoutSession({
      stripe,
      catalog: TEST_CATALOG,
      planCode: "PRO",
      billingInterval: "YEAR",
      stripeSecretKey: "sk_test_core_only",
    });

  assert.equal(
    result.config.amountCents,
    49000,
  );

  assert.equal(
    result.config.priceId,
    "price_pro_year",
  );

  assert.equal(
    stripe.calls.checkoutCreate,
    1,
  );
});

test("missing yearly Stripe Price blocks Checkout", async () => {
  const stripe =
    createFakeStripe(validMonthlyPrice());

  const catalog = [
    {
      ...TEST_CATALOG[0],
      stripeYearlyPriceId: null,
    },
  ];

  await assert.rejects(
    () =>
      createValidatedSellerSubscriptionCheckoutSession({
        stripe,
        catalog,
        planCode: "PRO",
        billingInterval: "YEAR",
        stripeSecretKey:
          "sk_test_core_only",
      }),
    (error) => {
      assert.equal(
        error.code,
        "SELLER_PLAN_STRIPE_PRICE_NOT_CONFIGURED",
      );

      return true;
    },
  );

  assert.equal(stripe.calls.retrieve, 0);
  assert.equal(
    stripe.calls.checkoutCreate,
    0,
  );
});

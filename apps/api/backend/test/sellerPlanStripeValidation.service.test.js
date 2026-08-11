import assert from "node:assert/strict";
import test from "node:test";
import {
  SellerPlanStripeValidationError,
  validateSellerPlanStripeReferences,
} from "../src/services/sellerPlanStripeValidation.service.js";

const catalog = [
  {
    code: "FREE",
    isFree: true,
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
  },
  {
    code: "PRO",
    isFree: false,
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    stripeMonthlyPriceId: "price_pro_month",
    stripeYearlyPriceId: "price_pro_year",
    currency: "USD",
  },
];

function price({ id, amount, interval, product = "prod_pro" }) {
  return {
    id,
    active: true,
    currency: "usd",
    livemode: false,
    product,
    recurring: { interval },
    type: "recurring",
    unit_amount: amount,
  };
}

function fakeStripe({ yearlyProduct = "prod_pro", productActive = true } = {}) {
  return {
    prices: {
      async retrieve(id) {
        return id === "price_pro_month"
          ? price({ id, amount: 4900, interval: "month" })
          : price({
              id,
              amount: 49000,
              interval: "year",
              product: yearlyProduct,
            });
      },
    },
    products: {
      async retrieve(id) {
        return { id, active: productActive, deleted: false, name: "PawnShop Seller Pro" };
      },
    },
  };
}

test("validates monthly/yearly Price amounts, intervals, mode, and shared Product", async () => {
  const result = await validateSellerPlanStripeReferences({
    stripe: fakeStripe(),
    catalog,
    planCode: "PRO",
    configuredProductId: "prod_pro",
    stripeSecretKey: "sk_test_example",
  });

  assert.equal(result.valid, true);
  assert.equal(result.notRequired, false);
  assert.equal(result.product.name, "PawnShop Seller Pro");
  assert.deepEqual(
    result.prices.map((entry) => [entry.billingInterval, entry.amountCents]),
    [
      ["MONTH", 4900],
      ["YEAR", 49000],
    ],
  );
});

test("rejects monthly and yearly Prices attached to different Products", async () => {
  await assert.rejects(
    validateSellerPlanStripeReferences({
      stripe: fakeStripe({ yearlyProduct: "prod_other" }),
      catalog,
      planCode: "PRO",
      configuredProductId: "prod_pro",
      stripeSecretKey: "sk_test_example",
    }),
    (error) => {
      assert.ok(error instanceof SellerPlanStripeValidationError);
      assert.equal(error.code, "SELLER_PLAN_STRIPE_PRODUCT_MISMATCH");
      return true;
    },
  );
});

test("rejects an inactive Stripe Product", async () => {
  await assert.rejects(
    validateSellerPlanStripeReferences({
      stripe: fakeStripe({ productActive: false }),
      catalog,
      planCode: "PRO",
      configuredProductId: "prod_pro",
      stripeSecretKey: "sk_test_example",
    }),
    (error) => {
      assert.equal(error.code, "SELLER_PLAN_STRIPE_PRODUCT_INACTIVE");
      return true;
    },
  );
});

test("FREE is explicitly valid without constructing Stripe references", async () => {
  const result = await validateSellerPlanStripeReferences({
    stripe: null,
    catalog,
    planCode: "FREE",
    stripeSecretKey: "",
  });

  assert.equal(result.valid, true);
  assert.equal(result.notRequired, true);
  assert.deepEqual(result.prices, []);
});

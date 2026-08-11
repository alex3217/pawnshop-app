import {
  assertStripePriceMatchesBillingConfig,
  selectSellerPlanBillingConfig,
} from "./stripeSubscriptionPrice.service.js";

export class SellerPlanStripeValidationError extends Error {
  constructor(message, code, statusCode = 503, details = {}) {
    super(message);
    this.name = "SellerPlanStripeValidationError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function validationError(message, code, details = {}) {
  return new SellerPlanStripeValidationError(
    message,
    code,
    503,
    details,
  );
}

function stripeObjectId(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return "";
}

async function retrievePrice(stripe, config) {
  try {
    return await stripe.prices.retrieve(config.priceId);
  } catch (error) {
    throw validationError(
      `Unable to retrieve the ${config.billingInterval.toLowerCase()} Stripe Price.`,
      "SELLER_PLAN_STRIPE_PRICE_LOOKUP_FAILED",
      {
        planCode: config.planCode,
        billingInterval: config.billingInterval,
        stripeErrorType: error?.type || null,
      },
    );
  }
}

async function retrieveProduct(stripe, productId, planCode) {
  try {
    return await stripe.products.retrieve(productId);
  } catch (error) {
    throw validationError(
      "Unable to retrieve the configured Stripe Product.",
      "SELLER_PLAN_STRIPE_PRODUCT_LOOKUP_FAILED",
      {
        planCode,
        stripeErrorType: error?.type || null,
      },
    );
  }
}

export async function validateSellerPlanStripeReferences({
  stripe,
  catalog,
  planCode,
  configuredProductId = null,
  stripeSecretKey = process.env.STRIPE_SECRET_KEY,
}) {
  const plan = Array.isArray(catalog)
    ? catalog.find(
        (candidate) =>
          String(candidate?.code || "").trim().toUpperCase() ===
          String(planCode || "").trim().toUpperCase(),
      )
    : null;

  if (!plan) {
    throw new SellerPlanStripeValidationError(
      "Seller plan was not found.",
      "SELLER_PLAN_NOT_FOUND",
      400,
      { planCode: String(planCode || "").trim().toUpperCase() || null },
    );
  }

  if (plan.isFree || plan.code === "FREE") {
    return {
      valid: true,
      notRequired: true,
      planCode: plan.code,
      validatedAt: new Date().toISOString(),
      prices: [],
    };
  }

  if (!stripe?.prices?.retrieve || !stripe?.products?.retrieve) {
    throw validationError(
      "Stripe client is missing required Product and Price APIs.",
      "SELLER_PLAN_STRIPE_CLIENT_INVALID",
    );
  }

  const configs = ["MONTH", "YEAR"].map((billingInterval) =>
    selectSellerPlanBillingConfig(catalog, plan.code, billingInterval),
  );

  const prices = await Promise.all(
    configs.map(async (config) => {
      const price = await retrievePrice(stripe, config);
      assertStripePriceMatchesBillingConfig(price, config, stripeSecretKey);
      const productId = stripeObjectId(price.product);

      if (!productId) {
        throw validationError(
          `The ${config.billingInterval.toLowerCase()} Stripe Price has no Product.`,
          "SELLER_PLAN_STRIPE_PRICE_PRODUCT_MISSING",
          {
            planCode: config.planCode,
            billingInterval: config.billingInterval,
          },
        );
      }

      return {
        billingInterval: config.billingInterval,
        amountCents: config.amountCents,
        currency: config.currency.toUpperCase(),
        recurringInterval: config.expectedStripeInterval,
        productId,
      };
    }),
  );

  const productIds = new Set(prices.map((price) => price.productId));
  if (productIds.size !== 1) {
    throw validationError(
      "Monthly and yearly Stripe Prices belong to different Products.",
      "SELLER_PLAN_STRIPE_PRODUCT_MISMATCH",
      { planCode: plan.code },
    );
  }

  const priceProductId = prices[0].productId;
  const expectedProductId = String(configuredProductId || "").trim();
  if (expectedProductId && expectedProductId !== priceProductId) {
    throw validationError(
      "Configured Stripe Product does not match the monthly and yearly Prices.",
      "SELLER_PLAN_STRIPE_CONFIGURED_PRODUCT_MISMATCH",
      { planCode: plan.code },
    );
  }

  const product = await retrieveProduct(stripe, priceProductId, plan.code);
  if (product?.deleted === true || product?.active !== true) {
    throw validationError(
      "The Stripe Product is inactive or deleted.",
      "SELLER_PLAN_STRIPE_PRODUCT_INACTIVE",
      { planCode: plan.code },
    );
  }

  return {
    valid: true,
    notRequired: false,
    planCode: plan.code,
    validatedAt: new Date().toISOString(),
    product: {
      active: true,
      name: String(product.name || "").trim() || null,
    },
    prices: prices.map(({ productId: _productId, ...price }) => price),
  };
}

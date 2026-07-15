import {
  getSellerPlanCatalog,
} from "./platformPricingCatalog.service.js";

export const SELLER_BILLING_INTERVALS = Object.freeze({
  MONTH: "MONTH",
  YEAR: "YEAR",
});

export class StripeSubscriptionPriceConfigError extends Error {
  constructor(
    message,
    code = "STRIPE_PRICE_CONFIGURATION_ERROR",
    statusCode = 503,
    details = {},
  ) {
    super(message);
    this.name = "StripeSubscriptionPriceConfigError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function createConfigError(
  message,
  code,
  statusCode = 503,
  details = {},
) {
  return new StripeSubscriptionPriceConfigError(
    message,
    code,
    statusCode,
    details,
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePlanCode(value) {
  return normalizeText(value).toUpperCase();
}

export function normalizeSellerBillingInterval(
  value,
  fallback = SELLER_BILLING_INTERVALS.MONTH,
) {
  const raw = normalizeText(value || fallback).toUpperCase();

  if (["MONTH", "MONTHLY"].includes(raw)) {
    return SELLER_BILLING_INTERVALS.MONTH;
  }

  if (["YEAR", "YEARLY", "ANNUAL"].includes(raw)) {
    return SELLER_BILLING_INTERVALS.YEAR;
  }

  throw createConfigError(
    `Unsupported billing interval: ${raw || "(empty)"}`,
    "SELLER_BILLING_INTERVAL_INVALID",
    400,
    {
      billingInterval: raw || null,
      supportedBillingIntervals:
        Object.values(SELLER_BILLING_INTERVALS),
    },
  );
}

function getExpectedLiveMode(secretKey) {
  const key = normalizeText(secretKey);

  if (key.startsWith("sk_live_")) return true;
  if (key.startsWith("sk_test_")) return false;

  throw createConfigError(
    "Stripe secret key mode could not be determined.",
    "STRIPE_SECRET_KEY_MODE_UNKNOWN",
    500,
  );
}

export function selectSellerPlanBillingConfig(
  catalog,
  planCode,
  billingInterval,
) {
  const normalizedPlanCode = normalizePlanCode(planCode);
  const normalizedInterval =
    normalizeSellerBillingInterval(billingInterval);

  const plans = Array.isArray(catalog) ? catalog : [];

  const plan =
    plans.find(
      (candidate) =>
        normalizePlanCode(candidate?.code) ===
        normalizedPlanCode,
    ) || null;

  if (!plan) {
    throw createConfigError(
      `Seller plan was not found: ${normalizedPlanCode}`,
      "SELLER_PLAN_NOT_FOUND",
      400,
      {
        planCode: normalizedPlanCode,
      },
    );
  }

  const isYearly =
    normalizedInterval === SELLER_BILLING_INTERVALS.YEAR;

  const amountCents = Number(
    isYearly
      ? plan.yearlyPriceCents
      : plan.monthlyPriceCents,
  );

  const priceId = normalizeText(
    isYearly
      ? plan.stripeYearlyPriceId
      : plan.stripeMonthlyPriceId,
  );

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw createConfigError(
      `${normalizedPlanCode} ${normalizedInterval} price is invalid.`,
      "SELLER_PLAN_AMOUNT_INVALID",
      503,
      {
        planCode: normalizedPlanCode,
        billingInterval: normalizedInterval,
        amountCents,
      },
    );
  }

  if (!priceId) {
    throw createConfigError(
      `${normalizedPlanCode} ${normalizedInterval} Stripe Price is not configured.`,
      "SELLER_PLAN_STRIPE_PRICE_NOT_CONFIGURED",
      503,
      {
        planCode: normalizedPlanCode,
        billingInterval: normalizedInterval,
      },
    );
  }

  return {
    planCode: normalizedPlanCode,
    billingInterval: normalizedInterval,
    amountCents,
    priceId,
    currency: normalizeText(
      plan.currency || "USD",
    ).toLowerCase(),
    expectedStripeInterval:
      isYearly ? "year" : "month",
  };
}

export function assertStripePriceMatchesBillingConfig(
  price,
  config,
  stripeSecretKey,
) {
  if (!price || typeof price !== "object") {
    throw createConfigError(
      "Stripe Price lookup returned no Price.",
      "STRIPE_PRICE_LOOKUP_EMPTY",
    );
  }

  if (normalizeText(price.id) !== config.priceId) {
    throw createConfigError(
      "Stripe returned an unexpected Price.",
      "STRIPE_PRICE_ID_MISMATCH",
      503,
      {
        expectedPriceId: config.priceId,
        actualPriceId: price.id || null,
      },
    );
  }

  if (Number(price.unit_amount) !== config.amountCents) {
    throw createConfigError(
      "Stripe Price amount does not match the seller-plan amount.",
      "STRIPE_PRICE_AMOUNT_MISMATCH",
      503,
      {
        planCode: config.planCode,
        billingInterval: config.billingInterval,
        expectedAmountCents: config.amountCents,
        actualAmountCents: price.unit_amount,
        priceId: config.priceId,
      },
    );
  }

  if (
    normalizeText(price.currency).toLowerCase() !==
    config.currency
  ) {
    throw createConfigError(
      "Stripe Price currency does not match the seller-plan currency.",
      "STRIPE_PRICE_CURRENCY_MISMATCH",
      503,
      {
        expectedCurrency: config.currency,
        actualCurrency: price.currency || null,
        priceId: config.priceId,
      },
    );
  }

  if (
    price.type !== "recurring" ||
    price.recurring?.interval !==
      config.expectedStripeInterval
  ) {
    throw createConfigError(
      "Stripe Price recurring interval does not match the requested billing interval.",
      "STRIPE_PRICE_INTERVAL_MISMATCH",
      503,
      {
        billingInterval: config.billingInterval,
        expectedStripeInterval:
          config.expectedStripeInterval,
        actualStripeInterval:
          price.recurring?.interval || null,
        priceId: config.priceId,
      },
    );
  }

  if (price.active !== true) {
    throw createConfigError(
      "Stripe Price is inactive.",
      "STRIPE_PRICE_INACTIVE",
      503,
      {
        priceId: config.priceId,
      },
    );
  }

  const expectedLiveMode =
    getExpectedLiveMode(stripeSecretKey);

  if (Boolean(price.livemode) !== expectedLiveMode) {
    throw createConfigError(
      "Stripe Price mode does not match the configured Stripe account mode.",
      "STRIPE_PRICE_MODE_MISMATCH",
      503,
      {
        expectedLiveMode,
        actualLiveMode: Boolean(price.livemode),
        priceId: config.priceId,
      },
    );
  }

  return {
    ...config,
    stripePrice: price,
  };
}

export async function createValidatedSellerSubscriptionCheckoutSession({
  stripe,
  planCode,
  billingInterval = SELLER_BILLING_INTERVALS.MONTH,
  checkoutParams,
  catalog = null,
  stripeSecretKey = process.env.STRIPE_SECRET_KEY,
}) {
  if (
    !stripe?.prices?.retrieve ||
    !stripe?.checkout?.sessions?.create
  ) {
    throw createConfigError(
      "Stripe client is missing required Checkout APIs.",
      "STRIPE_CLIENT_INVALID",
      500,
    );
  }

  const planCatalog =
    catalog || (await getSellerPlanCatalog());

  const config = selectSellerPlanBillingConfig(
    planCatalog,
    planCode,
    billingInterval,
  );

  let price;

  try {
    price = await stripe.prices.retrieve(
      config.priceId,
    );
  } catch (error) {
    throw createConfigError(
      "Unable to retrieve the configured Stripe Price.",
      "STRIPE_PRICE_LOOKUP_FAILED",
      503,
      {
        planCode: config.planCode,
        billingInterval: config.billingInterval,
        priceId: config.priceId,
        stripeErrorType: error?.type || null,
      },
    );
  }

  assertStripePriceMatchesBillingConfig(
    price,
    config,
    stripeSecretKey,
  );

  const session =
    await stripe.checkout.sessions.create({
      ...(checkoutParams || {}),
      line_items: [
        {
          price: config.priceId,
          quantity: 1,
        },
      ],
    });

  return {
    session,
    price,
    config,
  };
}

const BASIS_POINTS_DIVISOR = 10_000;

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    const error = new TypeError(
      `${fieldName} must be a non-negative integer expressed in cents.`,
    );

    error.code = "INVALID_MONEY_VALUE";
    throw error;
  }

  return value;
}

function normalizeNullableInteger(value, fieldName) {
  if (value === undefined || value === null) return null;
  return requireNonNegativeInteger(Number(value), fieldName);
}

function normalizeCurrency(value) {
  const currency = String(value || "USD").trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    const error = new TypeError("currency must be a three-letter currency code.");
    error.code = "INVALID_CURRENCY";
    throw error;
  }

  return currency;
}

function normalizeFeeType(value) {
  const feeType = String(value || "PERCENT_BPS").trim().toUpperCase();

  const supported = new Set([
    "FIXED_CENTS",
    "PERCENT_BPS",
    "PERCENT_PLUS_FIXED",
  ]);

  if (!supported.has(feeType)) {
    const error = new TypeError(`Unsupported fee type: ${feeType}`);
    error.code = "UNSUPPORTED_FEE_TYPE";
    throw error;
  }

  return feeType;
}

function clamp(value, minimum, maximum) {
  let result = value;

  if (minimum !== null) {
    result = Math.max(result, minimum);
  }

  if (maximum !== null) {
    result = Math.min(result, maximum);
  }

  return result;
}

export function calculatePercentageFeeCents(
  grossAmountCents,
  percentBps,
) {
  const gross = requireNonNegativeInteger(
    grossAmountCents,
    "grossAmountCents",
  );

  const basisPoints = requireNonNegativeInteger(
    percentBps,
    "percentBps",
  );

  return Math.round(
    (gross * basisPoints) / BASIS_POINTS_DIVISOR,
  );
}

export function calculatePlatformFeeCents({
  grossAmountCents,
  pricingRule,
}) {
  const gross = requireNonNegativeInteger(
    grossAmountCents,
    "grossAmountCents",
  );

  if (!pricingRule || typeof pricingRule !== "object") {
    const error = new TypeError("pricingRule is required.");
    error.code = "MISSING_PRICING_RULE";
    throw error;
  }

  const feeType = normalizeFeeType(pricingRule.feeType);

  const amountCents =
    normalizeNullableInteger(
      pricingRule.amountCents,
      "pricingRule.amountCents",
    ) ?? 0;

  const percentBps =
    normalizeNullableInteger(
      pricingRule.percentBps,
      "pricingRule.percentBps",
    ) ?? 0;

  const minCents = normalizeNullableInteger(
    pricingRule.minCents,
    "pricingRule.minCents",
  );

  const maxCents = normalizeNullableInteger(
    pricingRule.maxCents,
    "pricingRule.maxCents",
  );

  if (
    minCents !== null &&
    maxCents !== null &&
    minCents > maxCents
  ) {
    const error = new RangeError(
      "pricingRule.minCents cannot exceed pricingRule.maxCents.",
    );

    error.code = "INVALID_FEE_LIMITS";
    throw error;
  }

  let calculatedFeeCents = 0;

  if (feeType === "FIXED_CENTS") {
    calculatedFeeCents = amountCents;
  }

  if (feeType === "PERCENT_BPS") {
    calculatedFeeCents = calculatePercentageFeeCents(
      gross,
      percentBps,
    );
  }

  if (feeType === "PERCENT_PLUS_FIXED") {
    calculatedFeeCents =
      calculatePercentageFeeCents(gross, percentBps) +
      amountCents;
  }

  const platformFeeCents = clamp(
    calculatedFeeCents,
    minCents,
    maxCents,
  );

  // A marketplace fee must never exceed the gross transaction amount.
  return Math.min(platformFeeCents, gross);
}

export function calculateSettlementRevenue({
  grossAmountCents,
  pricingRule,
  processorFeeCents = 0,
  taxCents = 0,
  shippingCents = 0,
  processorFeePaidBy = "PLATFORM",
  currency = "USD",
  calculatedAt = new Date(),
}) {
  const gross = requireNonNegativeInteger(
    grossAmountCents,
    "grossAmountCents",
  );

  const processorFee = requireNonNegativeInteger(
    processorFeeCents,
    "processorFeeCents",
  );

  const tax = requireNonNegativeInteger(
    taxCents,
    "taxCents",
  );

  const shipping = requireNonNegativeInteger(
    shippingCents,
    "shippingCents",
  );

  const normalizedProcessorFeePayer = String(
    processorFeePaidBy || "PLATFORM",
  )
    .trim()
    .toUpperCase();

  if (
    !["PLATFORM", "SELLER"].includes(
      normalizedProcessorFeePayer,
    )
  ) {
    const error = new TypeError(
      "processorFeePaidBy must be PLATFORM or SELLER.",
    );

    error.code = "INVALID_PROCESSOR_FEE_PAYER";
    throw error;
  }

  const platformFeeCents = calculatePlatformFeeCents({
    grossAmountCents: gross,
    pricingRule,
  });

  const sellerProcessorFeeCents =
    normalizedProcessorFeePayer === "SELLER"
      ? processorFee
      : 0;

  const sellerNetCents = Math.max(
    gross -
      platformFeeCents -
      sellerProcessorFeeCents,
    0,
  );

  const platformNetCents =
    platformFeeCents -
    (normalizedProcessorFeePayer === "PLATFORM"
      ? processorFee
      : 0);

  const timestamp =
    calculatedAt instanceof Date
      ? calculatedAt
      : new Date(calculatedAt);

  if (Number.isNaN(timestamp.getTime())) {
    const error = new TypeError(
      "calculatedAt must be a valid date.",
    );

    error.code = "INVALID_CALCULATION_DATE";
    throw error;
  }

  return {
    grossAmountCents: gross,
    platformFeeCents,
    processorFeeCents: processorFee,
    processorFeePaidBy: normalizedProcessorFeePayer,
    sellerNetCents,
    platformNetCents,
    taxCents: tax,
    shippingCents: shipping,
    currency: normalizeCurrency(currency),

    pricingRuleId:
      pricingRule?.id != null
        ? String(pricingRule.id)
        : null,

    pricingRuleKey:
      pricingRule?.key != null
        ? String(pricingRule.key)
        : null,

    pricingRuleSnapshot: {
      id:
        pricingRule?.id != null
          ? String(pricingRule.id)
          : null,

      key:
        pricingRule?.key != null
          ? String(pricingRule.key)
          : null,

      label:
        pricingRule?.label != null
          ? String(pricingRule.label)
          : null,

      category:
        pricingRule?.category != null
          ? String(pricingRule.category)
          : null,

      appliesTo:
        pricingRule?.appliesTo != null
          ? String(pricingRule.appliesTo)
          : null,

      feeType: normalizeFeeType(pricingRule?.feeType),

      amountCents:
        normalizeNullableInteger(
          pricingRule?.amountCents,
          "pricingRule.amountCents",
        ) ?? 0,

      percentBps:
        normalizeNullableInteger(
          pricingRule?.percentBps,
          "pricingRule.percentBps",
        ) ?? 0,

      minCents: normalizeNullableInteger(
        pricingRule?.minCents,
        "pricingRule.minCents",
      ),

      maxCents: normalizeNullableInteger(
        pricingRule?.maxCents,
        "pricingRule.maxCents",
      ),

      currency: normalizeCurrency(
        pricingRule?.currency || currency,
      ),

      effectiveStartAt:
        pricingRule?.effectiveStartAt || null,

      effectiveEndAt:
        pricingRule?.effectiveEndAt || null,

      calculatedAt: timestamp.toISOString(),
    },

    feeCalculatedAt: timestamp.toISOString(),
  };
}

import { createRequire } from "node:module";

const requireFromBackend = createRequire(
  new URL(
    "../apps/api/backend/package.json",
    import.meta.url,
  ),
);

const { PrismaClient } =
  requireFromBackend("@prisma/client");

const prisma = new PrismaClient();

if (process.env.CONFIRM_SELLER_PLAN_SEED !== "YES") {
  throw new Error(
    "Seller-plan seed blocked. Set CONFIRM_SELLER_PLAN_SEED=YES and use an explicit --env-file.",
  );
}

const allowOverwrite =
  process.env.OVERWRITE_SELLER_PLAN_RULES === "YES";

function cleanText(value) {
  const text = String(value || "").trim();

  if (!text || /REPLACE_ME/i.test(text)) {
    return null;
  }

  return text;
}

const plans = [
  {
    code: "free",
    planCode: "FREE",
    label: "Free",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    commissionBps: 1200,
    monthlyStripePriceId: null,
    yearlyStripePriceId: null,
  },
  {
    code: "pro",
    planCode: "PRO",
    label: "Pro",
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    commissionBps: 900,
    monthlyStripePriceId:
      cleanText(process.env.STRIPE_PRICE_PRO),
    yearlyStripePriceId:
      cleanText(process.env.STRIPE_PRICE_PRO_YEARLY),
  },
  {
    code: "premium",
    planCode: "PREMIUM",
    label: "Premium",
    monthlyPriceCents: 14900,
    yearlyPriceCents: 149000,
    commissionBps: 600,
    monthlyStripePriceId:
      cleanText(process.env.STRIPE_PRICE_PREMIUM),
    yearlyStripePriceId:
      cleanText(process.env.STRIPE_PRICE_PREMIUM_YEARLY),
  },
  {
    code: "ultra",
    planCode: "ULTRA",
    label: "Ultra",
    monthlyPriceCents: 29900,
    yearlyPriceCents: 299000,
    commissionBps: 400,
    monthlyStripePriceId:
      cleanText(process.env.STRIPE_PRICE_ULTRA),
    yearlyStripePriceId:
      cleanText(process.env.STRIPE_PRICE_ULTRA_YEARLY),
  },
];

function fixedRule({
  key,
  label,
  description,
  amountCents,
  stripePriceId,
  metadata,
}) {
  return {
    key,
    label,
    description,
    category: "SUBSCRIPTIONS",
    appliesTo: "SELLER",
    feeType: "FIXED_CENTS",
    amountCents,
    percentBps: null,
    currency: "USD",
    status: "ACTIVE",
    stripePriceId,
    metadata,
  };
}

function percentRule({
  key,
  label,
  description,
  percentBps,
  metadata,
}) {
  return {
    key,
    label,
    description,
    category: "SUBSCRIPTIONS",
    appliesTo: "SELLER",
    feeType: "PERCENT_BPS",
    amountCents: null,
    percentBps,
    currency: "USD",
    status: "ACTIVE",
    stripePriceId: null,
    metadata,
  };
}

const rules = plans.flatMap((plan) => [
  fixedRule({
    key: `seller_plan_${plan.code}_monthly`,
    label: `${plan.label} monthly price`,
    description:
      `${plan.label} seller subscription monthly price.`,
    amountCents: plan.monthlyPriceCents,
    stripePriceId: plan.monthlyStripePriceId,
    metadata: {
      planCode: plan.planCode,
      billingInterval: "MONTH",
    },
  }),

  fixedRule({
    key: `seller_plan_${plan.code}_yearly`,
    label: `${plan.label} yearly price`,
    description:
      `${plan.label} seller subscription yearly price.`,
    amountCents: plan.yearlyPriceCents,
    stripePriceId: plan.yearlyStripePriceId,
    metadata: {
      planCode: plan.planCode,
      billingInterval: "YEAR",
    },
  }),

  percentRule({
    key:
      `seller_plan_${plan.code}_commission_bps`,
    label: `${plan.label} commission`,
    description:
      `${plan.label} marketplace commission in basis points.`,
    percentBps: plan.commissionBps,
    metadata: {
      planCode: plan.planCode,
    },
  }),
]);

try {
  for (const rule of rules) {
    const existing =
      await prisma.platformPricingRule.findUnique({
        where: {
          key: rule.key,
        },
      });

    if (existing && !allowOverwrite) {
      console.log(
        `↪ Preserved existing database rule: ${rule.key}`,
      );
      continue;
    }

    const {
      stripePriceId,
      ...ruleWithoutStripePrice
    } = rule;

    const validStripePriceId =
      cleanText(stripePriceId);

    const saved = existing
      ? await prisma.platformPricingRule.update({
          where: {
            id: existing.id,
          },
          data: {
            ...ruleWithoutStripePrice,
            ...(validStripePriceId
              ? {
                  stripePriceId:
                    validStripePriceId,
                }
              : {}),
          },
        })
      : await prisma.platformPricingRule.create({
          data: {
            ...ruleWithoutStripePrice,
            stripePriceId:
              validStripePriceId,
          },
        });

    console.log(
      `✅ ${saved.key}: amount=${saved.amountCents ?? "—"} bps=${saved.percentBps ?? "—"} stripe=${saved.stripePriceId ?? "—"}`,
    );
  }
} finally {
  await prisma.$disconnect();
}

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

const seedConfirmed =
  process.env.CONFIRM_SELLER_PLAN_SEED === "YES";

if (!seedConfirmed) {
  throw new Error(
    "Seller-plan seed blocked. Set CONFIRM_SELLER_PLAN_SEED=YES and use an explicit --env-file.",
  );
}

const allowOverwrite =
  process.env.OVERWRITE_SELLER_PLAN_RULES === "YES";

const definitions = [
  {
    code: "free",
    label: "Free seller plan limits",
    metadata: {
      maxActiveListings: 50,
      trialMaxActiveListings: 50,
      maxLocations: 1,
      maxStaffUsers: 1,
      canCreateAuctions: false,
      canFeatureListings: false,
      analyticsLevel: "none",
      features: [
        "Up to 50 active listings",
        "50 active listings during trial",
        "Basic shop profile",
        "Standard support",
      ],
    },
  },
  {
    code: "pro",
    label: "Pro seller plan limits",
    metadata: {
      maxActiveListings: 100,
      trialMaxActiveListings: 50,
      maxLocations: 1,
      maxStaffUsers: 3,
      canCreateAuctions: true,
      canFeatureListings: true,
      analyticsLevel: "basic",
      features: [
        "Up to 100 active listings",
        "50 active listings during trial",
        "Auction creation",
        "Featured listings",
        "Basic analytics",
        "Lower commission rate",
      ],
    },
  },
  {
    code: "premium",
    label: "Premium seller plan limits",
    metadata: {
      maxActiveListings: null,
      trialMaxActiveListings: 50,
      maxLocations: 5,
      maxStaffUsers: 15,
      canCreateAuctions: true,
      canFeatureListings: true,
      analyticsLevel: "advanced",
      features: [
        "Unlimited active listings after trial",
        "50 active listings during trial",
        "Priority featured placement",
        "Advanced analytics",
        "Multi-location support",
        "Staff account support",
      ],
    },
  },
  {
    code: "ultra",
    label: "Ultra seller plan limits",
    metadata: {
      maxActiveListings: null,
      trialMaxActiveListings: 50,
      maxLocations: null,
      maxStaffUsers: null,
      canCreateAuctions: true,
      canFeatureListings: true,
      analyticsLevel: "enterprise",
      features: [
        "Unlimited active listings after trial",
        "50 active listings during trial",
        "Unlimited locations",
        "Unlimited staff users",
        "Enterprise analytics",
        "API integrations",
        "Dedicated support",
      ],
    },
  },
];

try {
  for (const definition of definitions) {
    const key =
      `seller_plan_${definition.code}_limits`;

    const existing =
      await prisma.platformPricingRule.findUnique({
        where: {
          key,
        },
      });

    if (existing && !allowOverwrite) {
      console.log(
        `↪ Preserved existing database rule: ${key}`,
      );
      continue;
    }

    const data = {
      label: definition.label,
      description:
        "Database-backed seller plan limits and features.",
      category: "SUBSCRIPTIONS",
      appliesTo: "SELLER",
      feeType: "FIXED_CENTS",
      amountCents: 0,
      percentBps: null,
      status: "ACTIVE",
      metadata: definition.metadata,
    };

    const rule = existing
      ? await prisma.platformPricingRule.update({
          where: {
            id: existing.id,
          },
          data,
        })
      : await prisma.platformPricingRule.create({
          data: {
            key,
            ...data,
          },
        });

    console.log(
      `✅ ${rule.key}: ${JSON.stringify(rule.metadata)}`,
    );
  }
} finally {
  await prisma.$disconnect();
}

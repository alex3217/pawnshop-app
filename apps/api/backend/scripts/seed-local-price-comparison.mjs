import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

function databaseIdentity(rawUrl) {
  const parsed = new URL(rawUrl);

  return [
    normalizedDatabaseHost(parsed),
    parsed.port || "5432",
    parsed.pathname.replace(/\/$/, ""),
  ].join(":");
}

function normalizedDatabaseHost(parsedUrl) {
  const hostname = parsedUrl.hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");

  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    return "localhost";
  }

  return hostname;
}

function parsePostgresUrl(rawUrl, variableName) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      `${variableName} must be a valid PostgreSQL URL.`,
    );
  }

  if (
    parsed.protocol !== "postgresql:"
    && parsed.protocol !== "postgres:"
  ) {
    throw new Error(
      `${variableName} must use the postgresql or postgres protocol.`,
    );
  }

  return parsed;
}

function assertDevelopmentSeedAllowed() {
  const configuredEnvironments = [
    process.env.APP_ENV,
    process.env.NODE_ENV,
  ].filter((value) => value !== undefined && value !== "");

  if (
    configuredEnvironments.length === 0
    || configuredEnvironments.some(
      (value) => !["development", "test"].includes(
        String(value).toLowerCase(),
      ),
    )
  ) {
    throw new Error(
      "APP_ENV or NODE_ENV must be explicitly set to development or test.",
    );
  }

  if (process.env.ALLOW_DEV_SEED !== "1") {
    throw new Error(
      "Set ALLOW_DEV_SEED=1 to create development test data.",
    );
  }
}

function validateSeedDatabaseUrl() {
  const seedDatabaseUrl = process.env.DEV_DATABASE_URL;

  if (!seedDatabaseUrl) {
    throw new Error(
      "DEV_DATABASE_URL is required. Use a dedicated local development database.",
    );
  }

  const parsedSeedUrl = parsePostgresUrl(
    seedDatabaseUrl,
    "DEV_DATABASE_URL",
  );
  if (normalizedDatabaseHost(parsedSeedUrl) !== "localhost") {
    throw new Error(
      "DEV_DATABASE_URL must use a local loopback database host.",
    );
  }

  const primaryDatabaseUrl = process.env.DATABASE_URL;

  if (primaryDatabaseUrl) {
    parsePostgresUrl(primaryDatabaseUrl, "DATABASE_URL");

    if (
      databaseIdentity(seedDatabaseUrl)
        === databaseIdentity(primaryDatabaseUrl)
    ) {
      throw new Error(
        "DEV_DATABASE_URL cannot point to the same database as DATABASE_URL.",
      );
    }
  }

  return seedDatabaseUrl;
}

let prisma;

const MARKER_PREFIX = "[LOCAL_PRICE_COMPARISON_V1:";
const OWNER_EMAIL = "comparison-owner@pawn.local";
const OWNER_PASSWORD = "PawnLoop-Comparison-2026!";

async function upsertOwner() {
  const password = await bcrypt.hash(
    OWNER_PASSWORD,
    10,
  );

  return prisma.user.upsert({
    where: {
      email: OWNER_EMAIL,
    },
    update: {
      name: "Price Comparison Test Owner",
      password,
      role: "OWNER",
      isActive: true,
    },
    create: {
      name: "Price Comparison Test Owner",
      email: OWNER_EMAIL,
      password,
      role: "OWNER",
      isActive: true,
    },
  });
}

async function upsertShop(ownerId, definition) {
  const existing = await prisma.pawnShop.findFirst({
    where: {
      name: definition.name,
    },
  });

  const data = {
    ...definition,
    ownerId,
    isDeleted: false,
    subscriptionPlan: "PRO",
    subscriptionStatus: "ACTIVE",
  };

  if (existing) {
    return prisma.pawnShop.update({
      where: {
        id: existing.id,
      },
      data,
    });
  }

  return prisma.pawnShop.create({
    data,
  });
}

async function upsertItem(definition, shopId) {
  const marker = `${MARKER_PREFIX}${definition.key}]`;

  const existing = await prisma.item.findFirst({
    where: {
      pawnShopId: shopId,
      description: {
        startsWith: marker,
      },
    },
  });

  const data = {
    pawnShopId: shopId,
    title: "Sony PlayStation 5 Console",
    description:
      `${marker} Controlled development inventory for ` +
      "testing local price and quality comparisons.",
    price: definition.price,
    currency: "USD",
    images: [],
    category: "Gaming",
    condition: definition.condition,
    status: "AVAILABLE",
    isDeleted: false,

    // Keep repeated test runs inside the API freshness window.
    createdAt: new Date(),
  };

  if (existing) {
    return prisma.item.update({
      where: {
        id: existing.id,
      },
      data,
    });
  }

  return prisma.item.create({
    data,
  });
}

async function main() {
  assertDevelopmentSeedAllowed();
  const seedDatabaseUrl = validateSeedDatabaseUrl();

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: seedDatabaseUrl,
      },
    },
  });

  console.log(
    "===== Seed local price-comparison test inventory =====",
  );

  const owner = await upsertOwner();

  const shopDefinitions = [
    {
      key: "target-shop",
      name: "PawnLoop Comparison Downtown",
      address: "1000 Main Street",
      city: "Houston",
      state: "TX",
      zip: "77002",
      phone: "555-1101",
      description:
        "Development-only target shop for price comparison testing.",
      latitude: 29.7604,
      longitude: -95.3698,
    },
    {
      key: "west-shop",
      name: "PawnLoop Comparison Westside",
      address: "4500 Westheimer Road",
      city: "Houston",
      state: "TX",
      zip: "77027",
      phone: "555-1102",
      description:
        "Development-only comparison shop for price testing.",
      latitude: 29.7417,
      longitude: -95.4522,
    },
    {
      key: "midtown-shop",
      name: "PawnLoop Comparison Midtown",
      address: "2800 Main Street",
      city: "Houston",
      state: "TX",
      zip: "77002",
      phone: "555-1103",
      description:
        "Development-only comparison shop for quality testing.",
      latitude: 29.7429,
      longitude: -95.3772,
    },
    {
      key: "north-shop",
      name: "PawnLoop Comparison Northside",
      address: "7200 North Freeway",
      city: "Houston",
      state: "TX",
      zip: "77076",
      phone: "555-1104",
      description:
        "Development-only comparison shop for distance testing.",
      latitude: 29.865,
      longitude: -95.384,
    },
  ];

  const shops = new Map();

  for (const definition of shopDefinitions) {
    const { key, ...shopData } = definition;

    const shop = await upsertShop(
      owner.id,
      shopData,
    );

    shops.set(key, shop);

    console.log(
      `✅ Shop ready: ${shop.name} (${shop.id})`,
    );
  }

  const itemDefinitions = [
    {
      key: "target",
      shopKey: "target-shop",
      price: "399.00",
      condition: "Good",
    },
    {
      key: "west-fair",
      shopKey: "west-shop",
      price: "425.00",
      condition: "Fair",
    },
    {
      key: "midtown-excellent",
      shopKey: "midtown-shop",
      price: "449.00",
      condition: "Excellent",
    },
    {
      key: "north-like-new",
      shopKey: "north-shop",
      price: "475.00",
      condition: "Like New",
    },
    {
      key: "west-good",
      shopKey: "west-shop",
      price: "525.00",
      condition: "Good",
    },
  ];

  const seededItems = new Map();

  for (const definition of itemDefinitions) {
    const shop = shops.get(definition.shopKey);

    if (!shop) {
      throw new Error(
        `Missing seeded shop: ${definition.shopKey}`,
      );
    }

    const item = await upsertItem(
      definition,
      shop.id,
    );

    seededItems.set(definition.key, item);

    console.log(
      `✅ Item ready: ${definition.key} | ` +
      `$${Number(item.price).toFixed(2)} | ` +
      `${item.condition} | ${shop.name}`,
    );
  }

  const targetItem = seededItems.get("target");

  if (!targetItem) {
    throw new Error("Target comparison item was not created.");
  }

  console.log("");
  console.log(`TARGET_ITEM_ID=${targetItem.id}`);
  console.log(
    `API_PATH=/api/items/${targetItem.id}/price-comparison`,
  );
  console.log(
    `UI_PATH=/items/${targetItem.id}`,
  );
  console.log("");
  console.log(
    "Expected comparison sample: 4 items from 3 other shops.",
  );
}

main()
  .catch((error) => {
    console.error("❌ Comparison seed failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

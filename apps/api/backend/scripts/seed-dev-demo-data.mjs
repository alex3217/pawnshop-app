import "dotenv/config";
import bcrypt from "bcryptjs";
import { validatePassword } from "../src/services/passwordPolicy.service.js";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const now = new Date();
const addHours = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

function getModelMeta(modelName) {
  const models = Prisma?.dmmf?.datamodel?.models || [];
  return models.find((model) => model.name === modelName);
}

function getEnumValues(enumName) {
  const enums = Prisma?.dmmf?.datamodel?.enums || [];
  const found = enums.find((item) => item.name === enumName);
  return found ? found.values.map((value) => value.name) : [];
}

function chooseEnum(enumName, preferredValues = []) {
  const values = getEnumValues(enumName);
  for (const preferred of preferredValues) {
    if (values.includes(preferred)) return preferred;
  }
  return values[0] || preferredValues[0] || "ACTIVE";
}

function chooseAuctionStatus(index = 0) {
  const values = getEnumValues("AuctionStatus");

  const preferredLive = ["LIVE", "ACTIVE", "OPEN", "STARTED", "SCHEDULED", "PENDING"];
  const preferredFallback = ["PENDING", "SCHEDULED", "LIVE", "ACTIVE", "OPEN"];

  const preferred = index < 3 ? preferredLive : preferredFallback;

  for (const value of preferred) {
    if (values.includes(value)) return value;
  }

  return values[0] || "LIVE";
}

function hasField(modelName, fieldName) {
  return Boolean(getModelMeta(modelName)?.fields?.some((field) => field.name === fieldName));
}

function pickExisting(modelName, input) {
  const meta = getModelMeta(modelName);
  if (!meta) throw new Error(`Missing Prisma model metadata for ${modelName}.`);

  const allowed = new Set(meta.fields.map((field) => field.name));
  const output = {};

  for (const [key, value] of Object.entries(input)) {
    if (allowed.has(key) && value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}

function defaultScalar(field) {
  const lower = field.name.toLowerCase();

  if (field.isList) return [];

  if (field.type === "String") {
    if (lower === "email") return `seed-${Date.now()}@pawn.local`;
    if (lower.includes("email")) return `seed-${Date.now()}@pawn.local`;
    if (lower.includes("phone")) return "555-0100";
    if (lower.includes("currency")) return "USD";
    if (lower.includes("status")) return "ACTIVE";
    if (lower.includes("title")) return "Seed item";
    if (lower.includes("name")) return "Seed";
    if (lower.includes("address")) return "100 Main St";
    if (lower.includes("city")) return "Houston";
    if (lower.includes("state")) return "TX";
    if (lower.includes("zip")) return "77002";
    if (lower.includes("description")) return "Seeded development data.";
    return "seed";
  }

  if (field.type === "Boolean") return true;
  if (field.type === "Int") return lower.includes("price") || lower.includes("amount") ? 10000 : 0;
  if (field.type === "Float") return lower.includes("lat") ? 29.7604 : lower.includes("lng") || lower.includes("lon") ? -95.3698 : 0;
  if (field.type === "Decimal") return lower.includes("price") || lower.includes("amount") ? 100 : 0;
  if (field.type === "BigInt") return BigInt(0);
  if (field.type === "DateTime") return lower.includes("end") ? addHours(48) : now;
  if (field.type === "Json") return {};
  return null;
}

function buildData(modelName, overrides = {}) {
  const meta = getModelMeta(modelName);
  if (!meta) throw new Error(`Missing Prisma model metadata for ${modelName}.`);

  const data = pickExisting(modelName, overrides);

  for (const field of meta.fields) {
    if (data[field.name] !== undefined) continue;
    if (field.kind !== "scalar" && field.kind !== "enum") continue;
    if (field.name === "id") continue;
    if (field.hasDefaultValue) continue;
    if (!field.isRequired) continue;

    if (field.kind === "enum") {
      data[field.name] = chooseEnum(field.type, [
        "ACTIVE",
        "AVAILABLE",
        "LIVE",
        "PENDING",
        "SHOP_STAFF",
        "SHOP_MANAGER",
        "DRAFT",
      ]);
      continue;
    }

    const value = defaultScalar(field);
    if (value === null) {
      throw new Error(`No default for ${modelName}.${field.name} (${field.type})`);
    }

    data[field.name] = value;
  }

  return data;
}

async function upsertUser({ email, name, role, password }) {
  validatePassword(password, { email });
  const passwordHash = await bcrypt.hash(password, 10);

  const data = buildData("User", {
    email,
    name,
    role,
    isActive: true,
    password: passwordHash,
    passwordHash,
    hashedPassword: passwordHash,
  });

  const existing = await prisma.user.findFirst({ where: { email } });

  if (existing) {
    const updateData = hasField("User", "authVersion")
      ? { ...data, authVersion: { increment: 1 } }
      : data;
    return prisma.user.update({ where: { id: existing.id }, data: updateData });
  }

  return prisma.user.create({ data });
}

async function findOrCreate(modelName, where, input) {
  const delegateName = modelName[0].toLowerCase() + modelName.slice(1);
  const delegate = prisma[delegateName];

  if (!delegate) {
    console.log(`⚠️ Skipping ${modelName}; Prisma delegate not found.`);
    return null;
  }

  const existing = await delegate.findFirst({ where });

  if (existing) {
    return delegate.update({
      where: { id: existing.id },
      data: pickExisting(modelName, input),
    });
  }

  return delegate.create({
    data: buildData(modelName, input),
  });
}

async function main() {
  console.log("===== Seed PawnLoop dev demo data =====");

  const buyer = await upsertUser({
    email: "buyer@pawn.local",
    name: "Dev Buyer",
    role: "CONSUMER",
    password: "PawnLoop-Dev-Buyer-2026!",
  });

  const owner = await upsertUser({
    email: "owner1@pawn.local",
    name: "Dev Owner",
    role: "OWNER",
    password: "PawnLoop-Dev-Owner-2026!",
  });

  const admin = await upsertUser({
    email: "admin1@example.com",
    name: "Dev Admin",
    role: "ADMIN",
    password: "PawnLoop-Dev-Admin-2026!",
  });

  const superAdmin = await upsertUser({
    email: "superadmin1@example.com",
    name: "Dev Super Admin",
    role: "SUPER_ADMIN",
    password: "PawnLoop-Dev-SuperAdmin-2026!",
  });

  console.log("✅ Users ready:", {
    buyer: buyer.email,
    owner: owner.email,
    admin: admin.email,
    superAdmin: superAdmin.email,
  });
  console.log("✅ Demo user credentials configured.");

  const shops = [];

  for (const shopInput of [
    {
      name: "Downtown Pawn",
      address: "100 Main St",
      city: "Houston",
      state: "TX",
      zip: "77002",
      phone: "555-0101",
      description: "Downtown pawnshop with electronics, jewelry, tools, and auctions.",
      latitude: 29.7604,
      longitude: -95.3698,
      lat: 29.7604,
      lng: -95.3698,
      ownerId: owner.id,
      isDeleted: false,
      status: "ACTIVE",
      subscriptionPlan: "PRO",
      subscriptionStatus: "ACTIVE",
    },
    {
      name: "Westside Gold & Loan",
      address: "4500 Westheimer Rd",
      city: "Houston",
      state: "TX",
      zip: "77027",
      phone: "555-0102",
      description: "Jewelry, watches, handbags, and high-value collectibles.",
      latitude: 29.7417,
      longitude: -95.4522,
      lat: 29.7417,
      lng: -95.4522,
      ownerId: owner.id,
      isDeleted: false,
      status: "ACTIVE",
      subscriptionPlan: "PREMIUM",
      subscriptionStatus: "ACTIVE",
    },
    {
      name: "Northside Tools Pawn",
      address: "7200 North Fwy",
      city: "Houston",
      state: "TX",
      zip: "77076",
      phone: "555-0103",
      description: "Tools, lawn equipment, electronics, and daily deals.",
      latitude: 29.865,
      longitude: -95.384,
      lat: 29.865,
      lng: -95.384,
      ownerId: owner.id,
      isDeleted: false,
      status: "ACTIVE",
      subscriptionPlan: "BASIC",
      subscriptionStatus: "ACTIVE",
    },
  ]) {
    const shop = await findOrCreate("PawnShop", { name: shopInput.name }, shopInput);
    if (shop) shops.push(shop);
  }

  console.log(`✅ Shops ready: ${shops.length}`);

  const itemTemplates = [
    ["Sony PlayStation 5 Console Bundle", "Gaming", "Like New", 39900],
    ["14K Gold Cuban Link Chain", "Jewelry", "Good", 125000],
    ["Milwaukee M18 Drill Set", "Tools", "Good", 18000],
    ["Apple MacBook Pro 14-inch", "Electronics", "Good", 110000],
    ["Rolex Datejust Watch", "Watches", "Excellent", 520000],
    ["Canon EOS Camera Kit", "Cameras", "Good", 65000],
    ["Yamaha Keyboard", "Musical Instruments", "Fair", 22000],
    ["Diamond Stud Earrings", "Jewelry", "Excellent", 95000],
    ["DeWalt Combo Tool Kit", "Tools", "Good", 24000],
  ];

  const items = [];

  for (let index = 0; index < itemTemplates.length; index += 1) {
    const [title, category, condition, priceCents] = itemTemplates[index];
    const shop = shops[index % shops.length];

    const item = await findOrCreate(
      "Item",
      { title },
      {
        title,
        name: title,
        description: `${title} seeded for local marketplace browsing, watchlists, offers, and auctions.`,
        category,
        condition,
        price: priceCents,
        priceCents,
        amountCents: priceCents,
        currency: "USD",
        status: "AVAILABLE",
        images: [],
        pawnShopId: shop.id,
        shopId: shop.id,
        ownerId: owner.id,
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
      },
    );

    if (item) items.push(item);
  }

  console.log(`✅ Items ready: ${items.length}`);

  if (hasField("Staff", "shopId")) {
    for (const shop of shops) {
      try {
        await findOrCreate(
          "Staff",
          { shopId: shop.id, userId: owner.id },
          {
            shopId: shop.id,
            userId: owner.id,
            ownerId: owner.id,
            name: "Dev Owner",
            email: "owner1@pawn.local",
            phone: "555-0200",
            role: "SHOP_MANAGER",
            status: "ACTIVE",
            isActive: true,
          },
        );
      } catch (error) {
        console.log(`⚠️ Staff seed skipped for ${shop.name}: ${error.message}`);
      }
    }
  }

  const auctions = [];

  for (let index = 0; index < Math.min(5, items.length); index += 1) {
    const item = items[index];
    const shop = shops[index % shops.length];
    const startingPrice = Number(item.price || item.priceCents || 10000);

    try {
      const auction = await findOrCreate(
        "Auction",
        { itemId: item.id },
        {
          itemId: item.id,
          shopId: shop.id,
          pawnShopId: shop.id,
          ownerId: owner.id,
          sellerId: owner.id,
          title: item.title || item.name || `Auction ${index + 1}`,
          description: `Live seeded auction for ${item.title || item.name || "item"}.`,
          status: chooseAuctionStatus(index),
          startingPrice,
          currentPrice: startingPrice + 2500,
          reservePrice: startingPrice + 10000,
          bidIncrement: 500,
          minBidIncrement: 500,
          startsAt: addHours(-2),
          endsAt: addHours(24 + index * 8),
          extendedEndsAt: addHours(24 + index * 8),
          createdByUserId: owner.id,
          updatedByUserId: owner.id,
        },
      );

      if (auction) auctions.push(auction);
    } catch (error) {
      console.log(`⚠️ Auction seed skipped for ${item.title}: ${error.message}`);
    }
  }

  console.log(`✅ Auctions ready: ${auctions.length}`);

  for (const auction of auctions.slice(0, 3)) {
    try {
      await findOrCreate(
        "Bid",
        { auctionId: auction.id, userId: buyer.id },
        {
          auctionId: auction.id,
          userId: buyer.id,
          buyerId: buyer.id,
          bidderId: buyer.id,
          amount: Number(auction.currentPrice || auction.startingPrice || 10000),
          amountCents: Number(auction.currentPrice || auction.startingPrice || 10000),
          status: "ACTIVE",
        },
      );
    } catch (error) {
      console.log(`⚠️ Bid seed skipped for auction ${auction.id}: ${error.message}`);
    }
  }

  for (const auction of auctions.slice(0, 2)) {
    try {
      await findOrCreate(
        "Settlement",
        { auctionId: auction.id },
        {
          auctionId: auction.id,
          buyerId: buyer.id,
          winnerUserId: buyer.id,
          winnerId: buyer.id,
          userId: buyer.id,
          ownerId: owner.id,
          shopId: auction.shopId || auction.pawnShopId || shops[0]?.id,
          amount: Number(auction.currentPrice || auction.startingPrice || 10000),
          amountCents: Number(auction.currentPrice || auction.startingPrice || 10000),
          currency: "USD",
          status: "PENDING",
          paymentStatus: "PENDING",
        },
      );
    } catch (error) {
      console.log(`⚠️ Settlement seed skipped for auction ${auction.id}: ${error.message}`);
    }
  }

  const pricingRules = [
    {
      key: "buyer_service_fee",
      label: "Buyer service fee",
      description: "Default buyer service fee for marketplace checkout.",
      category: "SERVICE_FEE",
      appliesTo: "BUYER",
      feeType: "PERCENT",
      percentBps: 250,
      amountCents: null,
      currency: "USD",
      status: "ACTIVE",
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
    },
    {
      key: "seller_commission",
      label: "Seller commission",
      description: "Default seller commission for successful marketplace sales.",
      category: "COMMISSION",
      appliesTo: "SELLER",
      feeType: "PERCENT",
      percentBps: 800,
      amountCents: null,
      currency: "USD",
      status: "ACTIVE",
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
    },
    {
      key: "owner_pro_monthly",
      label: "Owner Pro Monthly",
      description: "Seeded owner subscription pricing rule.",
      category: "SUBSCRIPTION",
      appliesTo: "OWNER",
      feeType: "FIXED",
      amountCents: 4900,
      percentBps: null,
      currency: "USD",
      status: "ACTIVE",
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
    },
  ];

  for (const rule of pricingRules) {
    try {
      await findOrCreate("PlatformPricingRule", { key: rule.key }, rule);
    } catch (error) {
      console.log(`⚠️ Pricing rule skipped for ${rule.key}: ${error.message}`);
    }
  }

  const counts = {
    users: await prisma.user.count(),
    shops: await prisma.pawnShop.count(),
    items: await prisma.item.count(),
    auctions: await prisma.auction.count(),
    bids: await prisma.bid.count(),
    settlements: await prisma.settlement.count(),
    pricingRules: prisma.platformPricingRule ? await prisma.platformPricingRule.count() : 0,
  };

  console.log("✅ Demo seed complete:");
  console.table(counts);
}

main()
  .catch((error) => {
    console.error("❌ Seed dev demo data failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

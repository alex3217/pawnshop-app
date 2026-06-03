#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
SHOP_ID="${SHOP_ID:-}"
LIMIT="${LIMIT:-80}"
DRY_RUN="${DRY_RUN:-true}"

OWNER_EMAIL="$OWNER_EMAIL" \
SHOP_ID="$SHOP_ID" \
LIMIT="$LIMIT" \
DRY_RUN="$DRY_RUN" \
node --env-file=apps/api/backend/.env.development --input-type=module <<'NODE'
import { prisma } from "./apps/api/backend/src/lib/prisma.js";

const ownerEmail = process.env.OWNER_EMAIL || "owner1@pawn.local";
const explicitShopId = process.env.SHOP_ID || "";
const limit = Number(process.env.LIMIT || "80");
const dryRun = String(process.env.DRY_RUN || "true") !== "false";

const owner = explicitShopId
  ? null
  : await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true, email: true },
    });

if (!owner && !explicitShopId) {
  throw new Error(`Owner not found and SHOP_ID not provided: ${ownerEmail}`);
}

const shops = explicitShopId
  ? await prisma.pawnShop.findMany({
      where: { id: explicitShopId },
      select: { id: true, name: true },
    })
  : await prisma.pawnShop.findMany({
      where: { ownerId: owner.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

const shopIds = shops.map((shop) => shop.id);

const where = {
  pawnShopId: { in: shopIds },
  isDeleted: false,
  OR: [
    { title: { contains: "Auction E2E Test Item" } },
    { title: { contains: "Full Flow Test Item" } },
    { title: { contains: "Webhook Payment Test Item" } },
    { title: { contains: "Offer Payment Test Item" } },
    { title: { contains: "Live Auction Test Item" } },
    { title: { contains: "Progress Check Live Auction" } },
  ],
};

const candidates = await prisma.item.findMany({
  where,
  select: {
    id: true,
    title: true,
    status: true,
    pawnShopId: true,
    createdAt: true,
  },
  orderBy: { createdAt: "asc" },
  take: limit,
});

console.log(dryRun ? "DRY RUN — would soft-delete:" : "Soft-deleting:");
console.table(candidates);

if (!dryRun && candidates.length > 0) {
  const result = await prisma.item.updateMany({
    where: { id: { in: candidates.map((item) => item.id) } },
    data: { isDeleted: true },
  });
  console.log("Soft-deleted:", result.count);
}

const activeByShop = [];

for (const shop of shops) {
  const availableListings = await prisma.item.count({
    where: {
      pawnShopId: shop.id,
      isDeleted: false,
      status: "AVAILABLE",
    },
  });

  activeByShop.push({
    shop: shop.name,
    shopId: shop.id,
    availableListings,
  });
}

console.log("Available listings after check:");
console.table(activeByShop);

await prisma.$disconnect();
NODE

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

SHOP_ID="${SHOP_ID:-cmjhvejh80002xxnmyqrxhcaj}"
LIMIT="${LIMIT:-40}"
DRY_RUN="${DRY_RUN:-true}"

node --env-file=apps/api/backend/.env.development --input-type=module <<NODE
import { prisma } from "./apps/api/backend/src/lib/prisma.js";

const shopId = "${SHOP_ID}";
const limit = Number("${LIMIT}");
const dryRun = String("${DRY_RUN}") !== "false";

const where = {
  pawnShopId: shopId,
  isDeleted: false,
  OR: [
    { title: { contains: "Auction E2E Test Item" } },
    { title: { contains: "Full Flow Test Item" } },
    { title: { contains: "Webhook Payment Test Item" } },
    { title: { contains: "Live Auction Test Item" } },
    { title: { contains: "Progress Check Live Auction" } },
  ],
};

const candidates = await prisma.item.findMany({
  where,
  select: { id: true, title: true, status: true, createdAt: true },
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

const activeTotal = await prisma.item.count({
  where: { pawnShopId: shopId, isDeleted: false },
});

console.log("Active listings after check:", activeTotal);

await prisma.\$disconnect();
NODE

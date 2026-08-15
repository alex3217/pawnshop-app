import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";

const SECRET = "pawnloop-managed-public-media-gate-test-only-2026";
const DOMAIN = "@managed-public-media.integration.pawnloop.test";
let app;
let prisma;
let owner;
let outsider;
let shop;
let item;

const auth = (user) => `Bearer ${jwt.sign({ sub: user.id, role: user.role, authVersion: user.authVersion }, SECRET)}`;

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (!userIds.length) return;
  await prisma.marketplaceListing.deleteMany({ where: { sellerUserId: { in: userIds } } });
  await prisma.uploadAsset.deleteMany({ where: { uploaderId: { in: userIds } } });
  await prisma.item.deleteMany({ where: { shop: { ownerId: { in: userIds } } } });
  await prisma.pawnShop.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function listing(images, status = "DRAFT", overrides = {}) {
  return prisma.marketplaceListing.create({
    data: {
      sellerUserId: owner.id,
      sellerShopId: shop.id,
      itemId: item.id,
      listingType: "SHOP_TO_CUSTOMER",
      status,
      title: "Managed media listing",
      price: "125.00",
      images,
      publishedAt: status === "DRAFT" ? null : new Date(),
      ...overrides,
    },
  });
}

async function asset(url, overrides = {}) {
  return prisma.uploadAsset.create({
    data: {
      objectKey: `uploads/${crypto.randomUUID()}.jpg`,
      deliveryUrl: url,
      kind: "ITEM_IMAGE",
      status: "ATTACHED",
      uploaderId: owner.id,
      shopId: shop.id,
      itemId: item.id,
      attachedAt: new Date(),
      ...overrides,
    },
  });
}

async function publish(row, actor = owner) {
  return request(app).post(`/api/marketplace-listings/${row.id}/publish`).set("Authorization", auth(actor));
}

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", APP_ENV: "test", JWT_SECRET: SECRET, AUCTION_SCHEDULER_ENABLED: "false" });
  assert.equal(new URL(process.env.DATABASE_URL).pathname, "/pawnshop_test");
  const appModule = await import("../src/app.js");
  app = appModule.createApp();
  ({ prisma } = await import("../src/lib/prisma.js"));
  await cleanup();
});

beforeEach(async () => {
  await cleanup();
  owner = await prisma.user.create({ data: { name: "Media Owner", email: `owner-${crypto.randomUUID()}${DOMAIN}`, password: "test-only", role: "OWNER", isActive: true } });
  outsider = await prisma.user.create({ data: { name: "Other Owner", email: `outsider-${crypto.randomUUID()}${DOMAIN}`, password: "test-only", role: "OWNER", isActive: true } });
  await prisma.ownerApplication.createMany({ data: [owner, outsider].map((user) => ({ ownerId: user.id, status: "APPROVED", businessEmail: user.email })) });
  shop = await prisma.pawnShop.create({ data: { name: "Managed Media Shop", ownerId: owner.id } });
  item = await prisma.item.create({ data: { pawnShopId: shop.id, title: "Camera", price: "125.00", images: [] } });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("new publication rejects external and missing managed images with the stable API error", async () => {
  for (const images of [["https://example.test/photo.jpg"], []]) {
    const response = await publish(await listing(images));
    assert.equal(response.status, 422);
    assert.deepEqual(response.body, {
      success: false,
      error: "Publish this listing with attached, shop-owned inventory photos uploaded through PawnLoop.",
      code: "MANAGED_PUBLIC_MEDIA_REQUIRED",
    });
  }
});

test("valid attached managed image publishes and republish revalidates", async () => {
  const url = `https://media.pawnloop.test/uploads/${crypto.randomUUID()}.jpg`;
  await asset(url);
  const first = await listing([url]);
  assert.equal((await publish(first)).status, 200);
  await prisma.marketplaceListing.update({ where: { id: first.id }, data: { status: "PAUSED", images: ["https://example.test/replaced.jpg"] } });
  const response = await publish({ id: first.id });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, "MANAGED_PUBLIC_MEDIA_REQUIRED");
});

test("cross-shop asset and active external photo mutation are denied", async () => {
  const url = `https://media.pawnloop.test/uploads/${crypto.randomUUID()}.jpg`;
  const otherShop = await prisma.pawnShop.create({ data: { name: "Other Shop", ownerId: outsider.id } });
  await asset(url, { shopId: otherShop.id });
  assert.equal((await publish(await listing([url]))).status, 422);

  const active = await listing(["https://legacy.example.test/old.jpg"], "ACTIVE");
  const response = await request(app).patch(`/api/marketplace-listings/${active.id}`).set("Authorization", auth(owner)).send({ images: ["https://example.test/new.jpg"] });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, "MANAGED_PUBLIC_MEDIA_REQUIRED");
});

test("drafts remain usable and unchanged legacy active listings remain publicly readable", async () => {
  const draft = await request(app).post("/api/marketplace-listings").set("Authorization", auth(owner)).send({
    listingType: "SHOP_TO_CUSTOMER", sellerShopId: shop.id, itemId: item.id,
    title: "Draft external image", price: 50, images: ["https://legacy.example.test/draft.jpg"],
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.listing.status, "DRAFT");

  const legacy = await listing(["https://legacy.example.test/readable.jpg"], "ACTIVE");
  const response = await request(app).get(`/api/marketplace-listings/${legacy.id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.listing.images, ["https://legacy.example.test/readable.jpg"]);
});

test("publication authorization and tenant isolation are unchanged", async () => {
  const row = await listing(["https://example.test/photo.jpg"]);
  assert.equal((await publish(row, outsider)).status, 403);
  const stored = await prisma.marketplaceListing.findUnique({ where: { id: row.id } });
  assert.equal(stored.status, "DRAFT");
});

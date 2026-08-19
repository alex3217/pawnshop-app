import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import { validateIntegrationTestDatabase } from "./helpers/databaseSafety.fixture.js";

const TEST_DOMAIN = "@marketplace-listing-photos.integration.pawnloop.test";

let prisma;
let lockMarketplaceListingForPhotoUpdate;
let reconcileMarketplaceListingAssetUrls;
let password;

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: TEST_DOMAIN } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (!userIds.length) return;
  await prisma.uploadAsset.deleteMany({ where: { uploaderId: { in: userIds } } });
  await prisma.marketplaceListing.deleteMany({ where: { sellerUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function createBuyer(name) {
  return prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase().replaceAll(" ", "-")}${TEST_DOMAIN}`,
      password,
      role: "CONSUMER",
      isActive: true,
    },
  });
}

async function createListing(seller, title) {
  return prisma.marketplaceListing.create({
    data: {
      sellerUserId: seller.id,
      listingType: "CUSTOMER_TO_CUSTOMER",
      status: "DRAFT",
      title,
      price: 125,
      quantity: 1,
      images: [],
      pickupAvailable: true,
      shippingAvailable: false,
    },
  });
}

async function createAsset({ id, uploader, listing, url }) {
  return prisma.uploadAsset.create({
    data: {
      id,
      objectKey: `uploads/${id}.png`,
      deliveryUrl: url,
      kind: "MARKETPLACE_LISTING_IMAGE",
      uploaderId: uploader.id,
      marketplaceListingId: listing.id,
      status: "TEMPORARY",
      deleteAfter: new Date(Date.now() + 60_000),
    },
  });
}

async function attach({ listingId, actorId, nextUrls }) {
  return prisma.$transaction(async (tx) => {
    const listing = await lockMarketplaceListingForPhotoUpdate(tx, listingId);
    await reconcileMarketplaceListingAssetUrls({
      tx,
      listing,
      actorId,
      previousUrls: listing.images,
      nextUrls,
    });
    return tx.marketplaceListing.update({ where: { id: listingId }, data: { images: nextUrls } });
  }, { isolationLevel: "Serializable" });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: "marketplace-listing-photos-integration-secret-2026",
  });
  validateIntegrationTestDatabase();
  ({ prisma } = await import("../src/lib/prisma.js"));
  ({ lockMarketplaceListingForPhotoUpdate, reconcileMarketplaceListingAssetUrls } = await import("../src/services/uploadAssets.service.js"));
  password = await bcrypt.hash("MarketplaceListingPhotos123!", 4);
  await cleanup();
});

beforeEach(async () => {
  await cleanup();
});

after(async () => {
  if (!prisma) return;
  await cleanup();
  await prisma.$disconnect();
});

test("buyer draft photos attach in selected order and retry idempotently", async () => {
  const buyer = await createBuyer("Photo Buyer");
  const listing = await createListing(buyer, "Photo draft");
  const first = await createAsset({ id: "photo-asset-first", uploader: buyer, listing, url: "https://assets.integration.test/first.png" });
  const second = await createAsset({ id: "photo-asset-second", uploader: buyer, listing, url: "https://assets.integration.test/second.png" });
  const selectedOrder = [second.deliveryUrl, first.deliveryUrl];

  const attached = await attach({ listingId: listing.id, actorId: buyer.id, nextUrls: selectedOrder });
  assert.deepEqual(attached.images, selectedOrder);
  const assets = await prisma.uploadAsset.findMany({ where: { id: { in: [first.id, second.id] } }, orderBy: { id: "asc" } });
  assert.equal(assets.every((asset) => asset.status === "ATTACHED" && asset.attachedAt && asset.deleteAfter === null), true);

  const retried = await attach({ listingId: listing.id, actorId: buyer.id, nextUrls: selectedOrder });
  assert.deepEqual(retried.images, selectedOrder);
});

test("buyer assets cannot cross users, listings, or previously attached ownership", async () => {
  const buyer = await createBuyer("Owner Buyer");
  const other = await createBuyer("Other Buyer");
  const listing = await createListing(buyer, "Owned listing");
  const otherListing = await createListing(buyer, "Other listing");
  const crossUser = await createAsset({ id: "photo-cross-user", uploader: other, listing, url: "https://assets.integration.test/cross-user.png" });
  const crossListing = await createAsset({ id: "photo-cross-listing", uploader: buyer, listing: otherListing, url: "https://assets.integration.test/cross-listing.png" });

  await assert.rejects(attach({ listingId: listing.id, actorId: buyer.id, nextUrls: [crossUser.deliveryUrl] }), (error) => error.statusCode === 403);
  await assert.rejects(attach({ listingId: listing.id, actorId: buyer.id, nextUrls: [crossListing.deliveryUrl] }), (error) => error.statusCode === 403);

  const owned = await createAsset({ id: "photo-owned", uploader: buyer, listing, url: "https://assets.integration.test/owned.png" });
  await attach({ listingId: listing.id, actorId: buyer.id, nextUrls: [owned.deliveryUrl] });
  await assert.rejects(attach({ listingId: otherListing.id, actorId: buyer.id, nextUrls: [owned.deliveryUrl] }), (error) => error.statusCode === 403);
});

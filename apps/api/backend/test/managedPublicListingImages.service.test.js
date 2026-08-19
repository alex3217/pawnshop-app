import assert from "node:assert/strict";
import test from "node:test";

import {
  assertManagedPublicListingImages,
  MANAGED_PUBLIC_MEDIA_ERROR,
} from "../src/services/uploadAssets.service.js";

const url = "https://media.pawnloop.test/uploads/listing.jpg";
const listing = {
  listingType: "SHOP_TO_CUSTOMER",
  sellerShopId: "shop-1",
  itemId: "item-1",
  images: [url],
};
const attached = {
  deliveryUrl: url,
  kind: "ITEM_IMAGE",
  status: "ATTACHED",
  shopId: "shop-1",
  itemId: "item-1",
  attachedAt: new Date(),
  deleteAfter: null,
  deletedAt: null,
  objectKey: "uploads/listing.jpg",
};

function client(rows) {
  return { uploadAsset: { findMany: async () => rows } };
}

async function rejectsManaged(input, rows = []) {
  await assert.rejects(
    assertManagedPublicListingImages({
      listing: { ...listing, ...input },
      prismaClient: client(rows),
    }),
    (error) => {
      assert.equal(error.statusCode, MANAGED_PUBLIC_MEDIA_ERROR.statusCode);
      assert.equal(error.publicCode, MANAGED_PUBLIC_MEDIA_ERROR.code);
      assert.equal(error.message, MANAGED_PUBLIC_MEDIA_ERROR.message);
      return true;
    },
  );
}

test("new publication rejects arbitrary external URLs and missing managed assets with a stable contract", async () => {
  await rejectsManaged({ images: ["https://example.test/photo.jpg"] });
  await rejectsManaged({ images: [] });
});

test("attached shop-owned managed item images are accepted", async () => {
  await assert.doesNotReject(assertManagedPublicListingImages({ listing, prismaClient: client([attached]) }));
});

test("cross-shop and wrong-lifecycle assets are rejected", async () => {
  await rejectsManaged({}, [{ ...attached, shopId: "shop-2" }]);
  await rejectsManaged({}, [{ ...attached, itemId: "item-2" }]);
  await rejectsManaged({ itemId: null }, [attached]);
});

test("deleted, temporary, incomplete, and cleanup-pending assets are rejected", async () => {
  await rejectsManaged({}, [{ ...attached, status: "DELETED", deletedAt: new Date() }]);
  await rejectsManaged({}, [{ ...attached, status: "TEMPORARY", attachedAt: null, deleteAfter: new Date() }]);
  await rejectsManaged({}, [{ ...attached, attachedAt: null }]);
  await rejectsManaged({}, [{ ...attached, status: "DELETE_PENDING", deleteAfter: new Date() }]);
});

test("expired attachment metadata and wrong asset kinds are rejected", async () => {
  await rejectsManaged({}, [{ ...attached, deleteAfter: new Date() }]);
  await rejectsManaged({}, [{ ...attached, kind: "SHOP_LOGO" }]);
});

test("every URL in a public photo collection must be the matching managed asset", async () => {
  await rejectsManaged(
    { images: [url, "https://example.test/legacy.jpg"] },
    [attached],
  );
});

test("draft and non-customer-visible listing types remain usable without managed assets", async () => {
  await assert.doesNotReject(assertManagedPublicListingImages({
    listing: { ...listing, listingType: "SHOP_TO_SHOP" },
    prismaClient: client([]),
  }));
  // The service is intentionally called only at publish or active-photo mutation boundaries.
  assert.equal(listing.images[0], url);
});

test("customer listings accept only attached assets owned by the seller and listing", async () => {
  const customerListing = { id: "customer-listing", listingType: "CUSTOMER_TO_CUSTOMER", sellerUserId: "buyer-1", sellerShopId: null, itemId: null, images: [url] };
  const customerAsset = { ...attached, uploaderId: "buyer-1", marketplaceListingId: "customer-listing", shopId: null, itemId: null, kind: "MARKETPLACE_LISTING_IMAGE" };
  await assert.doesNotReject(assertManagedPublicListingImages({ listing: customerListing, prismaClient: client([customerAsset]) }));
  await assert.rejects(assertManagedPublicListingImages({ listing: customerListing, prismaClient: client([{ ...customerAsset, uploaderId: "buyer-2" }]) }), (error) => error.publicCode === MANAGED_PUBLIC_MEDIA_ERROR.code);
  await assert.rejects(assertManagedPublicListingImages({ listing: customerListing, prismaClient: client([{ ...customerAsset, marketplaceListingId: "other-listing" }]) }), (error) => error.publicCode === MANAGED_PUBLIC_MEDIA_ERROR.code);
  await assert.rejects(assertManagedPublicListingImages({ listing: { ...customerListing, images: ["https://external.invalid/photo.jpg"] }, prismaClient: client([]) }), (error) => error.publicCode === MANAGED_PUBLIC_MEDIA_ERROR.code);
});

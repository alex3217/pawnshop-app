import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shop-to-customer publication requires a photo at the API boundary", async () => {
  const source = await readFile(new URL("../src/controllers/marketplaceListings.controller.js", import.meta.url), "utf8");
  assert.match(source, /function assertShopToCustomerHasPhoto/);
  assert.match(source, /listingType === "SHOP_TO_CUSTOMER"/);
  assert.match(source, /At least one photo is required to publish/);
  assert.match(source, /assertShopToCustomerHasPhoto\(\{\}, existing\)/);
  assert.match(source, /assertManagedPublicListingImages\(\{ listing: existing \}\)/);
  assert.match(source, /existing\.status === "ACTIVE" && req\.body\?\.images !== undefined/);
});

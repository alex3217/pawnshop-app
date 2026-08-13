import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const itemDetail = await readFile(new URL("../src/pages/ItemDetailPage.tsx", import.meta.url), "utf8");
const shopMap = await readFile(new URL("../src/components/ShopMap.tsx", import.meta.url), "utf8");
const itemCss = await readFile(new URL("../src/styles/item-detail-v2.css", import.meta.url), "utf8");
const marketplaceCss = await readFile(new URL("../src/styles/marketplace-v2.css", import.meta.url), "utf8");
const deployment = await readFile(new URL("../../../DEPLOYMENT.md", import.meta.url), "utf8");
const config = await readFile(new URL("../src/config.ts", import.meta.url), "utf8");

test("buyer actions retain real labels and visible interaction states", () => {
  for (const label of ["Watch item", "View shop", "Use my location", "Make offer", "Open storefront", "Directions", "Browse shops"]) assert.match(itemDetail, new RegExp(label));
  assert.doesNotMatch(itemDetail, /data-label=/);
  for (const state of [":hover", ":active", ":focus-visible", ":disabled", ":visited"]) assert.match(`${itemCss}\n${marketplaceCss}`, new RegExp(state.replace(":", "\\:")));
  assert.match(marketplaceCss, /width: auto !important/);
  assert.match(marketplaceCss, /white-space: nowrap !important/);
});

test("shop map uses only the browser key, reports sanitized failures, and updates coordinates", () => {
  assert.match(shopMap, /GOOGLE_MAPS_BROWSER_API_KEY/);
  assert.match(config, /VITE_GOOGLE_MAPS_BROWSER_API_KEY/);
  assert.doesNotMatch(shopMap, /GOOGLE_GEOCODING_API_KEY/);
  assert.match(shopMap, /mapRef\.current\.setCenter\(position\)/);
  assert.match(shopMap, /markerRef\.current\.setPosition\(position\)/);
  assert.match(shopMap, /markerRef\.current\.setLabel/);
  assert.match(shopMap, /gm_authFailure/);
  assert.match(shopMap, /API key, website referrer, or Maps JavaScript API settings/);
  assert.match(shopMap, /script\.remove\(\)/);
  assert.match(shopMap, /addListener\("click"/);
  assert.match(shopMap, /point\.latitude, point\.longitude, shopName/);
  assert.match(shopMap, /Shop map unavailable/);
  assert.match(shopMap, /item-detail-map-fallback-marker/);
  for (const label of ["View shop", "Directions", "Message shop", "Business hours", "Distance", "Phone", "Address"]) assert.match(shopMap, new RegExp(label));
  assert.match(shopMap, /directionsUrl\(point, address\)/);
});

test("location flow covers success, denial, timeout, unavailable, and retry without persistence", () => {
  assert.match(itemDetail, /navigator\.geolocation\.getCurrentPosition/);
  for (const state of ["enabled", "denied", "unavailable", "timed-out", "Retry location"]) assert.match(itemDetail, new RegExp(state));
  assert.doesNotMatch(itemDetail, /localStorage.*latitude|sessionStorage.*latitude/);
  assert.match(itemDetail, /Shop coordinates unavailable/);
  assert.match(itemDetail, /itemShopDistanceLabel/);
});

test("deployment and actual fulfillment limits are explicit", () => {
  for (const referrer of ["https://staging.pawnloop-frontend.pages.dev/*", "https://pawnloop-staging-web-alex3217.onrender.com/*", "https://pawnshop-staging-web.onrender.com/*"]) assert.ok(deployment.includes(referrer));
  assert.match(deployment, /POST \/offers/);
  assert.match(itemDetail, /Confirm pickup with the shop/);
});

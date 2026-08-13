import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/OwnerLocationsPage.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/components/SiteLayout.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("owner navigation and locations page identify the public profile workspace", () => {
  assert.match(layout, /Shop Profile & Locations/);
  assert.match(page, /Shop Profile &amp; Locations/);
  assert.match(page, /Manage your public shop details, address, map verification/);
  assert.match(app, /path="\/owner\/locations"/);
});

test("shop cards retain distinct, accessible multi-location actions", () => {
  assert.match(page, /Edit shop profile for \$\{location\.name\}/);
  for (const label of ["Edit shop profile", "Update map location", "View public profile", "View inventory", "View staff"]) assert.match(page, new RegExp(label));
  assert.match(page, /owner\/inventory\?shopId=/);
  assert.match(page, /owner\/staff\?shopId=/);
  assert.match(page, /shops\/\$\{encodeURIComponent\(location\.id\)\}/);
});

test("profile form labels public fields, warns on address changes, and manages focus", () => {
  for (const label of ["Edit Shop Profile", "Shop name", "Public description", "Street address", "Address line 2", "City", "State / region", "ZIP / postal code", "Country code", "Public phone number", "Business hours"]) assert.match(page, new RegExp(label.replace("/", "\\/")));
  assert.match(page, /publicly visible/);
  assert.match(page, /preserve the current verified coordinates/);
  assert.match(page, /editHeadingRef\.current\?\.focus/);
  assert.doesNotMatch(page, /GOOGLE_GEOCODING_API_KEY/);
});

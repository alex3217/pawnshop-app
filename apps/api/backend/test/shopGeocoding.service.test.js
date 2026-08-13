import assert from "node:assert/strict";
import test from "node:test";
import {
  ShopGeocodingError,
  coordinatesAreValid,
  createShopGeocoder,
  normalizeShopAddress,
} from "../src/services/shopGeocoding.service.js";
import { backfillShopCoordinates } from "../src/services/shopCoordinateBackfill.service.js";
import { geocodeWriteData } from "../src/controllers/shops.controller.js";

const address = { address: " 123  Main St ", city: " Chicago ", state: "il", zip: "60601", country: "us" };

test("normalizes an address and accepts boundary coordinates", () => {
  assert.deepEqual(normalizeShopAddress(address), { address: "123 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" });
  assert.equal(coordinatesAreValid(-90, -180), true);
  assert.equal(coordinatesAreValid(90, 180), true);
  assert.equal(coordinatesAreValid(90.01, 0), false);
  assert.equal(coordinatesAreValid(0, -180.01), false);
  assert.equal(coordinatesAreValid(0, 0), false);
});

test("geocoder returns normalized address and valid coordinates", async () => {
  const geocoder = createShopGeocoder({
    env: { GEOCODING_PROVIDER: "google", GOOGLE_GEOCODING_API_KEY: "test-only", GEOCODING_TIMEOUT_MS: "1000" },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: "OK", results: [{ geometry: { location: { lat: 41.88, lng: -87.63 } } }] }) }),
  });
  assert.deepEqual(await geocoder.geocode(address), {
    address: normalizeShopAddress(address), latitude: 41.88, longitude: -87.63,
  });
});

test("address update preserves verified coordinates and requires explicit re-verification", async () => {
  let geocodeCalls = 0;
  const req = { app: { locals: { shopGeocoder: { geocode: async (value) => { geocodeCalls += 1; return { address: value, latitude: 41.88, longitude: -87.63 }; } } } } };
  const previous = { id: "shop-1", address: "1 Old St", city: "Chicago", state: "IL", zip: "60602", country: "US", latitude: 41, longitude: -87 };
  const write = await geocodeWriteData(req, address, previous);
  assert.deepEqual(write, { ...normalizeShopAddress(address), mapVerificationRequired: true });
  assert.equal(geocodeCalls, 0);
  assert.equal(previous.latitude, 41);
  assert.equal(previous.longitude, -87);
});

test("new shop creation still uses configured server-side geocoding", async () => {
  const req = { app: { locals: { shopGeocoder: { geocode: async (value) => ({ address: value, latitude: 41.88, longitude: -87.63 }) } } } };
  const write = await geocodeWriteData(req, address);
  assert.deepEqual(write, { ...normalizeShopAddress(address), latitude: 41.88, longitude: -87.63, mapVerificationRequired: false });
});

test("geocoder deterministically rejects invalid provider coordinates", async () => {
  const geocoder = createShopGeocoder({
    env: { GEOCODING_PROVIDER: "google", GOOGLE_GEOCODING_API_KEY: "test-only" },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: "OK", results: [{ geometry: { location: { lat: 91, lng: 0 } } }] }) }),
  });
  await assert.rejects(() => geocoder.geocode(address), (error) => error instanceof ShopGeocodingError && error.code === "INVALID_COORDINATES" && error.statusCode === 502);
});

test("geocoding failure is actionable and does not mutate existing coordinates", async () => {
  const existing = { latitude: 41, longitude: -87 };
  const geocoder = createShopGeocoder({
    env: { GEOCODING_PROVIDER: "google", GOOGLE_GEOCODING_API_KEY: "test-only" },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: "ZERO_RESULTS", results: [] }) }),
  });
  await assert.rejects(() => geocoder.geocode(address), (error) => error.code === "ADDRESS_NOT_FOUND" && /could not locate/i.test(error.message));
  assert.deepEqual(existing, { latitude: 41, longitude: -87 });
});

test("backfill is dry-run safe and idempotent after an update", async () => {
  const row = { id: "shop-1", ...normalizeShopAddress(address), latitude: null, longitude: null, isDeleted: false };
  let updateCalls = 0;
  const prisma = { pawnShop: {
    findMany: async () => row.latitude === null || row.longitude === null ? [row] : [],
    update: async ({ data }) => { updateCalls += 1; Object.assign(row, data); return { id: row.id }; },
  } };
  const geocoder = { geocode: async (value) => ({ address: value, latitude: 41.88, longitude: -87.63 }) };
  const dryRun = await backfillShopCoordinates({ prisma, geocoder, dryRun: true });
  assert.equal(dryRun.skipped[0].reason, "DRY_RUN_ELIGIBLE");
  assert.equal(updateCalls, 0);
  const first = await backfillShopCoordinates({ prisma, geocoder, dryRun: false });
  assert.equal(first.updated.length, 1);
  const second = await backfillShopCoordinates({ prisma, geocoder, dryRun: false });
  assert.equal(second.updated.length, 0);
  assert.equal(updateCalls, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDealScore,
  calculateItemPriceComparison,
  haversineMiles,
  normalizeItemTitle,
  SCORE_RULE_VERSION,
  titlesAreComparable,
} from "../src/services/itemPriceComparison.service.js";

const NOW = new Date("2026-07-24T12:00:00Z");

function item(overrides = {}) {
  return {
    id: "candidate-1",
    shopId: "shop-2",
    title: "Sony PlayStation 5 Console",
    description: "",
    category: "VIDEO_GAMES",
    currency: "USD",
    price: 500,
    status: "AVAILABLE",
    deletedAt: null,
    latitude: 41,
    longitude: -87,
    listedAt: "2026-07-20T12:00:00Z",
    ...overrides,
  };
}

const target = item({
  id: "target-1",
  shopId: "shop-1",
  title: "Sony PS5 Console",
  price: 400,
});

function comparison(candidates, overrides = {}) {
  return calculateItemPriceComparison({
    target,
    candidates,
    radiusMiles: 100,
    freshnessDays: 30,
    perShopCap: 3,
    now: NOW,
    ...overrides,
  });
}

test("normalizes titles deterministically and applies conservative aliases", () => {
  assert.equal(
    normalizeItemTitle("  SONY—PlayStation 5® / Console! "),
    "sony ps5 console",
  );
  assert.equal(normalizeItemTitle("Play Station 5"), "ps5");
  assert.equal(normalizeItemTitle("PlayStation 4"), "ps4");
});

test("preserves model signals and rejects model conflicts", () => {
  assert.equal(normalizeItemTitle("Canon EOS R5"), "canon eos r5");
  assert.equal(titlesAreComparable("Canon EOS R5", "Canon EOS R6 Camera"), false);
});

test("rejects accessory conflicts and never uses descriptions to qualify", () => {
  assert.equal(
    titlesAreComparable("Sony PS5 Console", "Sony PS5 Controller"),
    false,
  );
  const result = comparison([
    item({
      title: "Unrelated Lamp",
      description: "Sony PS5 Console",
    }),
  ]);
  assert.equal(result.sampleCount, 0);
});

test("rejects variants and capacity conflicts", () => {
  assert.equal(
    titlesAreComparable("PS5 Digital Console", "PS5 Disc Console"),
    false,
  );
  assert.equal(
    titlesAreComparable("iPhone 15 128GB", "iPhone 15 256 GB"),
    false,
  );
});

test("rejects category and currency mismatches", () => {
  const result = comparison([
    item({ id: "category", category: "ELECTRONICS" }),
    item({ id: "currency", currency: "CAD" }),
  ]);
  assert.equal(result.sampleCount, 0);
  assert.equal(result.score, null);
});

test("requires available, non-deleted inventory", () => {
  const result = comparison([
    item({ id: "sold", status: "SOLD" }),
    item({ id: "pending", status: "PENDING" }),
    item({ id: "deleted", deletedAt: NOW }),
    item({ id: "unavailable", available: false }),
  ]);
  assert.equal(result.sampleCount, 0);
});

test("excludes the target and inventory from the target shop", () => {
  const result = comparison([
    item({ id: target.id }),
    item({ id: "same-shop", shopId: target.shopId }),
  ]);
  assert.equal(result.sampleCount, 0);
});

test("rejects invalid coordinates", () => {
  assert.equal(
    haversineMiles(
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ),
    null,
  );
  assert.equal(
    comparison([item({ latitude: -91 })]).sampleCount,
    0,
  );
  assert.equal(
    comparison([item()], {
      target: item({ latitude: Number.NaN }),
    }).sampleCount,
    0,
  );
});

test("includes a comparable exactly on the radius boundary", () => {
  const candidate = item({ latitude: 41.1 });
  const radiusMiles = haversineMiles(target, candidate);
  const result = comparison([candidate], { radiusMiles });
  assert.equal(result.sampleCount, 1);
});

test("filters stale inventory while including the freshness boundary", () => {
  const result = comparison([
    item({ id: "boundary", listedAt: "2026-06-24T12:00:00Z" }),
    item({ id: "stale", listedAt: "2026-06-24T11:59:59Z" }),
  ]);
  assert.deepEqual(result.comparables.map(({ id }) => id), ["boundary"]);
});

test("applies per-shop caps after stable ordering", () => {
  const result = comparison([
    item({ id: "b", price: 450 }),
    item({ id: "a", price: 450 }),
    item({ id: "c", price: 600 }),
    item({ id: "other", shopId: "shop-3", price: 550 }),
  ], { perShopCap: 2 });

  assert.deepEqual(
    result.comparables.map(({ id }) => id),
    ["a", "b", "other"],
  );
});

test("calculates odd and even medians, averages, and price extrema", () => {
  const odd = comparison([
    item({ id: "1", price: 300 }),
    item({ id: "2", shopId: "shop-3", price: 500 }),
    item({ id: "3", shopId: "shop-4", price: 700 }),
  ]);
  assert.deepEqual(odd.statistics, {
    low: 300,
    median: 500,
    average: 500,
    high: 700,
  });

  const even = comparison([
    item({ id: "1", price: 100 }),
    item({ id: "2", price: 200 }),
    item({ id: "3", shopId: "shop-3", price: 300 }),
    item({ id: "4", shopId: "shop-3", price: 600 }),
  ]);
  assert.equal(even.statistics.median, 250);
  assert.equal(even.statistics.average, 300);
});

test("uses median benchmark and the versioned score rule", () => {
  const result = comparison([
    item({ id: "1", price: 400 }),
    item({ id: "2", shopId: "shop-3", price: 500 }),
    item({ id: "3", shopId: "shop-4", price: 600 }),
  ]);
  assert.equal(result.benchmark, 500);
  assert.equal(result.score, 90);
  assert.equal(result.dealScore, 90);
  assert.equal(result.scoreRuleVersion, SCORE_RULE_VERSION);
  assert.ok(result.confidence > 0);
});

test("rounds score boundaries and clamps scores", () => {
  assert.equal(calculateDealScore(500, 500), 50);
  assert.equal(calculateDealScore(498.75, 500), 51);
  assert.equal(calculateDealScore(0.01, 500), 100);
  assert.equal(calculateDealScore(1000, 500), 0);
});

test("returns null scores for zero prices and invalid benchmarks", () => {
  assert.equal(calculateDealScore(0, 500), null);
  assert.equal(calculateDealScore(100, 0), null);
  assert.equal(
    comparison([item()], { target: { ...target, price: 0 } }).score,
    null,
  );
});

test("requires three comparables from two other shops for a score", () => {
  const twoSamples = comparison([
    item({ id: "1" }),
    item({ id: "2", shopId: "shop-3" }),
  ]);
  assert.equal(twoSamples.sampleCount, 2);
  assert.equal(twoSamples.score, null);

  const oneShop = comparison([
    item({ id: "1" }),
    item({ id: "2" }),
    item({ id: "3" }),
  ]);
  assert.equal(oneShop.sampleCount, 3);
  assert.equal(oneShop.shopCount, 1);
  assert.equal(oneShop.score, null);
});

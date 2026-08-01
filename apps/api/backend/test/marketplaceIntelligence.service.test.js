import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePlatformHealth, confidenceForSample, dateWindow, demandScore, distinctCompletedSales,
  meanCents, medianCents, normalizeCategory, normalizeComparable, normalizeRegion, percentChange,
  pricePositionLabel,
} from "../src/services/marketplaceIntelligenceMath.js";
import { isPublicActive, matchComparable, publicListing, saleSummary } from "../src/services/marketplaceIntelligence.service.js";

test("mean and median retain integer-cent precision", () => {
  assert.equal(meanCents([101, 102]), 102);
  assert.equal(medianCents([199, 101, 150]), 150);
  assert.equal(medianCents([101, 102]), 102);
  assert.equal(meanCents([]), null);
});

test("percent change and deterministic normalization", () => {
  assert.equal(percentChange(1000, 1250), 25);
  assert.equal(percentChange(0, 1250), null);
  assert.equal(normalizeCategory("  Musical   Instruments "), "MUSICAL INSTRUMENTS");
  assert.equal(normalizeRegion(" tx "), "TX");
  assert.equal(normalizeRegion("Texas"), "UNAVAILABLE");
  assert.deepEqual(normalizeComparable({ id: "a", title: "Thing", category: "Tools", price: "10.01", state: "TX" }).priceCents, 1001);
});

test("sample thresholds and confidence levels follow the documented thresholds", () => {
  assert.deepEqual([0, 2, 3, 9, 10, 29, 30].map((size) => confidenceForSample(size).level), ["INSUFFICIENT", "INSUFFICIENT", "LOW", "LOW", "MODERATE", "MODERATE", "HIGHER"]);
});

test("price-position labels use completed comparable cents", () => {
  assert.equal(pricePositionLabel(900, [1000, 1100]), "INSUFFICIENT_COMPARABLE_DATA");
  assert.equal(pricePositionLabel(900, [1000, 1100, 1200]), "BELOW_COMPARABLE_RANGE");
  assert.equal(pricePositionLabel(1110, [1000, 1100, 1200]), "NEAR_COMPARABLE_AVERAGE");
  assert.equal(pricePositionLabel(1300, [1000, 1100, 1200]), "ABOVE_COMPARABLE_RANGE");
});

test("demand scoring is deterministic and evidence based", () => {
  assert.deepEqual(demandScore({}), { score: 0, label: "INSUFFICIENT_DATA", evidenceCount: 0 });
  assert.equal(demandScore({ offers: 20, completedSales: 10, activeSupply: 2 }).label, "HIGH");
  assert.equal(demandScore({ watchlists: 1, activeSupply: 20 }).label, "LOW");
});

test("comparable filtering excludes inactive and mismatched listings", () => {
  const active = { id: "listing-2", itemId: "item-2", title: "Sony PlayStation 5 Disc", category: "Electronics", price: "450.00", seller: { isActive: true }, sellerShop: { isDeleted: false }, item: { isDeleted: false, status: "AVAILABLE" } };
  assert.equal(isPublicActive(active), true);
  assert.equal(isPublicActive({ ...active, item: { isDeleted: true, status: "AVAILABLE" } }), false);
  assert.equal(matchComparable({ id: "item-1", title: "PlayStation 5 Disc", category: "Electronics" }, active), true);
  assert.equal(matchComparable({ id: "item-1", title: "PlayStation 5 Disc", category: "Tools" }, active), false);
});

test("public projection contains no seller or buyer identity fields", () => {
  const projected = publicListing({ id: "l", itemId: "i", title: "Item", category: "Tools", condition: "Good", price: "10.00", currency: "USD", images: [], listingType: "SHOP_TO_CUSTOMER", createdAt: new Date("2026-01-01"), sellerUserId: "private", seller: { email: "private@example.com" }, sellerShop: { id: "s", name: "Shop", slug: "shop", city: "Austin", state: "TX" } });
  assert.equal(JSON.stringify(projected).includes("private"), false);
  assert.deepEqual(Object.keys(projected.shop), ["id", "name", "slug", "city", "state"]);
});

test("completed-sale source deduplicates transaction ids and ignores non-completed rows", () => {
  const rows = [{ id: "t1", listingId: "l1", status: "COMPLETED", subtotal: "10.01", completedAt: new Date("2026-01-02") }, { id: "t1", listingId: "l1", status: "COMPLETED", subtotal: "10.01", completedAt: new Date("2026-01-02") }, { id: "t2", listingId: "l1", status: "PAID", subtotal: "99.00" }, { id: "t3", listingId: "other", status: "COMPLETED", subtotal: "30.00" }];
  assert.equal(distinctCompletedSales(rows).length, 2);
  const summary = saleSummary(rows, ["l1"]);
  assert.equal(summary.sampleSize, 1);
  assert.equal(summary.averageSalePriceCents, 1001);
  assert.equal(summary.available, false);
});

test("date windows are bounded and stable", () => {
  const result = dateWindow(new Date("2026-08-01T00:00:00Z"), 90);
  assert.equal(result.days, 90);
  assert.equal(result.from.toISOString(), "2026-05-03T00:00:00.000Z");
});

test("Platform Health is versioned, bounded, and components total 100", () => {
  const result = calculatePlatformHealth({ activeListings: 50, activeShops: 10, totalShops: 10, demandSignals: 50, completedSales: 10, activeBuyers: 100, engagedBuyers: 25, shopsWithMarketing: 10, paidOrLaterTransactions: 10, usableSubscriptions: 10, completeActiveListings: 50 });
  assert.equal(result.maximum, 100); assert.equal(result.score, 100); assert.equal(result.version, "platform-health-v1.0");
  assert.equal(result.components.reduce((sum, row) => sum + row.maximum, 0), 100);
  assert.match(result.dataLimitations.join(" "), /does not predict/i);
});

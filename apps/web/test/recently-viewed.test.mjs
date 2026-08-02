import assert from "node:assert/strict";
import test from "node:test";
import { clearRecentlyViewed, normalizeRecentlyViewedItem, readRecentlyViewed, recordRecentlyViewed, RECENTLY_VIEWED_KEY } from "../src/services/recentlyViewed.mjs";

function storage(initial = {}) { const values = new Map(Object.entries(initial)); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }; }
const item = (id, viewedAt = new Date(2026, 0, Number(id) || 1).toISOString()) => ({ itemId: String(id), title: `Item ${id}`, imageUrl: "https://images.test/item.jpg", priceLabel: "$10", shopName: "Safe Shop", href: `/items/${id}`, viewedAt });

test("normalizes only safe recently-viewed fields", () => assert.deepEqual(normalizeRecentlyViewedItem({ ...item(1), token: "secret", transactionId: "private" }), item(1)));
test("malformed storage returns an empty list", () => assert.deepEqual(readRecentlyViewed(storage({ [RECENTLY_VIEWED_KEY]: "not-json" })), []));
test("recording deduplicates and moves an item to the front", () => { const target = storage(); recordRecentlyViewed(item(1), target); recordRecentlyViewed(item(2), target); const rows = recordRecentlyViewed(item(1, new Date(2026, 2, 1).toISOString()), target); assert.deepEqual(rows.map((row) => row.itemId), ["1", "2"]); });
test("recording keeps only the twelve most recent items", () => { const target = storage(); for (let index = 1; index <= 15; index += 1) recordRecentlyViewed(item(index), target); assert.equal(readRecentlyViewed(target).length, 12); });
test("clear removes browser-local history", () => { const target = storage(); recordRecentlyViewed(item(1), target); clearRecentlyViewed(target); assert.deepEqual(readRecentlyViewed(target), []); });

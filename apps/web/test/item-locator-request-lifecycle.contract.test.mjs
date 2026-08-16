import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/pages/BuyerItemLocatorPage.tsx", import.meta.url),
  "utf8",
);

test("Item Locator owns an abortable, monotonically generated search lifecycle", () => {
  assert.match(page, /searchGenerationRef = useRef/);
  assert.match(page, /activeSearchControllerRef = useRef<AbortController \| null>/);
  assert.match(page, /activeSearchControllerRef\.current\?\.abort\(\)/);
  assert.match(page, /requestGeneration === searchGenerationRef\.current/);
  assert.match(page, /mountedRef\.current/);
  assert.match(page, /getMarketplaceItemsPaged\([\s\S]*controller\.signal/);
});

test("Clear invalidates and aborts before resetting every visible search state", () => {
  const clearBody = page.match(/function clearSearch\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const invalidation = clearBody.indexOf("searchGenerationRef.current += 1");
  const abort = clearBody.indexOf("activeSearchControllerRef.current?.abort()");
  const visibleReset = clearBody.indexOf('setQuery("")');

  assert.ok(invalidation >= 0 && invalidation < visibleReset);
  assert.ok(abort >= 0 && abort < visibleReset);
  for (const reset of [
    'setQuery("")',
    'setAppliedQuery("")',
    'setLastSearchedQuery("")',
    "setHasSearched(false)",
    "setSearchAttempt(0)",
    "setItems([])",
    "setTotalItems(0)",
    "setSelectedItemId(null)",
    "setError(null)",
    "setNotice(null)",
    'setSearchState("idle")',
  ]) assert.ok(clearBody.includes(reset), `${reset} must be reset by Clear`);
});

test("unmount invalidates the generation and aborts the active transport", () => {
  assert.match(
    page,
    /return \(\) => \{[\s\S]*mountedRef\.current = false;[\s\S]*searchGenerationRef\.current \+= 1;[\s\S]*activeSearchControllerRef\.current\?\.abort\(\)/,
  );
});

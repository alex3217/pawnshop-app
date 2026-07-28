import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../src/pages/OwnerSubscriptionPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("owners without shops can still compare seller plans", () => {
  assert.doesNotMatch(
    source,
    /\) : !hasShops \? \(/,
    "the no-shop condition must not replace the complete subscription body",
  );

  assert.match(
    source,
    /Compare plans before creating your shop/,
  );

  assert.match(
    source,
    /Create shop to choose this plan/,
  );

  const noShopMessageIndex = source.indexOf(
    "Compare plans before creating your shop",
  );

  const planGridIndex = source.indexOf(
    "{plans.map((plan) => {",
  );

  assert.ok(noShopMessageIndex >= 0);
  assert.ok(
    planGridIndex > noShopMessageIndex,
    "the plan grid must render after the no-shop guidance",
  );
});

test("founding-shop copy has no first-shop registration limit", () => {
  assert.match(
    source,
    /days free for registering shops/,
  );

  assert.equal(
    source.includes("foundingProgram.shopLimit"),
    false,
  );
});

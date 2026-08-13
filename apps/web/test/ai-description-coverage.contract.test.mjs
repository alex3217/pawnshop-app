import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const coveredForms = [
  ["inventory create and scanner/camera prefill", "src/pages/CreateItemPage.tsx", "INVENTORY_ITEM"],
  ["inventory edit", "src/pages/OwnerItemEditPage.tsx", "INVENTORY_ITEM"],
  ["admin reusable inventory editor", "src/pages/AdminItemsPage.tsx", "INVENTORY_ITEM"],
  ["marketplace create for shop and customer sellers", "src/pages/CreateMarketplaceListingPage.tsx", "MARKETPLACE_LISTING"],
  ["marketplace edit", "src/pages/EditMarketplaceListingPage.tsx", "MARKETPLACE_LISTING"],
  ["buyer sell, pawn, scanner and marketplace submission", "src/pages/BuyerSellItemPage.tsx", "PAWN_SUBMISSION"],
];

for (const [name, file, context] of coveredForms) {
  test(`${name} keeps the shared AI description control`, async () => {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /<AiDescriptionControl/);
    assert.match(source, new RegExp(`["']${context}["']`));
  });
}

test("shared control protects manual text and exposes accessible states", async () => {
  const source = await readFile(new URL("src/components/AiDescriptionControl.tsx", root), "utf8");
  assert.match(source, /window\.confirm/);
  assert.match(source, /Generate with AI/);
  assert.match(source, /Generating…/);
  assert.match(source, /Regenerate/);
  assert.match(source, /Clear generated description/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role=\{error \? "alert" : "status"\}/);
});

test("excluded private text areas do not gain AI controls", async () => {
  for (const file of ["src/pages/OwnerItemIntakesPage.tsx", "src/pages/MarketplaceTransactionDetailPage.tsx", "src/pages/ItemDetailPage.tsx"]) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /AiDescriptionControl/);
  }
});

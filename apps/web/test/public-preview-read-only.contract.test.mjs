import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public preview provider fails closed in production and consumes capabilities", async () => {
  const [provider, state, client] = await Promise.all([
    source("src/publicPreview/PublicPreviewContext.tsx"),
    source("src/publicPreview/publicPreviewState.ts"),
    source("src/services/apiClient.ts"),
  ]);

  assert.match(state, /productionBuild = ENVIRONMENT\.deployEnv === "production"/);
  assert.match(state, /readOnly:\s*productionBuild/);
  assert.match(provider, /\/capabilities/);
  assert.match(provider, /setPublicPreviewReadOnly\(next\.readOnly\)/);
  assert.match(client, /PUBLIC_PREVIEW_READ_ONLY/);
  assert.match(client, /\["GET", "HEAD", "OPTIONS"\]/);
});

test("banner and registration replacements are accessible and visible", async () => {
  const [banner, app, layout] = await Promise.all([
    source("src/publicPreview/PublicPreviewBanner.tsx"),
    source("src/App.tsx"),
    source("src/components/SiteLayout.tsx"),
  ]);

  assert.match(banner, /role="status"/);
  assert.match(banner, /Public preview — browsing only/);
  assert.match(app, /title="Registration is paused"/);
  assert.match(app, /title="Pawn shop applications are paused"/);
  assert.match(layout, /aria-disabled="true">Browsing only/);
  assert.match(layout, /!publicPreviewReadOnly \|\| item\.to !== "\/register"/);
});

test("primary purchase, bid, offer, and watchlist controls are disabled", async () => {
  const [buyNow, auction, item] = await Promise.all([
    source("src/pages/MarketplaceBuyNowPage.tsx"),
    source("src/pages/AuctionDetailPage.tsx"),
    source("src/pages/ItemDetailPage.tsx"),
  ]);

  assert.match(buyNow, /publicPreviewReadOnly\s*\|\|\s*ownListing/);
  assert.match(buyNow, /Purchases unavailable/);
  assert.match(auction, /publicPreviewReadOnly\s*\|\|/);
  assert.match(auction, /Bidding unavailable/);
  assert.match(item, /disabled=\{publicPreviewReadOnly \|\| savingWatchlist\}/);
  assert.match(item, /disabled=\{publicPreviewReadOnly \|\| submittingOffer\}/);
});

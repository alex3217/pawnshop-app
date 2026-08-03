# Marketplace Intelligence V1 implementation summary

Completed: 2026-08-01 on `feature/marketplace-intelligence-v1`.

## Architecture reused

- Public `Item` detail remains the buyer-facing target; authoritative `MarketplaceListing` rows supply active comparable inventory.
- `MarketplaceTransaction` is the only completed marketplace-sale source. Existing settlements, payouts, ledgers, auctions and offer acceptance are not merged into sales.
- Existing saved searches, watchlists, offers, buyer submissions, marketing campaigns, follows, Business Growth, Shop Health, Platform Success, buyer entitlements, seller entitlements and authorization middleware remain in place.
- Owner intelligence extends the existing `/shops/:shopId/business-growth` response behind `growth:read`. Super Admin intelligence is registered inside the existing authenticated `SUPER_ADMIN` router.
- No model, migration, environment, Stripe identifier, plan code, price or subscription record changed.

## Calculations

- Decimal money is converted once with `Math.round(Number(value) * 100)` and all analytics use integer cents.
- Mean: rounded integer sum divided by sample size. Median: sorted middle cent value, or rounded mean of the two middle cent values.
- Completed sales: distinct transaction ids where `MarketplaceTransaction.status = COMPLETED`; sale price is `subtotal`; freshness is `completedAt`.
- Confidence: `<3` insufficient; `3–9` low; `10–29` moderate; `30+` higher.
- Price position requires three completed comparable sales: below/above range, near average within max($1.00, 10%), or below/above average within the range.
- Comparables require normalized category equality and the existing deterministic title-token compatibility rules. Similar active listings are ranked by same state, same condition, absolute price distance, then stable id order.
- Demand score: `(saved searches×2 + watchlists×2 + offers×3 + completed sales×4 + buyer submissions×2) / (active supply+1) ×5`, clamped 0–100. No evidence is `INSUFFICIENT_DATA`; otherwise `<30` low, `30–64` moderate, `65+` high.
- Owner sell-through: completed / (active + completed), expressed as a percentage. Inventory age and days to sale use whole UTC millisecond day windows.
- Platform Health version `platform-health-v1.0`: supply 15, demand 15, transactions 15, shop activation 10, buyer engagement 10, marketing 10, fulfillment 10, subscription 5, data quality 10. Each fixed component is a capped observed/target ratio and totals exactly 100 maximum.

## Data sources and privacy

- Buyer: public eligible Item, public ACTIVE MarketplaceListing projections, completed MarketplaceTransaction aggregates, and aggregate saved-search/watchlist/offer counts.
- Owner: items and completed seller transactions scoped by `sellerShopId = requested shop`, plus aggregate offers scoped through the shop’s items.
- Super Admin: aggregate active listings, 90-day marketplace transactions/offers/submissions, shops, buyer counts, saved searches, watchlists, marketing campaigns and follows.
- Public projections allowlist listing, price, image, public shop name/slug/city/state and omit seller/buyer identity and private financial fields.
- Owner results are aggregate-only. Admin geography is shop-state only. Buyer identities, individual searches, exact customer locations and Growth Center contacts are excluded.

## APIs and frontend routes

- `GET /api/items/:id/intelligence` (also mounted without `/api`): complete buyer intelligence; public, rate-limited to 120 requests/minute.
- `GET /api/items/:id/similar`: public similar-listing projection.
- `GET /api/items/:id/comparables`: public active/completed summary.
- `GET /api/items/:id/price-history`: honest unavailable response.
- `GET /api/shops/:shopId/business-growth`: existing authorized response extended with `marketplaceIntelligence` and existing seller plan level.
- `GET /api/super-admin/marketplace-intelligence`: existing Super Admin server authorization; aggregate overview, category, geography, gaps, pricing, Platform Health and action queue.
- Buyer UI: existing `/items/:id` Item Detail includes loading, error, insufficient, empty and populated Marketplace Intelligence states, similar listings and disclaimer.
- Owner UI: existing `/owner/business-growth` includes inventory, sales, plan-limited category data and limitations.
- Admin UI: new `/super-admin/marketplace-intelligence` page and navigation entry includes loading, empty, error and populated states. Unauthorized behavior remains in the route guard.

## Entitlements

- Free buyers retain the public comparable summary and all existing commerce, offer and auction behavior; V1 adds no buyer paywall.
- Owner results use existing `featureLevels.businessGrowthLevel`. Basic/standard receives basic inventory, sales and category counts; advanced/enterprise receives full category metrics and inventory opportunities. Enforcement happens in the server response.

## Honest unavailable and deferred work

- Price history is always unavailable because no immutable price-event source exists.
- Search-event, listing-view, shop-view and comparison-event analytics are unavailable; no event model was created.
- Structured brand/model matching, listing-specific location, price reductions, forecasts, anonymous benchmarking, exports, cross-location corporate intelligence and API eligibility remain deferred.
- Future AI assistants may consume these deterministic contracts. V1 adds no generative call, prompt, model dependency or raw-table AI access.

## Risks

- Legacy `Item` and `MarketplaceListing` representations can drift; the target uses Item while marketplace supply/sales use MarketplaceListing.
- Brand/model are not structured, so title compatibility is deliberately conservative and may under-match.
- Saved searches are free text; only aggregate normalized category containment is used, which may over/under-count category demand.
- Sparse categories correctly produce insufficient/low confidence; production usefulness depends on real completed-transaction density.
- Refund/dispute-adjusted net sales are intentionally not represented. Completed transaction subtotal is gross observed sale value, with this limitation documented to avoid finance double counting.
- Platform Health targets are deterministic operational policy, not statistical forecasts; version changes require an explicit new version and regression tests.

Suggested commit message (not executed): `feat: add deterministic marketplace intelligence v1`

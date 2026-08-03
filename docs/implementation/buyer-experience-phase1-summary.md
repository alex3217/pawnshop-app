# Buyer Experience Phase 1 Summary

Date: 2026-08-01

## Existing features reused

Buyer Dashboard, Marketplace, item locator, public shops/items, watchlist, saved searches, offers, bids, wins, purchases, payment methods, notifications, buyer item submissions, sell/pawn workflow, and local price comparison remain the existing systems of record. Buyer subscriptions continue to use `BuyerSubscription`, `buyerPlans.js`, the pricing-rule overlay, existing Stripe environment mappings, lifecycle service, and Super Admin controls.

## Compatibility decisions

- Stored codes remain `FREE`, `PLUS`, `PREMIUM`, and `ULTRA`.
- Stripe keys and identifiers are unchanged.
- Customer display mapping is `FREE → Free`, `PLUS → Pro`, `PREMIUM → Plus`, and `ULTRA → Ultra`.
- Current configured prices are unchanged.
- A canceled or otherwise unusable paid subscription receives Free entitlements without rewriting its stored code.
- Consumer accounts cannot self-promote through the legacy direct subscription-update endpoint. Verified billing or administrator lifecycle processing remains required.

## Phase 1 implementation

- Extended the existing buyer plan catalog into the centralized entitlement definition.
- Added one backend resolver for effective plan, entitlement representation, implementation status, and user-scoped usage.
- Added backend limits for saved searches and watchlist items, with clear `BUYER_PLAN_LIMIT_REACHED` upgrade responses.
- Set the Free saved-search limit to the specified ten; Pro and above are unlimited.
- Fixed saved-search deletion so one buyer cannot delete another buyer's record.
- Added authenticated buyer usage API.
- Moved Buyer Dashboard behind the existing consumer route guard.
- Added Buyer Workspace using real watchlist, saved-search, purchase, offer, bid, win, and sell/pawn routes.
- Added Buyer Success Center with real actions only and no unsupported completion claims.
- Added Buyer Subscription usage and plan UI.
- Cleaned buyer navigation by adding dashboard/workspace/success/subscription and removing customer-listing creation links from the primary buying workspace. The underlying listing functionality was not removed.
- Reused watchlist as the Phase 1 default wish-list/item-saving foundation. Named and multiple wish lists are deferred.

## Entitlement behavior

Free keeps browsing, Buy Now, offers, auctions, payment methods, and order tracking. Paid tiers monetize limits and future convenience eligibility, not core commerce. Backend enforcement currently applies only to implemented bounded resources: saved searches and watchlist items. Entitlements for AI, collections, market intelligence, loyalty, referrals, and concierge include a separate implementation-status response so eligibility is not presented as an available feature.

## Models and migrations

No Prisma model changed and no migration was created or applied.

## APIs

Added:

- `GET /api/buyer-plans/mine/usage`

Updated behavior:

- `POST /api/saved-searches` enforces the effective buyer-plan limit.
- `DELETE /api/saved-searches/:id` is scoped by authenticated user ID.
- `POST /api/watchlist` enforces the effective buyer-plan item limit while keeping repeat additions idempotent.
- `PUT/PATCH /api/buyer-plans/mine` rejects consumer-authored billing authority changes.

## Frontend routes

Added:

- `/buyer/workspace`
- `/buyer/success`
- `/buyer/subscription`

Updated:

- `/buyer/dashboard` now requires the existing consumer/admin role guard.

## Deferred Buyer Phase 2–4 work

Phase 2: named/multiple wish lists, collections, follow shops, advanced opt-in alerts, persistent comparisons, price history, loyalty ledger, referral attribution/rewards, Trade-In consolidation, Sell/Pawn consolidation, and spending insights.

Phase 3: AI Shopping Assistant, AI comparisons, market intelligence, collection valuation, insurance exports, and configurable/advanced workspace widgets.

Phase 4: verified concierge operations, shopping trips, local events, native mobile enhancements, regional demand intelligence, and advanced personalization.

## Risks and manual steps

- A verified buyer paid-plan checkout flow is not present in this scope. The UI therefore links to existing billing setup and does not claim an upgrade was purchased.
- Plan prices remain the existing configured values rather than the specification's target prices.
- Count-then-create limit enforcement is sufficient for the existing architecture but concurrent requests can theoretically race; a serializable transaction or database quota primitive should be considered with higher scale.
- Watchlist supplies one default Phase 1 wish list, not named/multiple wish lists.
- Existing saved-search records above the new Free limit remain readable and removable; enforcement blocks only additional creation.

Suggested commit message: `feat: add buyer phase 1 entitlements and workspace`

# Owner Growth and Platform Success V1 — Architecture Audit

Audit date: 2026-08-01

## Guardrails

- Extend the existing owner dashboard, Marketing Center, Growth Center, seller-plan catalog, subscription state, shop-access middleware, inventory, transaction, settlement, payout, and analytics paths.
- Preserve stored seller plan codes (`FREE`, `PRO`, `PREMIUM`, `ULTRA`), Stripe product/price identifiers, subscription records, and configured prices. `PREMIUM` may be displayed as **Plus** without rewriting stored data.
- Add no Prisma model or migration in V1. Derived growth data is calculated on request and remains shop-scoped.
- Treat settlement/marketplace transaction values as authoritative. Do not add a second revenue ledger or estimate revenue from inventory prices.
- Keep Business Coach rule-based. No approved general AI provider is used for this feature.
- Keep Platform Success read-only and restricted by the existing `SUPER_ADMIN` router guard. Do not join or serialize Growth Center lead/contact tables.

## Existing architecture summary

- `PawnShop` owns subscription, onboarding, Stripe Connect, items, staff, marketplace transactions, payouts, and marketing campaigns.
- `sellerPlan.service.js` already resolves the effective plan using the database-backed pricing catalog with static configuration fallback, and already enforces listing, auction, and featured-listing rules.
- Locations are represented by shops owned by the same owner; there is no separate Location model. Existing owner location flows create/manage `PawnShop` rows.
- Shop access supports owners and staff permissions. Marketing currently uses `marketing:read`/`marketing:write`; adding `growth:read` and `analytics:read` is compatible with the existing permission-code architecture.
- Shop marketing campaigns and privacy-safe scan aggregates already exist. Campaign creation is shop-scoped, but no backend QR campaign cap exists.
- There is no review/rating model, follower model, shop-goal model, or general page-view/conversion event model.
- Marketplace transactions and settlements contain authoritative charged/completed amounts and fee snapshots. Payout systems already derive seller balances from settlement/transaction ledger entries.
- Super Admin routes are globally protected by `authRequired` plus `requireRole("SUPER_ADMIN")`; existing Growth Center contact data lives in separate lead/contact models and controllers.

## Requirement matrix

| Requirement | Existing support | Relevant files | Status | Risk | Safe implementation decision |
|---|---|---|---|---|---|
| Owner dashboard/navigation | Existing owner dashboard and shared navigation | `apps/web/src/pages/OwnerDashboardPage.tsx`, `apps/web/src/components/SiteLayout.tsx`, `apps/web/src/App.tsx` | Partial | Duplicate dashboard | Add one consolidated `/owner/business-growth` page and nav link. |
| Seller internal/display compatibility | Stable internal codes and centralized normalization | `src/config/sellerPlans.js`, `src/services/platformPricingCatalog.service.js`, Stripe subscription services | Partial | Renaming `PREMIUM` breaks stored values/webhooks | Retain `PREMIUM`; expose display name `Plus`; change no prices or Stripe IDs. |
| Central seller entitlements | Effective-plan resolver and listing/auction/featured gates exist | `src/services/sellerPlan.service.js`, `src/config/sellerPlans.js` | Partial | Divergent entitlement tables | Extend the existing resolver with V1 capability metadata and implementation status. |
| Listing limits | Backend create/intake checks exist | `sellerPlan.service.js`, `items.controller.js`, `itemIntakes.controller.js` | Complete | Incorrect active-status counting | Reuse `AVAILABLE` + `PENDING`; add regression tests. |
| Location limits | Plan values exist; location creation path is owner/shop based | `sellerPlans.js`, `locations.controller.js`, `shops.controller.js` | Partial | Multiple creation paths | Report usage; enforce in existing location/shop creation controller only where safely identifiable. |
| Staff limits | Plan values exist; staff CRUD is shop-scoped | `sellerPlans.js`, `staff.controller.js`, staff routes/middleware | Partial | Invites bypass capacity | Add shared capacity assertion and call it before staff creation/invite. |
| Auction/featured gates | Backend checks exist | `sellerPlan.service.js`, auction/listing controllers | Complete | Catalog fallback mismatch | Preserve current checks and expose the same resolved values. |
| QR campaign limits | Campaigns are shop-scoped; no plan limit | `shopMarketing.controller.js`, `shopMarketing.routes.js` | Missing | Concurrent creates can exceed cap | Add limit to centralized entitlements and enforce before non-default campaign creation. Report default permanent QR separately. |
| Owner plan usage API | Listing-only entitlement snapshot exists internally | `sellerPlan.service.js`, shops routes | Partial | Cross-shop leakage | Add authenticated shop route guarded by `growth:read`; count only rows scoped to requested shop/owner. |
| Business Growth service | Data foundations exist across models | Prisma schema, inventory/offers/marketing/transactions services | Missing | N+1 queries and invented metrics | One reusable service performs bounded aggregate queries and returns availability metadata for unsupported metrics. |
| Shop Health | No existing score | N/A | Missing | Opaque or punitive score | Pure deterministic calculator, versioned weights totaling 100, visible evidence/actions, neutral handling of unsupported optional data. |
| Marketing checklist | Real shop/campaign state exists | PawnShop and marketing campaign models | Partial | Claiming offline placement completion | Mark only database-verifiable tasks complete; label unsupported printable/offline actions unavailable. |
| Inventory insights | Item status, photos, description, category, condition, timestamps exist | `Item` model and inventory controllers | Partial | Arbitrary quality rules | Publish exact thresholds (stale: 90 days; short description: under 40 chars; recent: 30 days). |
| Customer insights | Offers, inquiries, watchlists, transactions, scans exist | `Offer`, `Inquiry`, `Watchlist`, `MarketplaceTransaction`, scan models | Partial | Personal data exposure | Return aggregate counts only; no email/message/contact payloads. Reviews/followers are unavailable. |
| Revenue summary | Transactions/settlements and fee fields exist | marketplace transaction and settlement models; revenue services | Partial | Double counting | Use completed seller marketplace transactions as primary V1 totals; expose settlement metrics separately, never sum the two sources together. |
| Growth opportunities/coach | No shared implementation | N/A | Missing | Fake AI or generic advice | Deterministic rules tied to returned metrics, with reason, route, priority, evidence, and completion state. |
| Goals | No storage model | Prisma schema | Missing | Migration and duplicate settings model | Defer persistence; do not show fake goals in V1. |
| Owner staff permissions | Explicit permission architecture exists | `shopPermissions.js`, shop/staff access services | Partial | Existing staff unexpectedly denied | Add `growth:read` and `analytics:read`; grant read access in appropriate default roles while preserving owner full access. |
| Platform Success overview | Super Admin overview/analytics and Growth Center exist | `superAdmin.routes.js`, `superAdmin.controller.js`, admin frontend | Partial | Contact-data leakage and duplicate analytics | Add a read-only aggregate service/controller and consolidated page. Query shops/campaigns/subscriptions directly; never query lead/contact models. |
| Seller/buyer plan mix | Existing seller and buyer subscription data | PawnShop, BuyerSubscription, plan services | Complete foundation | Mislabeling legacy codes | Aggregate stored codes, add display labels separately. |
| Platform action queue | Shop state exists | PawnShop/items/campaigns | Missing | Opaque prioritization | Deterministic reasons and existing admin routes only; no mutations in V1. |
| Audit logging | Mutation audit infrastructure exists | `superAdminAudit.service.js`, `superAdmin.routes.js` | Complete for mutations | Fake read logs | Platform Success V1 is read-only, so create no mutation logs. Future actions must use existing middleware. |
| Reviews/ratings | No review model | Prisma schema | Missing | Invented review data | Return `available: false`; omit from score denominator or award neutral treatment explicitly. |
| Analytics/events | Marketing scans and marketplace events exist; no general shop analytics | scan and transaction event models | Partial | Overstated conversions/benchmarks | Use scan counts only; defer conversions, page views, benchmarking, and forecasting. |

## Deterministic calculation contract

Shop Health V1 uses five visible components totaling 100 points:

- Storefront completeness: 25
- Inventory quality: 30
- Customer readiness: 15
- Marketing setup: 15
- Operations: 15

Every check has a fixed point value, observed evidence, completion state, and recommended action. Optional systems absent from the schema (reviews, followers, generalized analytics) are not scored. Empty inventory is treated as an opportunity to start listing, while photo/description percentages are only evaluated when active inventory exists. Calculation version is returned with every result.

## Deferred work

- Persistent owner goals (requires product/storage design and a migration).
- Review profile and average ratings (no authoritative model).
- Followers, repeat-customer identity views, saved-search matches, and customer segmentation.
- General storefront views, conversion attribution, anonymous benchmarking, demand forecasting, and AI-generated coaching.
- Platform Success administrative mutations; V1 is read-only.
- Applying database migrations or changing production seller pricing/Stripe mappings.

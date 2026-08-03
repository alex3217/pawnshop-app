# Buyer Experience and Plan Audit

Date: 2026-08-01

This audit was completed before Buyer Phase 1 application behavior changed.

## Existing architecture

Buyer subscriptions already use the Prisma `BuyerSubscription` model with stored plan enum values `FREE`, `PLUS`, `PREMIUM`, and `ULTRA`. `apps/api/backend/src/config/buyerPlans.js` is the existing static plan source; `platformPricingCatalog.service.js` safely overlays database pricing rules. Stripe uses the paid internal codes `PLUS`, `PREMIUM`, and `ULTRA` and environment keys `STRIPE_PRICE_BUYER_PLUS`, `STRIPE_PRICE_BUYER_PREMIUM`, and `STRIPE_PRICE_BUYER_ULTRA`. Subscription lifecycle and Super Admin controls also validate those internal codes. Renaming stored codes would risk existing subscriptions, metadata, webhooks, prices, fixtures, and administrative operations.

The safe compatibility decision is to retain every internal code and Stripe mapping. Customer-facing labels become `Free`, `Pro` for internal `PLUS`, `Plus` for internal `PREMIUM`, and `Ultra`.

The existing buyer dashboard already aggregates real discovery, watchlist, saved-search, offer, bid, win, and nearby-shop data. Saved searches and watchlist are real, user-owned systems. Watchlist is the suitable Phase 1 item-saving/wish foundation; a second item-saving model is not justified in Phase 1. Named multiple wish lists remain deferred because the current schema cannot represent them without a new migration.

## Buyer requirement matrix

| Requirement | Existing implementation | Relevant files | Complete | Partial | Missing | Defect or risk | Recommended action | Recommended plan entitlement |
|---|---|---|:---:|:---:|:---:|---|---|---|
| Buyer Dashboard | Real multi-source dashboard | `BuyerDashboardPage.tsx` | Yes | | | Some requested future metrics lack APIs | Reuse unchanged | Free |
| Buyer Workspace | Dashboard exists but no distinct workspace route/fixed widget foundation | `BuyerDashboardPage.tsx` | | | Yes | Creating another dashboard would duplicate behavior | Add a lightweight workspace that composes existing APIs | Free fixed; Pro customization represented only |
| Buyer Success Center | No guided buyer-success page | — | | | Yes | Unsupported completions must not be claimed | Add real saved-search/watchlist actions and links | Free |
| Marketplace search/filters | Keyword/category/location and marketplace discovery controls exist | marketplace and locator pages | | Yes | | Advanced/AI filters are not implemented | Preserve basic search; defer advanced search | Free basic; Pro entitlement representation |
| Watchlist / favorite items | User-item unique watchlist CRUD and UI | `Watchlist`, controller/page | Yes | | | Configured limits are not enforced | Reuse as default item-saving/wish foundation and enforce centrally | Free limited; paid larger/unlimited |
| Named Wish Lists | No named list/description/privacy/share schema | — | | | Yes | A duplicate flat favorite model would add no value | Defer named/multiple lists to Phase 2 migration | One default list represented by watchlist |
| Saved searches | User-owned CRUD and UI | `SavedSearch`, controller/page | | Yes | | Config says Free 5, not target 10; no backend enforcement; delete by ID lacks owner filter | Set Free to 10, central enforcement, fix isolation | Free 10; paid unlimited per target architecture |
| Smart alerts | Saved-search UI and general notifications exist | saved-search/notification code | | Yes | | No preference, pause, match-history, or unsubscribe model | Keep basic alerts; defer advanced opt-in alerts | Free basic; Pro advanced represented |
| Favorite/follow shops | No dedicated follow-shop persistence found | storefront/watchlist code | | | Yes | Marketing redirect action does not create a follow record | Defer secure follow-shop model | Future Free core |
| Offers | Buyer offer routes/UI exist | offers controllers/routes/pages | Yes | | | Must not be paid-gated | Preserve | Free core commerce |
| Auctions/bidding | Public auctions, bids, autobids, wins exist | auction/bid code/pages | Yes | | | Paid plans must not alter auction fairness | Preserve | Free core commerce |
| Buy Now, orders, fulfillment | Marketplace purchase, transaction, receipt/fulfillment views exist | marketplace transaction code/pages | Yes | | | Must not be paid-gated | Preserve | Free core commerce |
| Messages | Inquiry/offer communication exists; no unified hub | inquiry/offer code | | Yes | | A new messaging model would duplicate partial systems | Defer consolidation | Free core when supported |
| Reviews | Admin placeholders; no complete eligible buyer review workflow found | admin review page | | | Yes | Must verify transactions before reviews | Defer | Free core when implemented |
| Buyer item submissions / trade-in | Existing submission, scan, offers, sell/pawn paths | buyer item submission code/pages | Yes | | | Avoid a second Trade-In submission system | Reuse; consolidate later | Free core |
| Price comparison | Local price-comparison API and locator UI exist | item price comparison service/routes | | Yes | | No saved comparison list or per-user usage | Represent comparison limit; defer persistent compare list | Free basic; larger paid |
| Alerts/notifications | User notifications with read state | `Notification` and UI | | Yes | | No promotional-consent preference architecture | Do not infer marketing consent | Free basic |
| Buyer subscription model | One user-to-subscription record with Stripe fields | Prisma schema | Yes | | | None requiring Phase 1 schema work | Reuse without migration | All plans |
| Buyer plan catalog | Central config plus pricing-rule overlay | `buyerPlans.js`, pricing catalog | | Yes | | Legacy labels/limits differ; entitlement vocabulary is narrow | Extend same config | All plans |
| Stripe product/price mapping | Paid codes map to existing environment identifiers | `lib/stripe.js` | Yes | | | Code rename would break compatibility | Preserve exactly | Paid plans |
| Buyer webhook/lifecycle | Metadata plan validation and lifecycle operations exist | lifecycle and Stripe services/tests | Yes | | | Depends on legacy internal codes | Preserve exactly | Paid plans |
| Super Admin buyer controls | Plan catalog and subscription lifecycle pages/APIs | Super Admin controller/pages | Yes | | | Display labels must remain distinguishable from codes | Return display name alongside code | Admin-only |
| Buyer subscription usage | Subscription read exists; no counts/limits UI | buyer-plan controller | | | Yes | Buyers cannot understand plan value or limits | Add centralized entitlements/usage API and UI | All plans |
| Backend entitlement enforcement | Saved-search/watchlist config exists but controllers do not check it | controllers/config | | | Yes | Frontend-only or nonexistent gating | Add service and backend checks | All plans |
| Cross-user isolation | List routes scope users; watchlist delete uses compound owner key | controllers | | Yes | | Saved-search delete uses ID alone | Fix delete to include user ID and test | All plans |
| Buyer navigation | Dashboard route exists but public; buyer links mix purchasing and marketplace-selling actions | `App.tsx`, `SiteLayout.tsx` | | Yes | | Dashboard is not role-guarded; navigation is fragmented | Guard dashboard and add coherent workspace/success/subscription links | Free |
| Collections | No owned-item collection architecture | — | | | Yes | Requires privacy-sensitive schema | Phase 2 | Plus representation only |
| Loyalty/referrals | Shop marketing referral destinations only; no buyer reward ledger | marketing code | | | Yes | Financial rewards need policy/audit | Phase 2 | Pro+ representation only |
| AI buyer capabilities | No safely connected buyer AI assistant found | AI routes are not a buyer plan system | | | Yes | Do not advertise unavailable AI | Entitlement keys report unavailable implementation | Future paid |
| Concierge | No operational workflow/staffing | — | | | Yes | Must not promise human service | Represent entitlement as future/unavailable | Ultra representation only |
| Free core commerce | Browse, details, shops, buy, offers, bids, tracking remain ungated | public/consumer/transaction routes | Yes | | | Entitlement middleware must not be applied to commerce | Add regression assertions | Free |

## Phase 1 implementation boundary

Extend `buyerPlans.js` as the single entitlement definition and add one service that resolves effective plans, entitlements, and user-scoped usage. Enforce only existing bounded resources: saved searches and watchlist items. Add usage, subscription, workspace, and success-center UI. Do not add models or migrations, named wish lists, collections, shop follows, rewards, AI, concierge, advanced alerts, or Stripe changes.

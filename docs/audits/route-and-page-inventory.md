# PawnLoop Route and Page Inventory

Audit date: 2026-08-01. Evidence is static registration/import inspection plus build and contract tests; browser reachability was not proven because the expected local service on port 6002 was not running.

## Backend mounts

`createApp()` registers every router at both its bare mount and `/api` equivalent through `mountApi`, except the explicitly listed routes below. This creates 267 method declarations across 33 route files.

| Mount | Router / handler | Main audience | Notes |
|---|---|---|---|
| `/`, `/api` | root handler | Public | API identity contract |
| `/health`, `/api/health` | health handler | Public | Process health; contract-tested |
| `/ready`, `/api/ready` | readiness handler | Operations | Database-aware; contract-tested with injected checks |
| `/r/:shortCode`, `/api/r/:shortCode` | marketing redirect | Public | Redirect target is validated in controller |
| `/ref/:code`, `/api/ref/:code` | referral redirect | Public | conversion is authenticated at `/api/ref/:code/convert` |
| `/webhooks/stripe`, `/api/webhooks/stripe` | Stripe webhook router | Stripe | Raw-body mount precedes JSON parsing |
| `/auth` | `auth.routes.js` | Public/authenticated | Register, login, verify, recovery, me, refresh, logout, shop access |
| `/owner-applications` | `ownerApplications.routes.js` | Owner | Current application update/resubmit |
| `/notifications` | `notifications.routes.js` | Authenticated | List/read |
| `/followed-shops` | `followedShops.routes.js` | Buyer | Follow list |
| `/shops` | `shops.routes.js` plus nested marketing/assets/engagement/follow | Public/shop roles | CRUD, onboarding, growth, plan usage |
| `/locations` | `locations.routes.js` | Public/shop roles | Directory and shop location management |
| `/items` | `items.routes.js` | Public/shop roles | Public reads; protected inventory mutations; intelligence |
| `/item-intakes` | `itemIntakes.routes.js` | Shop roles | Review, archive, publish, customer lookup |
| `/marketplace-listings` | `marketplaceListings.routes.js` | Public/seller | Browse, mine, create/edit/state transitions |
| `/marketplace-transactions` | `marketplaceTransactions.routes.js` | Buyer/seller/admin | Reserve, payment, fulfillment and customer-sell transitions |
| `/inventory-bulk` | `inventoryBulk.routes.js` | Shop roles | CSV import |
| `/integrations` | `integrations.routes.js` | Shop roles/webhooks | Connector configuration, mappings, sync jobs |
| `/inquiries` | `inquiries.routes.js` | Public/admin | Inquiry creation/management |
| `/admin` | `admin.routes.js` | Admin/Super Admin | Users, shops, items, owner applications and overview resources |
| `/super-admin` | `superAdmin.routes.js` | Super Admin | Growth, plans, pricing, revenue, settings, audit, system |
| `/auctions`, `/bids` | auction/bid routers | Public/buyer/shop roles | Discovery, lifecycle, bidding, archives |
| `/watchlist`, `/saved-searches` | respective routers | Buyer/Admin | Buyer-owned records |
| `/offers` | `offers.routes.js` | Buyer/owner/Admin | Create, counter, accept, reject, cancel; PATCH/POST compatibility aliases |
| `/buyer/item-submissions` | buyer submission router | Buyer/owner/Admin | Intake and shop-offer workflow |
| `/staff` | `staff.routes.js` | Shop roles | Membership and permission administration |
| `/settlements` | `settlements.routes.js` | Buyer/owner/Admin | Settlement reads, fulfillment and payout-related views |
| `/stripe` | `stripe.routes.js` | Authenticated/admin | Config, methods, checkout, portal, refunds, Connect |
| `/ai` | `ai.routes.js` | Shop roles | Listing-assistant endpoint behind feature configuration |
| `/api/seller-plans`, `/api/buyer-plans`, `/api/platform-settings/public` | direct mounts | Mixed | Catalog/usage and public platform configuration |

All 39 controllers, 49 service files, and 33 router files were enumerated from `apps/api/backend/src`. No missing router import was reported by Node syntax checks or the production build.

## Web routes and pages

There are 95 `pages/*.tsx` files. Route groups in `App.tsx` are lazy-imported and compiled successfully.

| Audience | Registered routes |
|---|---|
| Public | `/`, `/for-pawn-shops`, `/terms`, `/privacy`, `/marketplace`, `/marketplace/buy-now`, `/shops`, `/shops/:id`, `/items/:id`, `/auctions`, `/auctions/:id`, `/login`, `/register`, `/verification-pending`, `/verify-email`, `/forgot-password`, `/reset-password` |
| Buyer | `/buyer` (redirect), `/buyer/dashboard`, `/buyer/workspace`, `/buyer/success`, `/buyer/subscription`, `/buyer/item-locator`, `/buyer/sell-item`, `/my-bids`, `/bids` (redirect), `/my-wins`, `/watchlist`, `/saved-searches`, `/marketplace/listings/mine`, `/marketplace/listings/new`, `/marketplace/listings/:id/edit`, `/marketplace/purchases`, `/marketplace/sales`, `/marketplace/transactions/:id`, `/offers`, `/account/payment-methods` |
| Owner/applicant | `/owner/application`; approved-owner routes `/owner`, `/owner/dashboard` (redirect), `/owner/finance`, `/owner/onboarding`, `/owner/shops/new`, `/owner/items/new`, `/owner/items/:id/edit`, `/owner/inventory`, `/owner/item-intakes`, `/owner/integrations`, `/owner/marketing`, `/owner/business-growth`, `/owner/locations`, `/owner/staff`, `/owner/scan-console`, `/owner/bulk-upload`, `/owner/subscription`, `/owner/auctions`, `/owner/auctions/new` |
| Admin | `/admin` plus `overview`, `users`, `owners`, `owner-applications`, `shops`, `inventory`, `items` redirect, `integrations`, `auctions`, `offers`, `subscriptions`, `subscription` redirect, `orders`, `reviews`, `support`, `revenue`, `analytics`, `risk`, `audit`, `system`, `settings` |
| Super Admin | `/super-admin` plus `overview`, `growth`, `growth/leads`, `growth/leads/:leadId`, `platform-success`, `marketplace-intelligence`, `marketing-administration`, `users`, `shops`, `owners`, `auctions`, `offers`, `inventory`, `integrations`, `plans/seller`, `seller-subscriptions`, `plans/buyer`, `buyer-subscriptions`, `subscriptions` redirect, `settlements`, `pricing`, `revenue`, `audit`, `system`, `platform-settings`, `settings` redirect |
| Catch-all | `*` | Not-found UI |

Navigation is generated in `SiteLayout`, admin route/sidebar configuration, and mobile tabs. Owner routes use approval and shop-capability guards; Admin and Super Admin use separate role guards. Several links include query strings and are valid despite the repository scanner reporting them as non-exact matches. `/settlements` appears in links but no standalone web route was found; users should be directed to the role-specific finance/settlement page.

## Mobile routes

Expo Router contains 16 route/layout files: index, explore, marketplace, shops and shop detail, item detail aliases, auctions and auction detail, login, register, watchlist, my wins, and scan intake. The mobile surface is a subset, not role parity. `scan-intake` asks for a bearer token and shop ID manually, which is diagnostic UX and a launch blocker if mobile is in launch scope.

## Route validation result

- Frontend TypeScript and production build: PASS; all lazy imports resolved.
- Backend JS/MJS syntax: PASS for all source, script, and test files.
- Backend route scanner: PASS as a static scanner.
- Frontend link scanner: completed but its parser only recognized three literal declarations and emitted widespread false positives; not accepted as reachability proof.
- Role-route smoke test: BLOCKED because `127.0.0.1:6002` was not running.
- Browser click audits: NOT RUN; no authenticated seeded runtime was available.


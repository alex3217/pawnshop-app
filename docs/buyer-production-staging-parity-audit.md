# Buyer production/staging parity and shared contrast audit V1

Date: 2026-08-05  
Audited branch: `fix/buyer-staging-parity-contrast-v1`

## Revision and deployment evidence

- `origin/main`: `e7df1fdde0e726d7069cfdc58409cc11dd52514b`
- Branch starting `HEAD`: `e7df1fdde0e726d7069cfdc58409cc11dd52514b`
- Merge base with `origin/main`: `e7df1fdde0e726d7069cfdc58409cc11dd52514b`
- The starting branch was therefore exactly at the locally fetched `origin/main` revision. The newest commit was “Add authenticated staging buyer smoke foundation (#243)” dated 2026-08-05T19:10:03-05:00.
- GitHub deployment records could not be read: `gh auth status` reports that the configured credential for `alex3217` is invalid. This repository intentionally has no Render manifest, and `DEPLOYMENT.md` states that the public health payload does not expose a commit. Render deployment records are the authoritative environment/SHA evidence.
- Result: no source-backed claim can be made that production and staging currently run the same revision. An operator must compare both Render deploy records through the normal deployment workflow. No deployment setting or revision was changed here.

## Why staging can look limited

The shared source already contains a substantial Buyer Account experience. Before this branch, its links were divided between a long primary navigation row and Buyer Tools. At narrower desktop widths, account destinations were easy to miss and the primary row could scroll horizontally. This is a **shared responsive-navigation defect**, not evidence that production has a separate Buyer Account codebase.

The pages are also data- and identity-sensitive. Bids, wins, purchases, offers, watchlist, saved searches, listings, notifications, payment methods, and training content use the authenticated account and the environment's isolated database. Empty staging results are therefore normally **missing staging test data**, not missing routes. Knowledge Center only returns published content targeted to the current role; zero published `CONSUMER` lessons is **missing published CONSUMER training content**. Shop tools shown to a `CONSUMER` who is also staff remain capability-driven and are a **role/entitlement mismatch** when the staging identity lacks the corresponding membership or permissions.

Platform feature flags exist as an administrative system, but the audited buyer navigation does not consult a buyer-specific frontend flag. No hard-coded staging exception was added. Buyer plan APIs and limits exist, but there is no production buyer-facing plan/subscription page in the route registry, so none was invented or linked.

## Capability matrix

| Capability | Existing route | Existing backend/API | Production source status | Staging dependency | Navigation exposure | Parity blocker | Action in this branch | Follow-up |
|---|---|---|---|---|---|---|---|---|
| Buyer dashboard | `/buyer/dashboard` (`/buyer` redirects) | Aggregates existing buyer discovery, bids, offers, watchlist, saved-search and settlement APIs | Implemented | Auth role and environment-local activity | Dashboard control and Buyer Tools | Shared navigation discoverability | Added to the typed Buyer Tools registry; URL unchanged | Populate only approved synthetic staging activity if needed |
| Marketplace discovery | `/marketplace`, `/marketplace/buy-now`, `/items/:id` | Marketplace listings/items APIs | Implemented and public | Published staging listings | Primary navigation | Missing staging test data | Kept as high-frequency primary actions | Maintain synthetic staging listings separately |
| Item locator | `/buyer/item-locator` | Existing discovery/item services | Implemented and public | Published items/shop locations | Primary navigation | Missing staging test data | Preserved URL and primary exposure | Add approved staging fixtures only through normal test-data workflow |
| Sell / pawn submission | `/buyer/sell-item` | `/api/buyer-item-submissions` create/mine/offers lifecycle | Implemented | `CONSUMER` identity, eligible shops, local submissions | Primary navigation | Role or missing staging test data | Preserved high-frequency primary exposure | Do not copy production submissions |
| Auctions | `/auctions`, `/auctions/:id` | Auctions and bids APIs | Browse implemented; bid actions role-guarded | Live staging auctions and eligible buyer | Primary navigation | Missing staging test data / role mismatch | Preserved URLs and primary exposure | Keep bid enforcement in API/route logic |
| My bids | `/my-bids` (`/bids` redirects) | Bids mine/update/delete/place endpoints for `CONSUMER`/`ADMIN` | Implemented | Buyer bid history | Buyer Tools and mobile | Shared navigation defect / missing data | Moved from crowded primary row into typed Buyer Tools | None |
| Wins | `/my-wins` | Auction/settlement data used by the page | Implemented | Winning staging bid/settlement | Buyer Tools and mobile | Shared navigation defect / missing data | Registered consistently; URL unchanged | Use synthetic completed auction data if testing fulfillment |
| Offers | `/offers` | Buyer offer list/create/counter/cancel endpoints | Implemented | Buyer offer history and eligible listings | Buyer Tools and mobile | Shared navigation defect / missing data | Registered consistently; URL unchanged | None |
| Purchases, orders, receipts, pickup and shipping | `/marketplace/purchases`, `/marketplace/transactions/:id` | Marketplace transaction payment, event, reservation and fulfillment APIs | Implemented as purchase list plus transaction-detail workflow | Test-mode payment transaction and fulfillment state | Purchase list in Buyer Tools; detail reached from records/deep links | Missing staging test data | Preserved list/detail URLs; exposed purchase list | Do not fabricate transaction-detail links without an ID |
| Watchlist | `/watchlist` | `/api/watchlist/mine` plus add/remove | Implemented | Account-local saved items; buyer-plan limits may constrain writes | Buyer Tools and mobile | Missing staging test data | Registered consistently | Keep limits enforced by backend |
| Saved searches | `/saved-searches` | `/api/saved-searches/mine` plus add/remove | Implemented | Account-local searches; buyer-plan `maxSavedSearches` | Buyer Tools and mobile | Missing staging test data / plan entitlement | Registered consistently | Keep plan limits entitlement-driven |
| Buyer listings | `/marketplace/listings/mine`, `/marketplace/listings/new`, `/marketplace/listings/:id/edit` | Marketplace listings and transaction APIs | Implemented for permitted marketplace roles | Account-local listings; listing eligibility | List/create in Buyer Tools; edit via contextual deep link | Shared navigation defect / missing data | Registered list/create; preserved edit deep link | Backend remains authoritative |
| Payment methods | `/account/payment-methods` | Stripe payment-method setup/status/portal services; route allows `CONSUMER`/`OWNER` | Implemented | Staging Stripe test-mode customer/setup state | Buyer Tools and mobile | Missing staging test data/payment state | Registered consistently | Confirm staging remains on test-mode Stripe keys outside this branch |
| Notifications | Header notification center (no standalone route) | Authenticated list and mark-read endpoints | Implemented center; no preferences page | Account-local notifications | Header control | Missing staging test data | Preserved existing center; no placeholder preferences link | Build preferences only if a real API/page is later approved |
| Knowledge Center/help | `/knowledge`, `/knowledge/:slug` | Authenticated training list/content/progress; content filtered by role/publication | Implemented | Published `CONSUMER` audience lessons | Buyer Tools and mobile | Missing published CONSUMER training content; shared theme defect | Added readable truthful empty state and shared control contrast | Publish real staging lessons through approved content workflow if desired |
| Account recovery and email verification | `/forgot-password`, `/reset-password`, `/verify-email`, `/verification-pending` | Existing auth token/email endpoints | Implemented as auth flows | Account/email state | Contextual auth flow, not Buyer Tools | None / route-state dependent | URLs unchanged; no account hub invented | None |
| Account settings/profile | None | Auth identity exists; no audited buyer settings API/page | Genuinely missing buyer-facing system | N/A | Not exposed | Genuinely missing feature | Recorded only | Define product/API contract before implementation |
| Security settings, password change and MFA management | Recovery routes exist; no authenticated settings route | Password policy, account-action-token, MFA services exist server-side | Backend foundation only; no buyer management page | N/A | Not exposed | Genuinely missing frontend feature | Recorded only | Design authenticated security flows before exposing navigation |
| Notification preferences | None | Notification delivery/list exists; no preferences contract found | Genuinely missing | N/A | Not exposed | Genuinely missing feature | Recorded only | Define preference model/API first |
| Buyer plans/subscription | None for buyers; super-admin controls at `/super-admin/plans/buyer` and `/super-admin/buyer-subscriptions` | `/api/buyer-plans` and `/api/buyer-plans/mine`; lifecycle and Stripe support exist | Backend/admin implemented; buyer self-service page genuinely missing | Plan assignment and test-mode payment configuration | Correctly not exposed to buyer | Genuinely missing buyer-facing feature | Recorded only; no invented URL | Productize self-service route and authorization separately |
| Recently viewed | None | No persistence/API found | Genuinely missing | N/A | Not exposed | Genuinely missing feature | Recorded only | Define privacy, retention and API behavior first |
| Settlements | Reached through wins/transaction detail; no separate buyer route | Settlement and marketplace-transaction APIs | Buyer-relevant state implemented contextually | Completed staging transaction | Contextual only | Missing staging test data | No unsupported standalone link added | None |
| Shop staff auction tools | `/owner/auctions`, `/owner/auctions/new` | Shop-access capabilities and auction APIs | Implemented for a `CONSUMER` with active staff membership | Membership plus `auctionsRead`/`auctionsWrite` | Capability-driven Buyer/Shop Tools | Role/entitlement mismatch | Preserved capability-driven behavior | Configure only legitimate staging staff membership/permissions |
| Owner/Admin/Super Admin controls | `/owner/*`, `/admin/*`, `/super-admin/*` | Role and shop capability enforcement | Implemented for privileged roles only | Privileged identity | Not shown to ordinary `CONSUMER` | Role mismatch if comparing different accounts | Tests assert absence from buyer navigation | Never grant merely to simulate buyer parity |
| Layaway, loyalty and referrals | None | No complete buyer API/page contract found | Genuinely missing systems | N/A | Not exposed | Genuinely missing feature | Recorded only | Separate later product phases; do not add placeholder links |

## Shared-code findings and branch actions

1. A single typed `BUYER_NAVIGATION` registry now drives the authenticated buyer account menu, mobile menu and buyer footer grouping. It only contains already registered, functional destinations.
2. Account-specific links no longer inflate the desktop primary row. Marketplace, Buy Now, Item Locator, Sell / Pawn Item, Shops and Auctions remain primary; existing account destinations live in Buyer Tools.
3. Buyer Tools and mobile details menus now close on Escape and outside pointer interaction, return focus to the trigger on Escape, and close sibling menus when one opens. Native summary keyboard behavior is retained.
4. Shared light-theme tokens now explicitly define readable foregrounds, surfaces, borders, placeholders and focus colors. Knowledge Center uses those tokens for search controls, primary button states and a truthful empty state. Dark tokens remain the default and are unchanged.
5. Navigation visibility remains presentation only. Existing route guards, shop-capability checks and backend role checks were not weakened.

### Required specificity exception

The existing global rule in `styles/theme.css` sets all light-mode button text to `#0f172a !important`. A normal scoped Knowledge Center declaration cannot override that rule and produced dark text on the indigo Search button. The Knowledge Center therefore retains one narrowly scoped `color: #ffffff !important` declaration. Its background, border, and `-webkit-text-fill-color` declarations use normal specificity; no other `!important` declaration was added by this branch.

## Configuration and data boundaries

Production and staging must continue to use separate databases and payment environments. This audit read source and Git metadata only. It did not query either deployed database, access customer records, copy credentials or records, inspect cloud variables, or change Render/Cloudflare settings. No migration is required by these frontend-only changes.

# PawnLoop API and Permission Inventory

Audit date: 2026-08-01.

## Authorization layers

| Layer | Evidence | Assessment |
|---|---|---|
| Authentication | `authRequired` verifies JWT signature, requires integer `authVersion`, reloads active user, and rejects stale/disabled users | Strong, contract-tested |
| Platform roles | Canonical roles are `CONSUMER`, `OWNER`, `ADMIN`, `SUPER_ADMIN`; aliases normalize at the middleware | Strong base; some controllers still compare only `ADMIN` |
| Owner approval | `requireRole` loads `OwnerApplication` and requires `APPROVED` for OWNER | Tested, but database outage returns 503 and must be operationally monitored |
| Shop isolation | `shopAccess.service` combines owned and active assigned shops; permission middleware resolves exact shop | Core isolation tests pass |
| Staff permissions | 17 codes: `inventory:{read,write}`, `auctions:{read,write}`, `offers:{read,write}`, `locations:{read,write}`, `staff:{read,write}`, `settlements:read`, `customer-sell:{read,write}`, `marketing:{read,write}`, `growth:read`, `analytics:read` | Backend defaults and auction enforcement tested; full endpoint-by-endpoint comparison incomplete |
| Admin | `/admin` router allows ADMIN and SUPER_ADMIN | Correct router boundary; controller checks using only `ADMIN` are inconsistent |
| Super Admin | `/super-admin` requires `SUPER_ADMIN`, attaches context, JSON mutation guard, and audit middleware | Strong route boundary and unauthenticated contract test |
| Frontend guards | `RequireRole`, `RequireApprovedOwner`, `RequireShopCapability` | UX only; backend remains authoritative |

## Permission risks requiring correction or tests

1. `settlements.controller.js`, `sellerPlans.controller.js`, `stripe.controller.js`, `shops.controller.js`, and `locations.controller.js` contain direct checks for `role === "ADMIN"` rather than the shared Admin/Super Admin helper. Because the `/admin` router admits Super Admin, this can produce unexpected denials or owner-scope behavior. Treat as HIGH until every path has a Super Admin contract test.
2. Buyer resources allow `ADMIN` in several routers but not consistently `SUPER_ADMIN`; verify this is intentional support impersonation policy rather than an alias omission.
3. Staff endpoints accept all platform roles and delegate scope to middleware. Core shop-isolation tests pass, but every mutation does not have a cross-shop integration test.
4. Public item intelligence endpoints expose comparable inventory data. Rate limiting exists, but a formal public-field/PII contract test is absent.
5. `/api` and bare mounts duplicate the entire API by design. This doubles externally reachable aliases and must remain covered by gateway/rate-limit policy.

## Plans and entitlements

| Catalog | Internal codes | Display compatibility | Backend controls | Evidence / gap |
|---|---|---|---|---|
| Seller | `FREE`, `PRO`, `PREMIUM`, `ULTRA` | Premium is the legacy/internal code corresponding to requested Plus compatibility | listings, auctions, locations, staff, analytics, commission; database pricing overlay | Price-validation and subscription webhook unit tests pass; production Stripe object IDs and existing subscriptions not queried |
| Buyer | `FREE`, `PLUS`, `PREMIUM`, `ULTRA` | UI must clarify Pro/Premium naming; specification requests Free/Pro/Plus/Ultra while code has both Plus and Premium semantics | saved search/watchlist and broader feature flags | lifecycle/entitlement tests exist, but many declared benefits (AI shopping, loyalty, concierge, collections, early alerts) have no full workflow |

Seller static defaults show Free 25 active listings, Pro 100, Premium unlimited/5 locations/15 staff, Ultra unlimited. `PAST_DUE` is currently included among usable statuses in both catalogs; whether grace access is intended is not documented. Stripe checkout validates live Price amount, currency, interval, active state, and account mode before checkout. Webhooks have signature/idempotency-focused services. Exact production mapping remains NOT_TESTED because no provider calls or identifier changes were authorized.

## API quality findings

- 267 route method declarations were inventoried. Several offer actions intentionally expose both PATCH and POST compatibility aliases; duplicate-route intent should be documented in an API contract.
- Core routes use Zod or explicit validation unevenly. Older CRUD controllers rely on manual body selection and need negative-contract coverage.
- Pagination is present on growth, owner applications, marketplace and many Super Admin endpoints, but multiple broad `findMany` calls remain, including Admin user listing and dashboard aggregation queries.
- Standard 404 and top-level 500 contracts include request IDs and hide production 5xx messages. Individual controllers vary between `{error}` and `{success:false,error}`.
- Stripe webhook raw body is correctly mounted before JSON parsing. Refund, dispute, subscription invoice, payment, and payout idempotency have service tests.
- Integration webhook verification and retry semantics are not proven end to end.

## External integrations

| Integration | Current evidence | Status |
|---|---|---|
| Stripe / Connect | SDK, signed webhook mounts, price validation, payment/refund/dispute/payout services and tests | PARTIAL until test-mode end-to-end/provider configuration is proven |
| Resend / SMTP | Explicit provider selection, timeouts, failure tests | PARTIAL; no live delivery, bounce, unsubscribe, or retry proof |
| Redis | dependency present; optional rate-limit store architecture | NOT_TESTED in production-like topology |
| Uploads | Multer-based routes/services | PARTIAL; storage durability, malware scanning, content sniffing and image processing not proven |
| QR / PDF | QR and pdf-lib services/assets | PARTIAL; generation exists, load/cost and all redirect safety cases not browser-tested |
| Maps/geolocation | coordinate/distance utility and geo fields | PARTIAL; external geocoder/provider not evident |
| OpenAI | listing assistant behind environment feature flag | PARTIAL; provider failure/usage/cost runtime not validated |
| Socket.IO | backend and frontend dependencies/realtime module | PARTIAL; reconnect, authorization and multi-instance fanout not tested |


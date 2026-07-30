# PawnLoop Public Launch Readiness Audit V1

Audit date: 2026-07-29
Repository checkpoint: `35b8430d38e6ad165ecf994da521fbfed92e7bad`
Decision: **not ready for invite-only beta or general public launch**

## Executive summary

PawnLoop has a meaningful marketplace foundation: email verification and reset tokens, owner approval, role and shop-permission middleware, fixed-price and auction payment flows, Stripe subscription lifecycle handling, refund/dispute ledgers, seller payout requests, and connected-account payout reconciliation. The separate Connect webhook contract is correctly represented in source.

The repository does not establish a controlled production service. Invite-only beta is blocked by public self-registration without an invite gate, absent request rate limiting, absent durable upload/document storage, incomplete operational monitoring/incident procedures, draft legal policies, and unverified production dependencies. General public launch additionally requires MFA for privileged users, a reviewed support/moderation/dispute operating model, accessibility/browser/performance evidence, and production backup/restore proof.

Classification means:

- **VERIFIED**: repository evidence establishes the claim.
- **PARTIAL**: a meaningful implementation exists but is incomplete or lacks adequate validation.
- **MISSING**: no adequate repository implementation or procedure was found.
- **EXTERNAL CONFIGURATION REQUIRED**: code support exists, but the external state is not proven.
- **DEFERRED POST-LAUNCH**: explicitly safe to exclude from V1 after launch gates are met.

Priorities mean P0 blocks invite-only beta or public use, P1 is required before general public launch, and P2 is safe to defer.

## Verified current checkpoint

| Claim | Result | Evidence |
|---|---|---|
| Expected commit | **VERIFIED** | Local `HEAD`, `main`, and `origin/main` resolve to `35b8430`; `git show 35b8430` identifies “Add Stripe connected payout reconciliation (#191).” |
| PR #191 content is present | **VERIFIED** | Commit `35b8430`; `apps/api/backend/src/services/payouts/stripeConnectedAccountPayout.service.js`; `apps/api/backend/test/stripeConnectedAccountPayout.integration.test.js`. |
| Migration 39 exists in source | **VERIFIED** | There are 39 migration directories; the latest is `apps/api/backend/prisma/migrations/20260729210000_stripe_connected_account_payout_reconciliation_v1/migration.sql`. |
| Migration 39 applied | **EXTERNAL CONFIGURATION REQUIRED** | The supplied checkpoint says it is applied, but repository inspection cannot prove database migration state. No database was queried or modified. |
| 140 integration tests passed | **EXTERNAL CONFIGURATION REQUIRED** | Accepted as supplied checkpoint only. The repository contains integration suites under `apps/api/backend/test/*.integration.test.js`, but no immutable result artifact for the stated 140-run was found; tests were not rerun because `test:integration` invokes `prisma migrate deploy`. |
| Four GitHub checks passed | **EXTERNAL CONFIGURATION REQUIRED** | Accepted as supplied checkpoint only; GitHub check-run evidence is not stored in the repository. |
| PR merged and deployed to staging; staging healthy | **EXTERNAL CONFIGURATION REQUIRED** | `origin/main` contains the commit and `DEPLOYMENT.md` documents staging health routes, but deployment and live health state are external and were not queried. |
| Initial worktree | **VERIFIED** | `git status --short` was empty before this audit. |

## Evidence-backed readiness matrix

| Area | Classification | Priority | Repository evidence and finding |
|---|---|---:|---|
| Production API/web process | **PARTIAL** | P0 | PM2 definitions and ports exist in `ecosystem.config.cjs`; health/readiness and graceful shutdown exist in `apps/api/backend/src/app.js` and `src/server.js`. This is a single-process runbook, not evidence of a production platform, HA, TLS termination, or rollback validation. |
| Database | **PARTIAL** | P0 | PostgreSQL/Prisma source and 39 migrations exist in `apps/api/backend/prisma`; `/ready` queries the DB in `src/app.js`. Capacity, production isolation, migration state, encryption, connection limits, and recovery are external. |
| Redis | **MISSING** | P2 | `redis` is a dependency and the system page reports whether a URL is configured, but no Redis-backed runtime client/cache/queue/session implementation or documented `REDIS_URL` exists. V1 must not depend on Redis. |
| Durable storage | **MISSING** | P0 | Prisma stores image/document URL strings (`schema.prisma`: `images`, `documentUrls`); web calls `/uploads` in `apps/web/src/services/uploads.ts`, but no upload router is mounted in `src/app.js`. No S3/object-store configuration, signed access, retention, malware scan, or deletion policy was found. |
| Domain and HTTPS | **EXTERNAL CONFIGURATION REQUIRED** | P0 | `scripts/check-domain-readiness.sh` checks DNS and `https://api.pawnloop.com/api/health`; repository cannot prove DNS, certificates, redirects, HSTS at the edge, or current availability. |
| Transactional email | **PARTIAL** | P0 | `transactionalEmail.service.js` supports SMTP and production-fails without `SMTP_HOST`; verification/reset routes exist. The production env file does not contain SMTP/email variable names, and deliverability, SPF/DKIM/DMARC, bounce handling, and sender identity are unverified. |
| Backups and restore | **PARTIAL** | P0 | `scripts/backup-db.sh` creates custom dumps; `scripts/restore-db.sh` has explicit and production-specific confirmation; `check-prod-preflight.sh` requires a non-empty production-named dump. Existing dumps do not prove freshness, encryption, off-host retention, scheduled execution, or a successful restore drill. |
| Deployment/rollback | **PARTIAL** | P0 | `DEPLOYMENT.md`, `check-prod-preflight.sh`, `check-prod-smoke.sh`, and `ecosystem.config.cjs` exist. The rollback procedure uses `git checkout` and lacks owner, timing, data compatibility, traffic rollback, and tested evidence. |
| Registration/login | **PARTIAL** | P0 | Public registration allows only `CONSUMER`/`OWNER`, hashes with bcrypt cost 12, and requires verified email (`auth.controller.js`, `auth.routes.js`). There is no invite-only enrollment gate or login/registration throttling. |
| Email verification/reset | **VERIFIED** | P1 | Random 32-byte tokens are SHA-256 digested, expiring, one-time, and replaced transactionally in `accountActionToken.service.js`; password reset increments `authVersion`; covered by `test/auth.integration.test.js`. Delivery configuration remains external. |
| Password policy | **VERIFIED** | P1 | 12–128 characters, placeholder rejection, email-derived rejection in `passwordPolicy.service.js`; tested by `test/passwordPolicy.service.test.js`. |
| Session security | **PARTIAL** | P0 | JWTs include `authVersion`, verify user activity on each request, expire by `JWT_EXPIRES_IN`, and password reset invalidates prior tokens (`middleware/auth.js`, `auth.controller.js`). Web bearer tokens are stored in `localStorage` (`apps/web/src/services/auth.ts`); no server-side session inventory, logout revocation, refresh-token rotation, device review, or CSP-specific XSS validation exists. |
| MFA | **MISSING** | P1 | No TOTP/WebAuthn/recovery-code implementation or tests were found. Require MFA for ADMIN and SUPER_ADMIN before public launch. |
| Rate limiting/abuse | **MISSING** | P0 | `express-rate-limit` is installed but unused. Public auth, password reset, inquiries, bidding, offers, reservation, checkout, and webhooks lack repository-defined throttles or distributed abuse controls. |
| Authorization boundaries | **PARTIAL** | P0 | Global role guards exist in `middleware/auth.js`; owner approval is enforced; shop capabilities are in `shopAccess.service.js`, `shopAccess.js`, and `staffAccess.middleware.js`; representative tests include `ownerApproval.middleware.test.js`, `shopAccess.service.test.js`, and `auctionStaffRouteEnforcement.test.js`. Full negative cross-tenant coverage is not established across every route. |
| CORS | **PARTIAL** | P0 | Allow-list support and credentialed CORS exist in `src/app.js`. An empty allow-list permits every origin, so production must fail closed and actual origin values must be verified. |
| CSRF | **PARTIAL** | P1 | API auth is normally an Authorization bearer token, which reduces classic CSRF exposure. Middleware also reads cookies, while no CSRF token/origin enforcement or documented cookie attributes exist (`middleware/auth.js`). Remove undocumented cookie fallback or add explicit CSRF controls. |
| Security headers | **PARTIAL** | P1 | Helmet and production CSP defaults are enabled in `src/app.js`; edge TLS/HSTS policy and a tested CSP compatible with Stripe are not proven. |
| Secrets | **PARTIAL** | P0 | Real env files are gitignored and `check-prod-readiness.sh` checks tracked envs and direct `process.env` logging. Numerous local backup env files exist; storage permissions, rotation, secret manager usage, history scanning, and incident response are not documented. |
| Upload security | **MISSING** | P0 | CSV upload uses memory storage and a size/type filter in `inventoryBulk.routes.js`; general image/document upload endpoints and private access controls are absent. No magic-byte validation, malware scanning, EXIF stripping, signed URLs, or authorization tests exist. |
| Stripe checkout/payments | **PARTIAL** | P0 | Server-created PaymentIntents, signed raw-body webhook route, and success/failure transitions exist in `stripe.controller.js`, `marketplaceTransactionPayment.service.js`, and webhook tests. Live keys, dashboard endpoint selection, event subscriptions, payment methods, tax, statement descriptor, and live-mode smoke are external. |
| Subscriptions | **PARTIAL** | P0 | Checkout and customer/subscription/invoice lifecycle code exists in `stripeSubscriptionPrice.service.js`, `stripeSubscriptionWebhook.service.js`, controller cases, and corresponding service/integration tests. Product/price catalog and portal/cancellation operations require production verification. |
| Commissions/reconciliation | **PARTIAL** | P0 | Commission and seller proceeds logic exists in `revenue/settlementRevenue.service.js`, seller ledger services, and tests. There is no documented daily Stripe-to-database reconciliation job, exception queue, close procedure, or operator sign-off. |
| Connect onboarding | **PARTIAL** | P0 | Account creation/linking and `account.updated` synchronization exist in `stripeConnect.service.js`, `shopFinanceConnect.controller.js`, and tests. Production Connect platform settings, capabilities, KYC handling, return URLs, and restricted-account operations are external. |
| Refunds/disputes | **PARTIAL** | P0 | Idempotent refund requests, signed lifecycle events, immutable audit events, compensating ledger entries, and dispute reinstatement exist in `stripeRefundDispute.service.js` and its service/integration tests. Only authenticated roles guard `/stripe/refunds`; operational approval limits and case tooling are incomplete. |
| Payouts | **PARTIAL** | P0 | Balance reservation, admin processing, Stripe transfer idempotency, history, and connected bank-payout reconciliation exist under `services/payouts`, `shopFinance.controller.js`, and tests. Production secrets/events, negative-balance recovery, review thresholds, reconciliation, and failure runbooks remain required. |
| Connect payout webhook | **PARTIAL** | P0 | `/api/webhooks/stripe/connect` uses only `STRIPE_CONNECT_WEBHOOK_SECRET` and accepts `payout.created`, `payout.updated`, `payout.paid`, `payout.failed` in `stripeWebhook.routes.js` and `stripe.controller.js`; idempotent/out-of-order persistence is in `stripeConnectedAccountPayout.service.js` and tests. The production env file does not contain the variable name, and Stripe endpoint/event configuration is external. |
| Buyer onboarding/permissions | **PARTIAL** | P1 | Consumer registration, verification, dashboards, bids, offers, purchases, watchlist, saved searches, and buyer plans exist in routes/pages. No invite gate, safety education acceptance, or complete browser E2E journey exists. |
| Owner onboarding/permissions | **PARTIAL** | P0 | Owner applications start `PENDING`; approval is enforced before owner routes; application review/history/response migrations, controllers, pages, and integration tests exist. Business verification, licensing/compliance documents, manual checklist, and suspension runbook are incomplete. |
| Staff onboarding/permissions | **PARTIAL** | P1 | Staff records, role labels, permission configuration, middleware, UI, and tests exist (`config/shopPermissions.js`, staff routes/tests). Invitation acceptance, email verification, credential lifecycle, and exhaustive least-privilege E2E evidence are incomplete. |
| ADMIN/SUPER_ADMIN | **PARTIAL** | P0 | Admin and Super Admin routes are guarded; Super Admin mutations are audited in `superAdmin.routes.js` and `superAdminAudit.service.js`; privileged users can only be created by SUPER_ADMIN. MFA, break-glass policy, dual approval for money movement, and comprehensive audit coverage are absent. |
| Fixed-price purchases | **PARTIAL** | P0 | Listing reservation, PaymentIntent, payment webhooks, expiry scheduler, cancellation and fulfillment transitions exist in marketplace transaction services/controllers and integration suites. Inventory concurrency and fulfillment E2E exist, but production money-path validation is external. |
| Auctions/offers | **PARTIAL** | P0 | Auction scheduling, bid/auto-bid, offer/counter/cancel, winner settlement, and authorization routes/tests exist. Operational auction cancellation, fraud review, bidder abuse controls, and full public E2E evidence remain incomplete. |
| Pickup/shipping | **PARTIAL** | P1 | Marketplace transaction fulfillment models/routes/pages and `marketplaceTransactionFulfillment.integration.test.js` cover status workflows. No carrier integration, label/tracking verification, loss/damage procedure, SLA, address validation, or shipping policy is established. |
| Legal/policies | **MISSING** | P0 | `/terms` and `/privacy` exist in `App.tsx`, and registration records policy versions. Both pages explicitly say “Draft for legal review”; `LEGAL.md` says seller, buyer, auction, refund/dispute policies are future documents. Legal identity/contact details are incomplete in the page copy. |
| Logging/monitoring/alerts | **MISSING** | P0 | Morgan logs and request IDs exist; health/readiness endpoints exist; selected Super Admin mutations are audited. No centralized log destination, redaction standard, metrics/APM, error tracker, uptime monitor, paging, alert thresholds, retention, or on-call ownership is documented. |
| Audit history | **PARTIAL** | P1 | Super Admin mutation audit and owner-application/refund/dispute/payout event history exist. Authentication events, admin actions outside Super Admin, read access to sensitive data, exports, and retention/tamper controls are not comprehensively audited. |
| Incident response | **MISSING** | P0 | No incident severity model, contacts, containment/rotation steps, payment incident playbook, breach procedure, status communication, or postmortem template was found. |
| Mobile responsiveness | **PARTIAL** | P1 | Web styles contain responsive media queries and the app has role pages; no viewport matrix or current screenshot/device test report establishes coverage. Native mobile under `apps/mobile` is outside public web V1. |
| Accessibility | **PARTIAL** | P1 | Source contains semantic/ARIA/focus patterns, including legal navigation and labeled controls. No automated axe suite, keyboard/screen-reader audit, contrast report, captions policy, or WCAG acceptance record exists. |
| Browser compatibility | **MISSING** | P1 | Playwright config and marketplace specs exist, but no documented Chrome/Firefox/WebKit matrix or supported-browser policy was found. Camera code explicitly supplies manual fallback. |
| Performance | **MISSING** | P1 | Static asset caching and payload limits exist in `src/app.js`. No load test, Core Web Vitals budget, API latency/error-rate SLO, DB query review, capacity plan, or production bundle budget is documented. |
| End-to-end coverage | **PARTIAL** | P1 | Nine marketplace Playwright spec files cover buy-now, checkout, fulfillment, seller listings, scanner entry, navigation, and owner review. No full role/payment/refund/dispute/payout cross-browser E2E suite or immutable launch report exists. |
| Support/moderation | **MISSING** | P0 | Admin support/risk/audit pages exist, but `AdminOverviewPage.tsx` explicitly recommends “real support tickets” and risk records. No prohibited-item report route/model, case queue, SLA, escalation, evidence retention, or user appeal flow was found. |
| Shop suspension | **PARTIAL** | P0 | Admin owner suspension/action controls exist in `admin.controller.js` and shop soft-delete/moderation controls exist. No safety runbook, notification/appeal process, payout hold logic, or tested end-to-end suspension effect is established. |
| Analytics/beta controls | **MISSING** | P0 | Admin KPI pages exist, but no event pipeline, consent configuration, launch dashboard, invite cohort controls, feature-flag kill switches, or beta feedback/exit process is proven. |

## P0 findings

1. **P0 — MISSING:** No invite-only admission mechanism; public `POST /api/auth/register` remains open.
2. **P0 — MISSING:** No applied rate limiting or abuse protection on authentication and transactional routes.
3. **P0 — MISSING:** No durable image/document upload service or sensitive-file authorization.
4. **P0 — MISSING:** Terms and Privacy are marked draft; marketplace agreements/policies are absent.
5. **P0 — MISSING:** No production monitoring, alerting, on-call ownership, or incident response plan.
6. **P0 — MISSING:** No operational support/prohibited-item reporting/moderation/dispute case system.
7. **P0 — EXTERNAL CONFIGURATION REQUIRED:** Production domain/HTTPS, database, email, Stripe, Connect, backups, deployment, and health must be independently evidenced.
8. **P0 — EXTERNAL CONFIGURATION REQUIRED:** Configure a separate Connect webhook secret and connected-account endpoint for the four required payout events.
9. **P0 — PARTIAL:** Production preflight omits `STRIPE_CONNECT_WEBHOOK_SECRET`, SMTP, storage, monitoring, and several safety assertions.
10. **P0 — PARTIAL:** Authorization is broad and meaningful but lacks exhaustive negative cross-tenant testing.
11. **P0 — PARTIAL:** JWT localStorage exposure and absent explicit logout revocation leave session risk.
12. **P0 — PARTIAL:** Money-moving flows lack reconciliation, approval thresholds/dual control, exception queues, and operator runbooks.
13. **P0 — PARTIAL:** Backup scripts/dumps exist, but no current encrypted off-host backup and timed restore-drill evidence.
14. **P0 — PARTIAL:** Owner/shop suspension and onboarding need compliance verification and operational enforcement.
15. **P0 — MISSING:** No controlled beta telemetry, cohort management, kill switches, or feedback/exit process.

## P1 findings

1. **P1 — MISSING:** MFA for ADMIN and SUPER_ADMIN.
2. **P1 — PARTIAL:** CSRF/cookie posture and production CSP/TLS header policy need explicit validation.
3. **P1 — PARTIAL:** Staff invitation/verification and comprehensive least-privilege testing.
4. **P1 — PARTIAL:** Authentication, admin, and sensitive-read audit coverage and retention.
5. **P1 — PARTIAL:** Pickup/shipping policy, tracking, loss/damage, cancellation, and SLA operations.
6. **P1 — MISSING:** Cross-browser acceptance matrix.
7. **P1 — PARTIAL:** WCAG 2.2 AA automated and manual accessibility evidence.
8. **P1 — MISSING:** Performance/load/SLO/capacity evidence.
9. **P1 — PARTIAL:** Complete role and money-path E2E evidence, including failure/retry paths.
10. **P1 — PARTIAL:** Email reputation, bounce/complaint handling, and user-facing support contact.

## P2 findings and post-launch candidates

- **DEFERRED POST-LAUNCH (P2):** Native iOS/Android launch (`apps/mobile`).
- **DEFERRED POST-LAUNCH (P2):** Redis adoption while no V1 runtime behavior depends on it.
- **DEFERRED POST-LAUNCH (P2):** Advanced analytics, advertising, and personalization beyond operational launch metrics.
- **DEFERRED POST-LAUNCH (P2):** Carrier-label automation; controlled manual shipping may be used only after policy and operational gates.
- **DEFERRED POST-LAUNCH (P2):** New external inventory/POS integrations beyond already-supported, security-reviewed paths.
- **DEFERRED POST-LAUNCH (P2):** Additional subscription tiers, pricing experiments, and large marketplace feature additions.

## External configuration checklist

Evidence must be screenshots/exports or dated command output with values redacted; existence of an env-variable hook is not proof.

- [ ] Production API/web deployment identifies commit `35b8430`, immutable artifact, owner, region, scaling/restart policy, and rollback target.
- [ ] Production database is isolated, encrypted, access-restricted, capacity-reviewed, at migration 39, and observed by `/api/ready`.
- [ ] Root, `www`, and API DNS resolve correctly; valid HTTPS certificates, HTTP redirects, modern TLS, HSTS, and renewal monitoring pass.
- [ ] Exact production CORS and Socket.IO origins are allow-listed; empty/wildcard behavior is rejected.
- [ ] SMTP provider and `EMAIL_FROM` are configured; SPF, DKIM, DMARC, verification/reset delivery, bounce, and complaint flows pass.
- [ ] Stripe live-mode platform/account settings, approved payment methods, products/prices, tax decision, statement descriptor, support contacts, and restricted-key ownership are reviewed.
- [ ] Platform webhook `/api/webhooks/stripe` has a unique signing secret and all implemented payment, subscription, invoice, refund, dispute, transfer, and account events required by the launch scope.
- [ ] Connected-account webhook `/api/webhooks/stripe/connect` has a **separate** `STRIPE_CONNECT_WEBHOOK_SECRET`, is configured for events on connected accounts, and subscribes to exactly at least: `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`.
- [ ] Webhook retries, duplicate events, out-of-order events, endpoint failure alerting, and replay procedure are tested in Stripe test mode.
- [ ] Object storage bucket/provider, encryption, private/public separation, signed URLs, retention/deletion, CORS, malware scanning, and lifecycle policy are configured.
- [ ] Central logs, error tracking, metrics, uptime checks, alert thresholds, paging destination, redaction, retention, and dashboard owners are configured.
- [ ] Current encrypted production backup is stored off host; schedule/retention are enabled; a restore into an isolated environment meets RPO/RTO.
- [ ] Secrets are in an access-controlled secret manager, rotated, scanned from Git history and local deployment artifacts, and have named owners.
- [ ] Support email/help path, legal contact, privacy contact, escalation contacts, and business hours are published.

## Security and privacy findings

Strengths include bcrypt hashing, non-enumerating reset/resend responses, one-time digested action tokens, email verification before login, `authVersion` revocation, active-user checks, owner approval middleware, role/shop capability guards, Helmet, request IDs, production error masking, CORS allow-list support, raw-body Stripe signature verification, encrypted integration credentials, and selected immutable audit records.

The beta security gate nevertheless fails. Apply rate limits and abuse detection; gate registration by invite; move away from long-lived bearer tokens in localStorage or document and mitigate the XSS risk with short lifetimes/rotation and a validated CSP; remove or secure cookie token fallbacks; add MFA to privileged accounts; verify every tenant-scoped mutation/read with negative tests; define log redaction and audit retention; add secure upload handling; perform dependency/SAST/secret scans; and establish incident response.

Privacy cannot be approved while `PrivacyPage.tsx` remains a draft and leaves legal contact/final practices unresolved. Before processing identity, payment, dispute, analytics, or uploaded-document data, approve data categories/purposes, processors, retention, deletion/export, access controls, breach handling, minors/geography, cookie practices, and shop/controller responsibilities.

## Money-moving workflow matrix

| Workflow | Code state | Controls present | Required gate |
|---|---|---|---|
| Fixed-price purchase | **PARTIAL / P0** | Reservation, PaymentIntent, signed success/failure webhook, idempotent finalization, expiry release; marketplace transaction services and integration tests. | Live-mode test, amount/fee reconciliation, refund/cancel rules, fulfillment exception runbook, alerts. |
| Auction settlement | **PARTIAL / P0** | Bid/auction close creates settlement; PaymentIntent; webhook changes `PENDING` to `CHARGED`; settlement ledger credit. | End-to-end concurrency and failure drill, operator cancellation, reconciliation and support procedure. |
| Offers | **PARTIAL / P0** | Create/counter/accept/reject/cancel routes with buyer/owner roles; offer-backed settlements migration/tests. | Abuse controls, inventory race E2E, expiry/cancellation policy and operator tooling. |
| Seller subscriptions | **PARTIAL / P0** | Stripe Checkout, price validation, subscription/invoice event synchronization, service/integration tests. | Live product/price mapping, cancellation/failed-payment/customer-portal acceptance, reconciliation. |
| Buyer subscriptions | **PARTIAL / P1** | Buyer plans/lifecycle service and Super Admin UI. | Confirm public V1 necessity; otherwise freeze as beta-disabled. If enabled, complete live lifecycle E2E and policies. |
| Commissions/ledger | **PARTIAL / P0** | Versioned pricing rules, settlement revenue calculation, immutable seller credits/debits, tests. | Approved fee schedule, accounting review, daily reconciliation, mismatch queue, close/report ownership. |
| Owner payout request | **PARTIAL / P0** | Available-balance checks, minimum, idempotency key, reserved debit, cancellation, admin process, Stripe transfer idempotency. | Dual control/thresholds, payout hold rules, negative balance recovery, retry/manual review procedure. |
| Connected bank payout | **PARTIAL / P0** | Separate signed webhook; four payout events; event deduplication, ordering guard, shop mapping, history. | Separate production secret, connected-event endpoint, alerts for unmatched accounts/failures, dashboard reconciliation. |
| Refund | **PARTIAL / P0** | Admin request route, request and Stripe idempotency, amount bounds, audit events, seller debit, webhook updates. | Role/approval matrix, reason taxonomy, customer communications, post-transfer recovery, reconciliation. |
| Dispute/chargeback | **PARTIAL / P0** | Created/updated/withdrawn/reinstated/closed events; case records and compensating ledger entries. | Evidence submission/case ownership, deadlines/alerts, payout holds, negative balance and loss policy. |
| Customer sells/offline payment | **PARTIAL / P1** | Intake/inspection/revised-price/return and CASH/SHOP_CHECK workflows. | Explicitly separate from online Stripe commerce; shop compliance, receipt, audit, and operating policy. |

## Production launch gates

Every P0 must be closed with dated evidence. A production launch additionally requires:

1. Approved scope freeze and named release owner.
2. Clean immutable build from the approved commit; tests/checks and migration state recorded.
3. Production dependency checklist complete without exposed values.
4. Reviewed legal agreements and operational policies published at versioned routes.
5. Security review closes rate limiting, invite control, upload security, authorization, session posture, privileged access, and secret handling.
6. All enabled money paths pass test-mode and controlled production smoke/reconciliation with rollback and refund capability.
7. Monitoring, alerting, support, moderation, incident response, and backup restore are exercised.
8. Accessibility, browser, responsive, performance, and critical-path E2E acceptance are signed off.
9. Go/no-go, rollback, and 24–72 hour launch monitoring schedule have named owners.

## Invite-only beta entry criteria

- All P0 findings closed; P1 items may remain only with a named owner, due date, documented workaround, and no material security, money, legal, or data risk.
- Registration is invite-only and revocable; cohort size and participating shops are capped.
- Limit geography, categories, transaction amounts, shipping modes, and payout amounts; publish the limits.
- Only workflows with complete operational owners and test evidence are enabled. Disable unsupported subscriptions, shipping, uploads, or other paths at both UI and API.
- At least two approved shops and representative buyer/staff/admin accounts complete rehearsal journeys.
- Support, prohibited-item reports, refund/dispute/payout escalation, shop suspension, and incident contacts are staffed for beta hours.
- Daily transaction/Stripe/ledger reconciliation and daily error/feedback review are mandatory.
- Backup restore drill and rollback rehearsal meet declared RPO/RTO.
- Beta exit/stop criteria include security incident, unexplained money mismatch, webhook backlog, data loss, or support SLA breach.

## General public launch entry criteria

- Invite-only beta criteria remain continuously met and all P1 findings are closed.
- A stable beta observation period demonstrates no unresolved P0/P1 incidents or unexplained financial mismatches.
- MFA is enforced for privileged users; accessibility achieves WCAG 2.2 AA acceptance; Chrome/Firefox/Safari/Edge and target mobile viewports pass.
- Load/capacity and Core Web Vitals/API SLO budgets pass at expected public traffic plus headroom.
- Legal counsel approves all agreements and geography/category/compliance constraints.
- Support/moderation/dispute coverage and SLAs can handle projected volume.
- Production backup, restore, incident, Stripe failure, webhook replay, and rollback drills are current.

## Ordered implementation plan

1. Freeze V1 and disable every workflow that cannot meet a launch gate.
2. Implement invite issuance/redemption/revocation and close public registration for beta.
3. Apply fail-closed, distributed rate limits and abuse controls to auth and transactional endpoints.
4. Add durable object storage and secure image/document upload/download controls with validation, scanning, retention, and tests.
5. Complete legal counsel review and publish versioned Terms, Privacy, Seller Agreement, Buyer Terms, Auction Rules, Refund/Dispute, Prohibited Items, Shipping/Pickup, and support contacts.
6. Close authorization/session risks: exhaustive tenant-negative tests, privileged MFA, token lifecycle/logout decision, explicit CSRF/cookie posture, and CSP validation.
7. Establish money operations: approval matrix, payout holds/limits, refund/dispute cases, daily reconciliation, exception queues, alerts, and runbooks.
8. Configure and evidence production email, Stripe platform webhook, separate Connect payout webhook, object storage, database, domain/TLS, and secret manager.
9. Configure centralized observability and audit coverage; rehearse incident response, webhook replay, rollback, backup, and isolated restore.
10. Build critical role/money E2E coverage across supported browsers; complete responsive, WCAG, and performance/load acceptance.
11. Run a capped rehearsal, enter invite-only beta, review daily, and close all P1 findings before public launch.

## Areas not verifiable from the repository

PR review/check state; staging or production deployment state and health; applied database migrations; actual environment-variable values; database contents; DNS/TLS/CDN/WAF state; SMTP delivery and domain authentication; Stripe keys, products, prices, balances, webhooks, connected accounts, disputes, payouts, and live-mode settings; object storage; centralized logs/metrics/alerts; backup encryption/off-host retention/restore success; cloud IAM/network controls; support staffing; legal approval; accessibility assistive-technology results; real device/browser behavior; and production performance/capacity.

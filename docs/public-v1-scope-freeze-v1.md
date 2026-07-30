# PawnLoop Public Web V1 Scope Freeze

Effective checkpoint: `35b8430d38e6ad165ecf994da521fbfed92e7bad`
Applies to: invite-only web beta and subsequent general public web launch

## Features included in public web V1

Only the following existing web capabilities may enter V1, and only after their applicable launch gates are satisfied:

- Consumer account registration under invite control, email verification, login, password reset, profile/session access, and legal-consent recording.
- Owner application, review, applicant response/resubmission, approval, onboarding, shop/location setup, and suspension.
- Shop staff records and existing capability-based access for approved shops.
- Public shop, inventory, marketplace listing, and auction discovery.
- Owner inventory intake, manual item/listing management, supported CSV import, and existing scanning/manual-code workflows.
- Fixed-price listing reservation, Stripe card payment, pickup or explicitly supported shipping fulfillment, cancellation, receipt/history, and refund handling.
- Auctions, bidding/auto-bidding, winner settlement, payment, and fulfillment.
- Offers, counters, acceptance/rejection/cancellation, settlement, payment, and fulfillment.
- Seller subscriptions and commission rules only when the production Stripe catalog and complete lifecycle are verified.
- Stripe Connect owner onboarding, seller ledger/balance, controlled payout request/review, transfer, and connected bank-payout reconciliation.
- Admin/SUPER_ADMIN user, shop, owner-application, inventory, auction, offer, settlement, subscription, pricing, revenue, audit, and system controls that are backed by server enforcement.
- Versioned Terms, Privacy, Seller Agreement, Buyer Terms, Auction Rules, Refund/Dispute, Prohibited Items, Pickup/Shipping, and support policies.
- Operational health/readiness, backups/restore, logging/monitoring/alerting, audit, support/moderation, incident response, and reconciliation required to operate the above.

An item appearing in a page, navigation entry, schema, or service does not place it in the enabled V1 scope. It must also meet its security, legal, operational, external-configuration, and test gates.

## Required launch blockers

These are scope completion, not opportunities to add adjacent features:

### Before invite-only beta

- Add enforceable invite-only registration and cohort controls.
- Apply rate limiting/abuse controls to auth and transaction-sensitive routes.
- Provide durable, access-controlled image/document storage and secure uploads, or disable all workflows that require uploads.
- Obtain legal approval and publish complete versioned marketplace policies and contact details.
- Prove production/staging database, domain/HTTPS, email, Stripe, Connect webhook, storage, deployment, secret, and health configuration without exposing values.
- Configure the separate connected-account webhook secret `STRIPE_CONNECT_WEBHOOK_SECRET` and subscribe its connected-account endpoint to `payout.created`, `payout.updated`, `payout.paid`, and `payout.failed`.
- Establish centralized monitoring/alerting, incident response, current off-host backups, and a successful isolated restore/rollback drill.
- Establish staffed support, prohibited-item reporting, moderation, dispute/refund/payout escalation, shop suspension, and daily money reconciliation.
- Close cross-tenant authorization, session/token, CORS/CSRF, secret-handling, upload, and privileged-access security findings necessary for a controlled beta.
- Complete critical buyer, owner, staff, admin, and SUPER_ADMIN rehearsal journeys for every enabled workflow.

### Before general public launch

- Close every P1 in `docs/public-launch-readiness-audit-v1.md`.
- Enforce MFA for ADMIN and SUPER_ADMIN.
- Complete WCAG 2.2 AA acceptance, supported browser/device matrix, and responsive validation.
- Meet documented performance, load, availability, latency, and error-rate budgets.
- Complete end-to-end success, failure, retry, duplicate, cancellation, refund, dispute, payout, and recovery tests.
- Demonstrate a stable capped beta with no unexplained financial mismatch or unresolved P0/P1 incident.
- Confirm support/moderation capacity and all legal/compliance/geographic constraints for public volume.

## Explicit post-launch deferrals

The following are excluded from public web V1 and must not delay launch after all P0/P1 gates are met:

- Native iOS and Android release work under `apps/mobile`.
- Redis adoption unless a later approved design makes it a launch dependency.
- New major marketplace modes, lending/redemption systems, escrow products, or multi-party payment architecture beyond the frozen flows.
- New subscription tiers, complex promotions, loyalty/rewards, advertising, or pricing experiments.
- Automated carrier purchase/label workflows beyond a safely operated V1 fulfillment process.
- Additional POS/vendor integrations and broad integration marketplace work.
- Advanced BI, personalization, recommendations, and marketing automation beyond launch operations and required consent.
- International launch, new currencies, multilingual expansion, or new regulated jurisdictions.
- Cosmetic redesigns and large navigation changes not required for accessibility or blocker remediation.

Deferred features must be hidden or disabled at both API and UI when partial code could expose them.

## Change-control rule

Until public launch, no new large feature, role, payment type, marketplace mode, integration, jurisdiction, or redesign may enter the launch branch.

A change is admissible only when it:

1. closes a documented P0/P1 launch finding;
2. fixes a defect or security/privacy/accessibility issue in frozen V1;
3. supplies tests, documentation, observability, policy, or external configuration required by a launch gate; or
4. removes/disables unsafe or out-of-scope behavior.

Each proposed change must cite the exact audit finding, remain the smallest safe change, identify affected roles and money/data paths, include proportional tests and rollback notes, and be approved by the release owner. Anything else is moved to a post-launch backlog. A new requirement that materially expands scope requires an explicit scope-freeze revision and launch-date/risk review; it may not be smuggled in as a blocker.

## Definition of done: invite-only beta

Beta is done only when:

- The release commit and immutable artifact are recorded; worktree/build provenance and required checks are clean.
- All P0 findings in the readiness audit are closed with dated evidence.
- Registration is invite-only, revocable, capped, and tested.
- Enabled categories, geography, shops, users, transaction limits, shipping modes, subscription modes, and payout limits are documented and enforced.
- Every enabled buyer/owner/staff/admin/SUPER_ADMIN path has passed a rehearsal, including failure and recovery.
- Stripe platform and separate Connect webhooks are signed, monitored, replay-tested, and reconciled; unexplained money variance is zero.
- Legal policies are approved, versioned, linked, and consented to.
- Support, moderation, prohibited-item reporting, dispute/refund/payout handling, suspension, incident, and escalation owners are scheduled.
- Monitoring and alerts are live; backup, restore, rollback, and incident drills meet declared RPO/RTO.
- Exit criteria and kill/disable procedures are documented, and daily beta review is assigned.
- Remaining P1 findings have a named owner, due date, safe beta workaround, and explicit release-owner acceptance.

## Definition of done: general public launch

Public launch is done only when:

- Beta definition of done remains satisfied.
- Every P1 finding is closed with dated evidence.
- The controlled beta observation period meets the agreed reliability, support, security, and financial-reconciliation thresholds.
- Privileged MFA, complete audit coverage, legal/compliance approval, WCAG acceptance, browser/device coverage, and performance/capacity targets pass.
- All production external-configuration checks are independently verified immediately before launch.
- Go/no-go, rollback authority, on-call schedule, support coverage, and the first 72-hour monitoring plan are approved.
- No unresolved P0/P1 defect, security exception, legal exception, data-loss risk, or unexplained financial mismatch remains.

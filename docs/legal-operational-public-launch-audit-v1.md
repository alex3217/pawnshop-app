# PawnLoop Legal and Operational Public-Launch Readiness Audit V1

Audit date: 2026-08-13

Branch: `audit/legal-operational-readiness-v1`

Starting `origin/main`: `1d7def4a164b3733d2fe2624686678dad7774ad3`

Scope: repository evidence only; no external systems or databases were accessed.

## Decision

**NOT READY FOR UNRESTRICTED PUBLIC LAUNCH.** This is an engineering and operational issue-spotting audit, not legal advice or a claim of compliance. All unresolved legal conclusions are **PENDING COUNSEL REVIEW**. External configuration and staffing are unverified.

Classifications: `PRESENT`, `PARTIAL`, `MISSING`, or `EXTERNAL EVIDENCE REQUIRED`.

## Legal implementation inventory

| # | Area | State | Repository evidence and gap |
|---:|---|---|---|
| 1 | Terms of Service | PARTIAL | Public `/terms` route and `TermsPage.tsx`; dated July 28, 2026 and visibly “Draft for legal review.” Broad clauses exist, but approval, final entity/contact/dispute terms, scope alignment, and publishing controls are **PENDING COUNSEL REVIEW**. |
| 2 | Privacy Policy | PARTIAL | Public `/privacy` route and `PrivacyPage.tsx`; dated and visibly draft. It describes many data categories/providers/rights generally, but final contacts, state notices, roles, actual data map, rights workflow, retention, and practices are **PENDING COUNSEL REVIEW**. |
| 3 | Cookie/tracking disclosures | MISSING | Privacy copy discusses device/usage information, but no dedicated cookie notice, tracker inventory, preference center, consent/opt-out state, or GPC handling was found. **PENDING COUNSEL REVIEW**. |
| 4 | Registration consent | PARTIAL | Required checkbox links Terms/Privacy. Client/API require exact `2026-07-28` versions; backend creates a legal-consent record with request context and tests cover it. Documents remain drafts; no material-change re-consent workflow. **PENDING COUNSEL REVIEW**. |
| 5 | Checkout/payment consent | PARTIAL | Saved-payment setup requires a versioned authorization and persists consent evidence. Marketplace checkout exposes prices/actions, but no reviewed marketplace-sale terms checkbox/versioned transaction acceptance was found. **PENDING COUNSEL REVIEW**. |
| 6 | Seller agreement | MISSING | Generic Terms provisions only; `LEGAL.md` lists Seller Agreement as future work. **PENDING COUNSEL REVIEW**. |
| 7 | Pawnshop/merchant agreement | MISSING | Owner application/approval and shop tooling exist, but no merchant contract/acceptance/version evidence. **PENDING COUNSEL REVIEW**. |
| 8 | Auction terms | MISSING | Generic Terms auction clauses and extensive auction behavior exist; no standalone/versioned auction rules or bid-time acceptance. **PENDING COUNSEL REVIEW**. |
| 9 | Marketplace sale terms | MISSING | Generic Terms purchase/fulfillment clauses only; no reviewed buyer/sale terms tied to reservation/checkout. **PENDING COUNSEL REVIEW**. |
| 10 | Sell/pawn submission terms | MISSING | Product supports buyer item submissions and shop intake; no submission-specific acknowledgement distinguishing estimate, sale, and pawn transaction. **PENDING COUNSEL REVIEW**. |
| 11 | Prohibited/restricted items | PARTIAL | Draft Terms prohibit broad categories; no operational category matrix, regulated-product rules, report route, or enforcement workflow. **PENDING COUNSEL REVIEW**. |
| 12 | Stolen-property reporting | PARTIAL | Draft policies mention detection/disclosure and source concepts mention suspicious/stolen review; no public reporting route, case workflow, preservation/notification procedure, or jurisdiction matrix. **PENDING COUNSEL REVIEW**. |
| 13 | Refund/return/cancellation/dispute | PARTIAL | Code tracks reservations, refunds and Stripe disputes; generic draft Terms apply. No complete public policy or approved allocation, eligibility/timing, shipping/pickup, evidence, appeal, or support process. **PENDING COUNSEL REVIEW**. |
| 14 | Subscription billing/cancellation | PARTIAL | UI shows plan/billing state, renewal/cancellation timing, portal and cancel-at-period-end controls; Stripe lifecycle exists. No reviewed auto-renewal disclosure/consent/confirmation matrix by jurisdiction. **PENDING COUNSEL REVIEW**. |
| 15 | Account deletion | MISSING | Privacy draft describes requests generally; no self-service or documented verified manual end-to-end deletion workflow was found. **PENDING COUNSEL REVIEW**. |
| 16 | Data export | MISSING | Operational/admin CSV exports are not a data-subject export workflow; no verified user export process exists. **PENDING COUNSEL REVIEW**. |
| 17 | Data retention | MISSING | Privacy draft uses general retention language; no approved schedule, dataset triggers, automation, backup deletion, exception, or evidence process. **PENDING COUNSEL REVIEW**. |
| 18 | Children/minimum age | PARTIAL | Terms require legal capacity/applicable age but specify no minimum; registration has no age gate. Requirements are **PENDING COUNSEL REVIEW**. |
| 19 | Electronic communications consent | PARTIAL | Account flows send transactional email and draft terms discuss communications; no dedicated e-sign/e-record consent, withdrawal/hardware disclosure, or marketing preference record. **PENDING COUNSEL REVIEW**. |
| 20 | Location-data disclosures | PARTIAL | Privacy draft describes entered, IP-derived, shop/shipping, and permission-based device location; browser geolocation is used for marketplace/buyer discovery. No granular preference/history/deletion controls or approved sensitive-data treatment. **PENDING COUNSEL REVIEW**. |
| 21 | Image upload / AI content | PARTIAL | Draft policies address uploads, OCR/AI assistance, possible errors and review; upload protections/storage abstraction and AI authorization exist. Provider/data-use, rights, retention, moderation, identity/face risks, and final notices are **PENDING COUNSEL REVIEW**. |
| 22 | Messaging/moderation | PARTIAL | Authenticated shop conversations and rate limiting exist; draft Terms prohibit harassment. No user block/report, moderation queue, rules, appeal, emergency or evidence-retention workflow. **PENDING COUNSEL REVIEW**. |
| 23 | Copyright/IP reporting | PARTIAL | Draft Terms contain IP/user-content language; no designated notice channel, takedown/counter-notice, repeat-infringer, or case tracking. **PENDING COUNSEL REVIEW**. |
| 24 | Accessibility statement | MISSING | Accessibility-oriented UI patterns exist, but no public statement/contact/remediation route or acceptance evidence. Legal content is **PENDING COUNSEL REVIEW**. |
| 25 | Contact/support/legal notice | MISSING | Admin support surfaces exist, but no verified public support, privacy, legal-notice, IP, or service-of-process contact. Required placeholders remain TBD / **PENDING COUNSEL REVIEW**. |
| 26 | Policy versioning/acceptance | PARTIAL | Registration fixes Terms/Privacy versions and persists consent; saved-payment authorization has a separate version/evidence record. No authoritative policy registry, immutable publication archive, transaction-policy acceptances, re-consent, withdrawal, or admin audit tooling. **PENDING COUNSEL REVIEW**. |
| 27 | Footer/navigation links | PARTIAL | `SiteLayout.tsx` footer links Terms and Privacy, and registration cross-links them. Missing policies/contact/accessibility are consequently unlinked; checkout/listing/submission contextual links are incomplete. **PENDING COUNSEL REVIEW**. |

Existing public legal pages/policies found: draft Terms of Service and draft Privacy Policy only. `LEGAL.md` is internal notes, not a public policy. Generic clauses do not substitute for the missing reviewed agreements.

## Launch-blocking legal gaps

- No counsel-approved, internally consistent public legal package; every approval remains **PENDING COUNSEL REVIEW**.
- No finalized contracting identity/address/legal/privacy/support notice channels: **PENDING COUNSEL REVIEW**.
- No approved launch jurisdiction/category matrix for marketplace/pawn/secondhand rules, licenses, holding/police reporting, stolen property, identity, KYC/AML/OFAC, regulated goods, tax, or consumer protection: **PENDING COUNSEL REVIEW**.
- Missing seller/shop, auction, marketplace sale, sell/pawn submission, prohibited-items, refund/return/cancellation/dispute, subscription, cookie, messaging/moderation, IP-reporting, and accessibility policies: **PENDING COUNSEL REVIEW**.
- No operational privacy-rights deletion/export workflow, retention schedule, cookie controls, legal hold, or law-enforcement request process: **PENDING COUNSEL REVIEW**.
- Registration consent exists, but policy publication/re-consent and transaction-specific acceptance are incomplete: **PENDING COUNSEL REVIEW**.

The complete issue list is in `docs/legal-counsel-review-checklist-v1.md`; no item there is resolved by this audit.

## Operational readiness inventory

| Area | State | Evidence / launch gap |
|---|---|---|
| Production deployment and staging promotion | PARTIAL | `DEPLOYMENT.md`, environment validators/checks and PM2 definitions exist. Provider procedure, artifact promotion authority, maintenance/change record, approval and rehearsal require external evidence. |
| Migration procedure | PARTIAL | Deployment docs separate status/deploy and require compatibility review. Exact production ownership, additive/backward-compatible standard and rehearsal evidence remain TBD; no migration was run here. |
| Rollback | PARTIAL | `launch-operations/rollback-runbook.md` covers application/config rollback and database safety. Provider mechanism, last-known-good target, owners and drill evidence remain TBD. |
| Database backup/restore | PARTIAL | Guarded scripts and `production-backup-recovery-runbook-v1.md` cover manifests and isolated restore. Schedule, off-host/encryption/PITR, OWNER: TBD, RTO/RPO approval and successful current drill are external. |
| Redis outage | PARTIAL | Shared rate-limit support exists in current source, but topology, endpoint failure policy, alerting, capacity/eviction and outage evidence are not established. |
| Durable storage outage | PARTIAL | Upload abstraction/protection/cleanup and incident playbook exist. Actual provider, durability, lifecycle, monitoring and tested degraded UX are external/TBD. |
| Stripe outage/webhook recovery | PARTIAL | Signed platform/Connect webhooks, idempotency and incident playbooks exist. Safe replay tooling, backlog alerts, live reconciliation, outage rehearsal and ownership are incomplete/external. |
| Email outage | PARTIAL | Resend/SMTP paths and incident playbook exist. Durable delivery queue/failover, bounce/complaint operations and drill evidence are TBD. |
| AI outage/fallback | PARTIAL | AI assistance is bounded by service/authorization code; explicit operator kill switch, user fallback acceptance, monitoring and provider playbook need evidence. |
| Geocoding outage/fallback | PARTIAL | Location service/browser flows exist; provider inventory, cached/manual fallback, notices, monitoring and outage drill are TBD. |
| Health/readiness | PRESENT | `/health` and `/api/health` liveness plus DB-backed `/ready` routes; smoke scripts documented. Readiness does not prove every dependency. |
| Monitoring/alerting | MISSING / EXTERNAL | Console/Morgan/request IDs and selected event logs exist. Central metrics/APM/error tracking, dashboards, alerts, paging and tested routing are not proven. |
| Structured logging/audit logs | PARTIAL | Request IDs and object-style selected logs; Super Admin/MFA/financial audit records exist. No comprehensive structured schema, destination, redaction/retention, sensitive-read/auth/admin coverage or tamper evidence. |
| Secret rotation/access review | PARTIAL | Deployment redaction and incident break-glass guidance exist. Inventory, named owners, rotation tests, IAM review cadence, removal evidence and provider audits are external/TBD. |
| Dependency vulnerability management | PARTIAL | Lockfiles/check scripts exist; no documented cadence, severity SLA, SBOM, exception owner, or current accepted scan evidence. |
| Incident response/severity/breach | PARTIAL | Incident response, severity model and scenario playbooks exist. Roster, paging, legal notification matrix, exercises and evidence remain OWNER: TBD / **PENDING COUNSEL REVIEW**. |
| Support/abuse/fraud escalation | MISSING / PARTIAL | Admin views and financial incident guidance exist. No staffed intake/case system, public contact, moderation/report flow, SLAs or tested routing. |
| Vendor/data inventories | PARTIAL | This audit adds repository-evidenced starter inventories; contracts, precise flows, owners, retention and actual configurations remain TBD / **PENDING COUNSEL REVIEW**. |
| Retention/deletion | MISSING | No approved operational schedule, deletion automation, backup propagation, hold or verified request runbook. **PENDING COUNSEL REVIEW**. |
| RTO/RPO | MISSING | Backup runbook acknowledges them; values and owners remain `RTO: PENDING APPROVAL`, `RPO: PENDING APPROVAL`. |
| SLI/SLO | MISSING | No approved indicator definitions, objectives, error budgets, or owners. Values remain PENDING APPROVAL. |
| Status/maintenance/on-call | MISSING / PARTIAL | Communication templates and first-72-hours cadence exist; public status mechanism, maintenance policy, roster and schedules are OWNER: TBD. |
| Release approval/go-no-go | PARTIAL | Paid-beta checklist existed; this audit adds public-launch and staging/production evidence templates. Completion remains external. |
| Post-deploy smoke | PARTIAL | Read-only scripts and deployment guidance exist; authenticated safe production suite, owners and execution evidence remain TBD. |

## Runbook disposition

Found: `DEPLOYMENT.md`; production backup/recovery; paid-beta go/no-go; rollback; incident response; incident playbooks; first 72 hours.

Created/updated by this audit:

- `docs/legal-counsel-review-checklist-v1.md`
- `docs/launch-operations/public-launch-go-no-go.md`
- `docs/launch-operations/support-vendor-access-matrix.md`
- `docs/launch-operations/staging-and-production-verification.md`
- `docs/launch-operations/README.md` links the complete set.

Launch-blocking operational gaps: unapproved owners/RTO/RPO/SLOs; no proven monitoring/paging/on-call; no completed production backup/restore and rollback drills; incomplete provider outage/reconciliation evidence; no staffed support/moderation/legal/privacy escalation; incomplete access/secret/vendor/data controls; no completed staging certification, public go/no-go or production smoke evidence.

## Application gap analysis

### Launch blocker

- Publish counsel-approved versioned policies and accurate contacts; **PENDING COUNSEL REVIEW**.
- Add authoritative policy-version publication/acceptance and material-change re-consent. Existing registration records are useful but insufficient; **PENDING COUNSEL REVIEW**.
- Add transaction-specific consent records for seller/shop, auction, marketplace sale, sell/pawn and subscription terms where counsel requires them; **PENDING COUNSEL REVIEW**.
- Implement verified account deletion and data export workflows with exception/audit handling; **PENDING COUNSEL REVIEW**.
- Implement privacy request administration, data inventory/retention automation, legal holds, and law-enforcement request tracking; **PENDING COUNSEL REVIEW**.
- Implement cookie/tracker inventory and preference/opt-out controls before nonessential tracking; **PENDING COUNSEL REVIEW**.
- Implement public prohibited/stolen-item, abuse, IP and user reporting; user blocking; moderation/case/appeal tooling; **PENDING COUNSEL REVIEW**.
- Establish production observability, paging, support intake and provider/financial recovery evidence.

### Required before unrestricted public launch

- Contextual policy links and assent at registration, listing, bidding/offer, checkout, sell/pawn submission, merchant onboarding and subscription enrollment as approved by counsel.
- Admin tools for policy versions, acceptance lookup, privacy requests, deletion/export status, retention/holds, reports/moderation and legal demands, with least-privilege audit trails.
- Approved minimum-age, location permission/withdrawal and image/AI notices/controls; **PENDING COUNSEL REVIEW**.
- Comprehensive structured/redacted logs and audit coverage; dependency/security program; accessibility statement and validated accessible workflows.

### Recommended during controlled beta

- Exercise report/block/moderation, stolen-property, refund/dispute, privacy-request and law-enforcement table-top workflows with synthetic cases.
- Measure consent completion, support volumes, provider failures, webhook age, uploads/AI/geocoding fallback and deletion/export processing without collecting unnecessary data.
- Add policy publication/acceptance regression tests and footer/contextual-link route checks.

### Post-launch enhancement

- Automated self-service privacy dashboard where legally/operationally appropriate; jurisdiction-aware notices; transparency reporting; more granular communication/location preferences; automated vendor/retention evidence; **PENDING COUNSEL REVIEW**.

Explicit determinations: PawnLoop currently needs versioned policy acceptance (existing partial), re-consent after material changes, broader consent records, account deletion, data export, cookie preferences, user reporting/blocking, moderation tooling, law-enforcement request tracking, legal holds, retention automation, and administrative privacy tools.

## Verification and limitations

Documentation-only changes were made. No application logic, Prisma schema, migration, external provider, database, environment, dependency, generated output, or unrelated file was intentionally changed. Final command results and exact changed-file manifest must be recorded in the handoff after verification.

This audit did not verify live/staging/production state, provider configuration, database contents, current deployments, legal approval, staffing, insurance, licenses, external monitoring, backup recoverability, or real-world regulatory obligations.

## Recommended implementation sequence

1. Freeze launch geography, users, categories and enabled workflows; disable unsupported flows.
2. Obtain counsel decisions from the checklist and produce the complete versioned legal package and contacts: **PENDING COUNSEL REVIEW**.
3. Implement policy registry/publication, contextual acceptance/re-consent and auditable consent administration without changing transaction semantics.
4. Implement privacy deletion/export/admin/retention/legal-hold and legal-request workflows after counsel/data-architecture approval: **PENDING COUNSEL REVIEW**.
5. Implement reporting/blocking, moderation, prohibited/stolen-property and IP/legal case workflows after counsel/operations approval: **PENDING COUNSEL REVIEW**.
6. Assign operational owners and approve RTO/RPO/SLIs/SLOs, support coverage, severity/on-call/status/maintenance policies.
7. Complete vendor/data/secret/access inventories and production observability, alerting, vulnerability and audit-log controls.
8. Rehearse provider outages, webhook recovery/reconciliation, incident/breach response, rollback, and isolated backup restore.
9. Certify the exact release in staging; close accessibility/browser/performance/security/tenant-isolation gaps.
10. Complete public go/no-go, bounded production smoke and first-72-hours ownership; launch only at the approved controlled scope.

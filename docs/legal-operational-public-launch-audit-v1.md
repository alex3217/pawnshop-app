# PawnLoop Legal and Operational Public-Launch Readiness Audit V2

Audit date: 2026-08-18

Branch: `audit/legal-operational-readiness-current-main-v2`

Starting and current `origin/main`: `5073e8ba72632f79f486b27cc50f3bbd86833fa9`

Scope: repository documentation and supplied production-containment evidence only. No provider, database, environment, deployment, secret, or production system was accessed or changed.

## Decision and evidence boundary

**NOT YET CERTIFIED** for unrestricted public launch or transactional beta. This is engineering/legal issue spotting, not legal advice, legal approval, provider certification, or launch authorization.

Repository controls already implemented:

- production public-preview business writes fail closed unless separately enabled;
- production durable-upload readiness and safety controls are merged;
- canonical migration history restoration is merged;
- read-only production Render metadata discovery is merged;
- PR #352 replaced and integrated PR #330, merging managed-public-media controls;
- PR #355 replaced and integrated PR #315, merging Super Admin shop-inventory support and closing the publication bypass;
- PR #354 merged final current-main accessibility evidence with a `CONDITIONAL` classification; and
- immutable release, containment, backup/restore, rollback, and incident procedures exist as repository controls or templates.

Supplied evidence: PR #355 completed 618 local automated executions with zero failures and 14 successful GitHub checks. Its two migrations are merged into repository history but have not been applied to production. PR #354 recorded 162 passing frontend Node tests, 7 passing managed-image service tests, 44 passing role-route assertions, and Playwright at 459 passed, 0 failed, 0 skipped, and 0 flaky. Its canonical production-contract frontend build and exact Super Admin management-route protection passed; classification remains `CONDITIONAL`. GitHub Actions run `32135509506` passed and verified production Render maintenance mode enabled, automatic deployment disabled, and live backend source SHA `27096da51750479880289b7cd506933d971eb184`. Current main is `5073e8ba72632f79f486b27cc50f3bbd86833fa9`; these are different revisions. This evidence proves only the bounded repository and metadata assertions recorded by those workstreams.

Provider configuration, monitoring, backups, restore/rollback drills, privileged access, staffing, and live transactional behavior remain **PENDING OPERATOR EVIDENCE**. Legal decisions remain **PENDING COUNSEL REVIEW**. Deployments, migrations, maintenance/auto-deploy/write-gate changes, provider mutations, and production tests require separate authorization. Beta fitness requires validation with real pawn shops.

The PR #352, PR #355, and merged PR #354 integration facts are synchronized here. No immutable release candidate is selected or claimed; that requires separate authorization.

Priority meanings: P0 blocks any transactional beta or unrestricted public launch; P1 blocks unrestricted public launch and normally blocks beta unless an authorized, documented exception is permissible; P2 is required during controlled-beta validation before expansion; P3 is a post-certification improvement. Evidence absence never counts as passage.

## P0 launch gates

| Gate | Current status | Required acceptance evidence |
|---|---|---|
| Legal counsel review and approval | PENDING COUNSEL REVIEW | Written approval binds exact document versions, entity, geography, categories, roles, workflows, reviewer, scope, and effective date. |
| Terms and Privacy Policy | PENDING COUNSEL REVIEW | Counsel-approved, versioned, mutually consistent public documents; accurate entity/contact data; publication archive; required contextual assent and re-consent. Current pages are drafts. |
| Seller/shop agreement and buyer/marketplace terms | PENDING COUNSEL REVIEW | Approved allocation of licensing, title/authenticity, fulfillment, tax, data, suspension, indemnity, audit, acceptance, and evidence duties. |
| Auction, payment, refund, dispute, and subscription policies | PENDING COUNSEL REVIEW | Approved rules for bids, errors/cancellation, authorizations, payout holds, returns/refunds/chargebacks, auto-renewal disclosures, consent, cancellation, and reconciliation. |
| Prohibited, stolen, and regulated merchandise | PENDING COUNSEL REVIEW | Approved category/geography matrix plus intake, reporting, preservation, suspension, appeal, and disposition workflow. |
| Pawn, lending, marketplace, and jurisdiction requirements | PENDING COUNSEL REVIEW | Jurisdiction matrix addresses roles, licenses, disclosures, receipts, redemption, interest/fees, holding/police reporting, identity, sanctions/KYC/AML, tax, and consumer protection as applicable. |
| Privacy requests, retention, and deletion | PENDING COUNSEL REVIEW | Approved data map, retention/deletion/backup/hold schedule, verified request intake/identity/export/deletion/appeal procedure, owners, and completed rehearsal. No complete operational workflow is certified. |
| Production containment and release identity | PENDING OPERATOR EVIDENCE | Maintenance remains enabled and auto-deploy disabled. Exact immutable candidate, provider deployment, frontend/API identity, capability response, and read/write scope must be authorized and verified before any promotion. |
| Stripe, database, email, storage, Render, and Cloudflare ownership/configuration | PENDING OWNER ASSIGNMENT | Named account/service owners and dated redacted provider evidence for live/test boundaries, regions, permissions, webhooks, durability, delivery, DNS/TLS, rollback, billing/support, and outage behavior. |
| Privileged access, MFA, secrets, and vendor access | PENDING OPERATOR EVIDENCE | Named least-privilege accounts, enforced MFA, separation of duties, access review/removal, credential inventory, rotation/revocation rehearsal, break-glass expiry, and provider audit logs. Never record secret values. |
| Monitoring, alerting, and incident ownership | PENDING OWNER ASSIGNMENT | Live metrics/logs/error tracking/synthetics, tested alert routes, roster and alternates, incident/communications/security/finance ownership, and retention/redaction evidence. |
| Backup and isolated restore | PENDING OPERATOR EVIDENCE | Fresh protected recovery point, manifest/checksum, off-host retention/encryption evidence, successful isolated restore, schema/data validation, elapsed time/data-loss result, and approvals. |
| Rollback and last-known-good release | PENDING OPERATOR EVIDENCE | Immutable application/configuration/provider identities, schema compatibility, rollback thresholds, recovery point, provider procedure, completed rehearsal, and validation evidence. |
| RTO, RPO, SLI, SLO, and severity targets | TBD WITH APPROVAL | Business-approved values, owners, indicators, objectives/error budgets, SEV0–SEV3 response/escalation targets, measurement source, and drill results. No values are inferred here. |
| Support readiness and case ownership | PENDING OWNER ASSIGNMENT | Accurate public contacts, coverage hours, intake/case system, assigned case owners, escalation/handoff rules, approved communications, privacy/legal/abuse/finance routes, and tested delivery. |
| Transactional-beta authorization | NOT YET CERTIFIED | All P0 gates pass; exact cohort/caps/features/geography approved; provider writes and transactions separately authorized; reconciled bounded tests; real pawn-shop entry evidence complete. |

## P1 launch gates

| Gate | Current status | Required acceptance evidence |
|---|---|---|
| Accessibility and role-based QA | CONDITIONAL | PR #354 automated evidence is merged, including frontend Node, managed-image service, role-route, production-contract build, exact Super Admin management-route protection, and a 459-test Playwright matrix. Manual assistive-technology testing, manual reduced-motion and visual review, and deployed staging certification remain required. |
| Financial operations and reconciliation | PENDING OWNER ASSIGNMENT | Daily procedure, internal/provider identity correlation, zero unexplained variance, refund/dispute/payout ownership, holds/corrections approval, and tested escalation. |
| Vendor/data inventory and agreements | PENDING COUNSEL REVIEW | Owners, purpose/data/regions/subprocessors, contract/DPA/security review, retention/deletion, outage/exit plan, renewal, and incident contacts for every provider. |
| Security and vulnerability readiness | PENDING OPERATOR EVIDENCE | Candidate dependency/secret/artifact scans, threat and tenant-access review, accepted-risk authority, remediation ownership, and no unaccepted launch-blocking findings. |
| Staging certification | NOT YET CERTIFIED | Exact immutable artifact/config fingerprint passes critical workflows, failure modes, privacy/support rehearsal, accessibility, performance/capacity, security, migration compatibility, backup/restore, and rollback checks. |
| Production read-only smoke and observation | PENDING OPERATOR EVIDENCE | Separately authorized bounded checks verify exact origins/revisions, health/readiness/headers, approved legal/support links, read-only catalog/auction behavior, alerts, logs, and stop thresholds without writes. |
| Public-launch approval | NOT YET CERTIFIED | P0/P1 gates passed, residual risks/exceptions explicitly approved, support/on-call/status and first-72-hours roster assigned, exact scope frozen, immutable evidence linked, and final `GO` recorded. |

## P2 controlled-beta validation gates

| Gate | Current status | Required acceptance evidence |
|---|---|---|
| Real pawn-shop entry validation | PENDING OPERATOR EVIDENCE | Approved shops validate eligibility/licensing evidence, role access, training, support contacts, inventory/auction/sell-pawn boundaries, transaction caps, stop rules, and offboarding. |
| Real pawn-shop exit validation | PENDING OPERATOR EVIDENCE | Approved observation period and representative workflows complete; support/dispute/refund/prohibited-item cases rehearsed; no unexplained financial/data variance or unresolved P0; expansion/pause decision recorded. |
| Performance and capacity | PENDING OPERATOR EVIDENCE | Approved traffic model and headroom, frontend/API/database/provider measures, thresholds, failure behavior, and owner-approved results. |
| Operating-model exercises | PENDING OPERATOR EVIDENCE | Synthetic or authorized cases exercise privacy, moderation, stolen property, legal demand, breach, provider outage, webhook recovery, support handoff, and communications without fabricating completion. |
| Policy/consent regression evidence | PENDING OPERATOR EVIDENCE | Exact approved versions and links appear at required role/action points; acceptance, re-consent, withdrawal, lookup, archive, and negative paths pass. |

## P3 improvements after certified scope

| Gate | Current status | Intended outcome |
|---|---|---|
| Privacy self-service and automation | TBD WITH APPROVAL | Add jurisdiction-aware request dashboards, retention evidence, holds, export/deletion tracking, and preferences where counsel approves. |
| Transparency and moderation maturity | TBD WITH APPROVAL | Improve reporting, appeals, metrics, policy enforcement evidence, and transparency reporting with privacy safeguards. |
| Resilience automation | TBD WITH APPROVAL | Automate safe evidence collection, restore/rollback exercises, vendor/access reviews, and SLO reporting without weakening authorization boundaries. |
| Expanded beta/public scope | NOT YET CERTIFIED | Expand only after real-shop evidence, approved objectives, incident/support performance, accessibility, capacity, provider controls, and renewed legal review. |

## Read-only public preview versus transactional beta

Read-only public preview is a contained release mode. The repository gate permits reads and narrowly enumerated authentication/webhook mutations while blocking other production business writes. Preview still requires authorization, accurate approved public content for the exposed scope, privacy/security review, monitoring/incident ownership, accessibility/role QA, and verified containment. Maintenance mode is currently enabled, so no public-preview release is authorized by this audit.

Transactional beta requires everything above plus counsel-approved transaction policies and assent, separately authorized write enablement, certified Stripe/storage/database/email/provider configuration, reconciled payments/refunds/disputes/payouts, backup/restore/rollback evidence, staffed support and incident coverage, approved cohort/caps/stop rules, and validation with real pawn shops. It is **NOT YET CERTIFIED**.

Unrestricted public launch requires completed P0 and P1 evidence for the approved scale and scope, controlled-beta exit evidence, and a separate final launch decision. It is **NOT YET CERTIFIED**.

## Limitations and next release step

This replacement reuses useful documentation from stale draft PR #299 without changing, rebasing, closing, or pushing its original branch. It makes no application, test, schema, migration, dependency, lockfile, workflow, provider, environment, database, or secret change.

Before any separately authorized release-candidate selection, complete and review manual assistive-technology testing, manual reduced-motion and visual review, deployed staging certification, database-backed media/provider validation, security and vulnerability disposition, backup/restore, monitoring, rollback and incident evidence, counsel approval, real pawn-shop transactional-beta validation, and final production/provider verification. Any release/provider action remains separately authorized.

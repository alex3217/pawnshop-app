# Support, Vendor, Data, Secrets, and Access Readiness V1

Status: completion template. Entries describe repository evidence or required decisions; they do not prove external configuration.

## Support and escalation matrix

| Intake or event | First owner | Escalation | Required record |
|---|---|---|---|
| General customer/shop support | OWNER: TBD; SUPPORT EMAIL: TBD | Support lead: OWNER: TBD | Case ID, timestamps, account/transaction references, redacted facts, disposition |
| Account access or suspected takeover | OWNER: TBD | Security lead: OWNER: TBD | Security case; preserve authentication/audit evidence |
| Abuse, harassment, user report/block request | OWNER: TBD | Trust/safety and legal: OWNER: TBD / PENDING COUNSEL REVIEW | Moderation case, evidence, action, appeal |
| Prohibited or stolen property | OWNER: TBD | Trust/safety, legal, and law enforcement as approved | Restricted case; preservation/reporting rules PENDING COUNSEL REVIEW |
| Refund, return, cancellation, dispute, chargeback | OWNER: TBD | Finance/payments: OWNER: TBD | Transaction/provider IDs, approvals, reconciliation |
| Payout/ledger mismatch | OWNER: TBD | Finance plus incident commander | Financial incident; no manual correction without approval |
| Privacy request/deletion/export | OWNER: TBD; PRIVACY CONTACT: PENDING COUNSEL REVIEW | Privacy/legal/security | Verified request, scope, systems, exceptions, completion |
| Copyright/IP report | OWNER: TBD; LEGAL NOTICE EMAIL: PENDING COUNSEL REVIEW | Legal | Notice/counter-notice record; process PENDING COUNSEL REVIEW |
| Law-enforcement/legal demand | OWNER: TBD | Counsel/security: PENDING COUNSEL REVIEW | Restricted request, authority validation, preservation, disclosure log |
| Availability/provider incident | On-call: OWNER: TBD | Incident commander per severity | Incident ID and `incident-response.md` evidence |
| Data breach or secret exposure | Security: OWNER: TBD | Incident commander and counsel | Security incident; notification duties PENDING COUNSEL REVIEW |

Do not promise response times, refunds, outcomes, or legal disclosures until approved. Customer identity verification, access limits, evidence retention, appeal rules, and emergency routing remain TBD.

## Vendor and external-dependency inventory

| Dependency evidenced in repository | Purpose | Data/risk to inventory | Outage/fallback and launch evidence |
|---|---|---|---|
| PostgreSQL via Prisma | Primary application data | Account, shop, listing, transaction, message, audit and other modeled data; exact inventory TBD | `/api/ready` probes DB; backup/restore runbook exists. Provider, RTO/RPO, capacity, PITR: PENDING APPROVAL |
| Stripe and Stripe Connect | Payments, subscriptions, setup methods, refunds/disputes, payouts | Customer/provider IDs, payment metadata, financial state | Signed webhooks and internal recovery logic exist; provider configuration, replay/reconciliation drill and outage owner: TBD |
| Resend or SMTP | Transactional email | Email address, templates, delivery metadata | Runtime supports configured provider; queue/backlog, failover, bounce/complaint handling: TBD |
| Durable upload storage | Images/documents | User images, item media, possible identity/business documents | Code includes upload storage abstraction and cleanup; provider, durability, access, malware scanning, lifecycle, outage behavior: TBD |
| AI provider (OpenAI-compatible configuration) | Listing/description assistance | Prompt and item/listing content; exact transfer rules TBD | Feature must fail without corrupting listing workflow; approved disable/fallback and provider review: TBD |
| Geocoding/mapping provider | Location search/geocoding | Addresses, coordinates, queries; precision rules TBD | Manual location/search fallback and provider/outage behavior: TBD |
| Redis-compatible store | Shared rate limiting/runtime coordination where configured | Pseudonymous rate-limit keys and operational metadata | Confirm fail-open/fail-closed behavior per endpoint, topology, eviction, monitoring, and outage drill: TBD |
| Hosting/CDN/DNS providers | API/web runtime, edge, DNS/TLS | Logs, IP/device metadata, deployed artifacts/config | Provider identity, region, access, rollback, status communications, and failover: TBD |
| Source control/CI and monitoring/support tools | Build/release/observability/support | Source, logs, alerts, customer cases as applicable | Exact vendors, retention, access, subprocessors, DPA/security review: TBD |

For every vendor record legal entity, service owner, contract/DPA, subprocessors, data categories/subjects, purpose, regions/transfers, credentials, access roles, retention/deletion, security review, incident contact, status page, exit/export plan, outage behavior, and renewal date. Privacy/legal conclusions are **PENDING COUNSEL REVIEW**.

## Data inventory and lifecycle

Inventory at minimum: accounts/credentials; identity and shop applications; licenses/documents; precise/approximate location; listings, serial numbers and images; sell/pawn submissions; bids/offers/auctions; purchases/fulfillment; payments/subscriptions/payout/refund/dispute metadata; messages; support/moderation/legal requests; consent records; audit/security logs; AI prompts/outputs; analytics/cookies; backups.

For each dataset assign OWNER: TBD and document source, purpose, legal basis **PENDING COUNSEL REVIEW**, sensitivity, system/vendor, access roles, sharing, retention trigger/period **PENDING COUNSEL REVIEW**, deletion/backup behavior, export format, legal-hold behavior, and audit evidence. No approved retention schedule, automated deletion, complete data export, or legal-hold workflow is established by this document.

## Secrets and privileged-access review

- [ ] Enumerate production/staging accounts and roles without recording secret values; OWNER: TBD.
- [ ] Confirm least privilege, named accounts, MFA, separation of duties, dormant-account removal, and quarterly access-review cadence: PENDING APPROVAL.
- [ ] Inventory database, JWT, integration-encryption, MFA-encryption, Stripe/webhook, email, storage, AI, Redis, CI, hosting, DNS, monitoring, and support credentials.
- [ ] Record secret owner, storage location by system name, creation/last rotation, rotation/revocation procedure, consumers, and tested recovery—never the value.
- [ ] Test break-glass grant, audit, expiry, revocation, and retrospective process from `incident-response.md`.
- [ ] Confirm departed/changed-role access removal and provider audit-log review.
- [ ] Run repository and artifact secret scanning; triage history findings through the security process without printing secrets.
- [ ] Define emergency rotation order and dependencies; do not rotate blindly during an incident.
- [ ] Record reviewer, date, evidence references, exceptions, owners, and due dates.

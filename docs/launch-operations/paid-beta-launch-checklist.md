# Paid-Beta Release Go/No-Go Checklist V1

Allowed status values: `PASS`, `FAIL`, `BLOCKED`, `NOT APPLICABLE`. Every row starts `BLOCKED`; change it only with dated evidence and approver. `NOT APPLICABLE` requires rationale and approval. A document, code path, or local test alone does not prove external readiness.

Release ID: `[TBD]`  Candidate SHA: `[TBD]`  Decision UTC: `[TBD]`  Release owner: `OWNER/TBD`

| Gate | Status | Required evidence / acceptance |
|---|---|---|
| CI green | BLOCKED | Candidate-SHA check URLs and required checks successful. |
| Reviewed PRs merged | BLOCKED | Approved PRs, merge SHAs, scope confirmation. |
| Production environment contract | BLOCKED | Redacted validation of backend and frontend contracts; no environment file attached. |
| Database migration history | BLOCKED | Approved target history/status and application compatibility review. |
| Backup and restore evidence | BLOCKED | Fresh protected backup plus successful isolated restore drill; dump existence is insufficient. |
| Monitoring and alerts | BLOCKED | Live monitors, thresholds, routes, test pages, retention, `OWNER/TBD` coverage. |
| Stripe configuration | BLOCKED | Live/test mode boundary, products/prices, Connect, permissions, descriptors and approval evidence. |
| Stripe webhook configuration | BLOCKED | Platform and separate Connect endpoint IDs, signed event scopes, delivery/retry test, monitoring. |
| Buyer Subscription configuration | BLOCKED | Configuration and approved evidence supplied by its owner; this work does not modify or validate protected Buyer Subscription files. |
| MFA | BLOCKED | Privileged-user requirement, enrollment/recovery test, exception review. |
| Rate limiting | BLOCKED | Enabled settings and single-process topology evidence, or approved shared-store design if scaled. |
| Uploads/storage | BLOCKED | Durable storage, authorization, validation/scanning, retention/deletion, failure test. |
| Legal pages | BLOCKED | Versioned counsel/product approval and published routes/contact details. |
| Support readiness | BLOCKED | Coverage, intake, escalation, approved scripts, incident integration. |
| Incident response | BLOCKED | Named `OWNER/TBD` roles resolved, contacts/cadence approved, tabletop evidence. |
| Rollback | BLOCKED | Provider procedure and schema-compatible rehearsal with evidence. |
| Beta shop onboarding | BLOCKED | Approved cohort, caps, eligibility, support contact, suspension/offboarding rehearsal. |
| Test transactions | BLOCKED | Approved end-to-end charge/refund/payout test identities and reconciled evidence without sensitive data. |
| Accessibility | BLOCKED | Approved keyboard/screen reader/contrast/automated evidence against target. |
| Mobile/responsive QA | BLOCKED | Supported-device/view matrix and critical-flow results. |
| Security review | BLOCKED | Threat/access/tenant/secrets/dependency findings resolved or explicitly rejected by authority. |
| Super Admin controls | BLOCKED | Authorization, sensitive-action audit coverage, least privilege, MFA, break-glass review. |
| Financial reconciliation | BLOCKED | Zero unexplained variance across internal/provider identities; exception ownership and daily procedure. |
| Final approval | BLOCKED | All blocking gates resolved; Product, Technical, Security, Finance, Support and executive authorities `OWNER/TBD` sign with UTC timestamps. |

## Decision record

- Decision: `[GO / NO-GO]`
- Blocking rows: `[ROWS]`
- Approved beta scope/caps: `[SHOPS, USERS, GEOGRAPHY, MONEY LIMITS, FEATURES]`
- Approvals: `[ROLE, OWNER/TBD, UTC TIMESTAMP, EVIDENCE]`
- Next review: `[UTC TIMESTAMP OR CONDITION]`

# Staging Public Beta Go/No-Go

Decision date: 2026-08-01 (America/Chicago)  
Decision: **NO-GO for invite-only public beta**

## Gate summary

| Gate | Status |
|---|---|
| Disposable database accepted by safety guard | PASS — explicit loopback disposable target accepted |
| Clean Prisma migration replay | PASS — 45/45 migrations |
| Prisma schema generation and validation | PASS |
| Database backup and isolated restore | PASS — custom-format backup and second-target restore completed |
| Restored migration ledgers | PASS — 45/45 exact |
| Restored public-table row counts | PASS — 62/62 exact |
| Normalized restored schema comparison | PASS — exact |
| Seeded HTTP role and tenant isolation | PASS — 11/11 |
| Browser role-routing smoke | PASS — 3/3 |
| General backend integration | PASS — 154/154 |
| Backend core suite | PASS — 200/200 |
| Database safety suite | PASS — 8/8 |
| Root Web/API CI | PASS |
| Root backend CI | PASS |
| Mobile TypeScript validation | PASS |
| Cloudflare release-candidate preview | PASS |
| Automated accessibility foundation | PASS — 26/26 axe checks |
| Provider-backed Stripe test-mode lifecycle | BLOCKED |
| Manual accessibility and measured contrast | BLOCKED |
| Staging and production migration-history inspection | BLOCKED |
| Centralized monitoring and alert exercises | BLOCKED |
| Deployment and rollback rehearsal | BLOCKED |
| Operational backup schedule and off-host artifact | BLOCKED |
| Incident tabletop | BLOCKED |

## Completed certification evidence

The application has completed the disposable PostgreSQL certification,
including migration replay, Prisma validation, backup, restore, migration-ledger
comparison, public-table row-count comparison, and normalized schema comparison.

The persisted role-and-tenant matrix exercises real login, JWT validation,
database-backed user state, owner approval, staff permissions, shop isolation,
administrative access, and Super Administrator access.

The root release-candidate CI now passes Web/API validation, backend automated
tests, mobile TypeScript validation, and Cloudflare preview deployment.

No production or staging database was modified during these local
certifications. No production Stripe service was accessed. No migration
directory was renamed.

## Remaining blockers

### Provider-backed Stripe certification

Provider-backed certification still requires approved Stripe test-mode
credentials and webhook signing secrets. It must verify Connect onboarding,
server-controlled PaymentIntent values, signed webhook behavior, refund and
dispute lifecycles, transfers, payouts, reconciliation, idempotency, and
test-object cleanup.

### Manual accessibility certification

Automated axe checks do not replace manual keyboard, focus, zoom/reflow,
reduced-motion, VoiceOver, NVDA, form-error announcement, state-matrix, and
measured-contrast certification.

### Migration history review

The known duplicate migration prefix remains unchanged. Staging and production
`_prisma_migrations` histories must be inspected before any migration directory
is renamed.

### Operational certification

Centralized logs, error reporting, alert destinations, test alerts, operational
backup scheduling, immutable deployment artifacts, rollback, and incident
tabletop exercises still require provider-backed evidence and named owners.

## Conditions to reconsider

1. Complete and retain redacted Stripe test-mode provider evidence.
2. Complete the named manual accessibility matrix and resolve material issues.
3. Inspect staging and production migration histories without modifying them.
4. Exercise monitoring, alerting, deployment, rollback, operational backup, and
   incident response.
5. Update this decision from current evidence and conduct the final public-beta
   go/no-go review.

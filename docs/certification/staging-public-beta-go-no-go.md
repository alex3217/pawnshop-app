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
| Provider-backed Stripe test-mode lifecycle | PASS — provider lifecycle and reconciliation certified |
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

Provider-backed Stripe test-mode certification now passes. The retained
redacted evidence covers Connect, payments, signed webhooks, refunds,
disputes, transfers, connected payouts, and reconciliation.

No production or staging database was modified during these local
certifications. No production Stripe service was accessed. No migration
directory was renamed.

## Remaining blockers

### Provider-backed Stripe certification

Provider-backed Stripe test-mode certification passed. Evidence covers
Connect onboarding and isolation, server-controlled payments, signed and
idempotent webhooks, failed-payment recovery, refunds, disputes, Transfer
idempotency, connected-payout observation, and reconciliation states.

The connected payout used the Stripe test-bank failure fixture ending 2227;
PawnLoop retained the full provider event sequence and terminal failure.

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

1. Complete the named manual accessibility matrix and resolve material issues.
2. Inspect staging and production migration histories without modifying them.
3. Exercise monitoring, alerting, deployment, rollback, operational backup, and
   incident response.
4. Update this decision from current evidence and conduct the final public-beta
   go/no-go review.

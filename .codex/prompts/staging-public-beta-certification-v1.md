Work in the PawnLoop repository on:

certify/staging-public-beta-v1

This phase must close infrastructure-backed launch blockers.

Read:

docs/audits/p0-launch-blocker-status.md
docs/audits/public-beta-go-no-go.md
docs/implementation/disposable-database-certification-runbook.md
docs/implementation/stripe-test-mode-certification-runbook.md
docs/implementation/accessibility-certification-runbook.md
docs/implementation/production-incident-checklists.md
docs/implementation/upload-security-architecture.md

Do not add another product feature suite.

Required workstreams:

1. Disposable database certification
2. Migration status, replay, seed, schema comparison, backup, restore
3. Seeded role/tenant HTTP and browser matrix
4. Stripe provider-backed test-mode lifecycle
5. Manual accessibility and measured contrast checklist preparation
6. Monitoring and alert configuration evidence
7. Deployment and rollback rehearsal evidence
8. Updated invite-only beta go/no-go decision

DATABASE SAFETY

Use only an explicitly disposable database accepted by the repository's
database safety guard.

Never print DATABASE_URL.

Never connect to production.

Before any database command, run the safety assertion.

Do not rename already-applied migrations blindly.

STRIPE SAFETY

Use only Stripe test mode.

Verify key classification without printing values.

Use disposable Stripe customers, connected accounts, payments,
transfers, refunds, disputes, and subscriptions.

Never use live mode.

ROLE MATRIX

Seed:

- Buyer A
- Buyer B
- Owner A
- Owner B
- Staff A
- Staff B
- Admin
- Super Admin

Prove:

- Own-user access
- Cross-user denial
- Own-shop access
- Cross-shop denial
- Inactive membership denial
- Disabled-user denial
- Pending-owner denial
- Admin and Super Admin compatibility

OPERATIONS

Retain evidence for:

- Health/readiness
- Centralized logs
- Error reporting
- Stripe webhook alert
- Failed payout alert
- Email failure alert
- Database alert
- Backup
- Restore
- Deployment
- Rollback
- Incident tabletop

Do not claim PASS without retained evidence.

Create:

docs/certification/database-certification-results.md
docs/certification/role-tenant-certification-results.md
docs/certification/stripe-test-mode-certification-results.md
docs/certification/accessibility-manual-certification-results.md
docs/certification/operations-certification-results.md
docs/certification/staging-public-beta-go-no-go.md

Do not commit, push, merge, modify production secrets, or use production
providers.

When infrastructure is unavailable, report BLOCKED.

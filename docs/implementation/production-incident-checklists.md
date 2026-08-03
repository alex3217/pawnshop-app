# Production Operations and Incident Checklists

## Severity and roles

- SEV-1: safety, data exposure/loss, payment integrity, or broad outage. Incident Commander pages security/payment/database owner immediately; communications owner posts updates; scribe preserves a timeline.
- SEV-2: major degraded critical flow. Page service owner and Incident Commander.
- SEV-3: limited degradation with workaround. Ticket the owning team with an SLA.

## Deployment, rollback, migration, backup, restore

- Confirm approved artifact, change owner, dashboards, alerts, support coverage, rollback point, and no unresolved P0 gate.
- Roll back application traffic using the prior immutable artifact; avoid destructive/down migrations; verify health, auth, payments, and tenant isolation.
- Before migrations: certified target, applied-history/checksum review, duplicate-prefix audit, backup, lock/statement limits, forward/backward compatibility, and explicit approval. Never reset shared data.
- Verify encrypted off-host backup ownership, schedule, retention, checksum, restore access, and alert freshness.
- Restore only to a certified isolated target; time recovery, validate data/application checks, record RPO/RTO, and destroy test data securely.

## Service incidents

- Stripe webhook: preserve event ID (not payload secrets), check signature/replay state, pause unsafe automation, reconcile provider/API/ledger, retry idempotently, notify payments owner.
- Failed payout: stop duplicate retries, verify account/ledger/provider state, preserve idempotency key, notify finance/support, reconcile before resuming.
- Email delivery: check provider status, bounce/suppression and queue depth without exposing content; switch approved provider path or communicate workaround.
- Database outage: page DB owner, stop write-amplifying jobs, verify pool/storage/replication, fail readiness, protect integrity, restore service before replaying jobs.

Provider configuration is NOT_RUN until dashboards, paging destinations, redaction, thresholds, owners, and test alerts are evidenced. Postmortem template: summary, severity, customer impact, timeline, detection, root cause, contributing factors, response, recovery, data/payment reconciliation, what worked, actions with owner/due date, and evidence links.

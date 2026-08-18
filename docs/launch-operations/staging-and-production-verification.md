# Staging Certification and Production Smoke Test V1

These checklists record evidence; they do not authorize provider changes or production data access.

Repository baseline: current `main` is `9f1de9b68636fee00f5ca606a931fca5a4dadb41`. GitHub Actions run `32135509506` passed the read-only Render metadata discovery and verified live backend SHA `27096da51750479880289b7cd506933d971eb184`, maintenance mode enabled, and automatic deployment disabled. The live SHA differs from current main. No deployment, configuration change, or transactional test is authorized by this record, and public launch and transactional beta remain **NOT YET CERTIFIED**.

Refresh this document after PR #330 and PR #315 integrate and before selecting the immutable release-candidate SHA.

## Staging certification

- Revision/build artifact: TBD WITH APPROVAL
- Environment/config fingerprint (no values): PENDING OPERATOR EVIDENCE
- Certification owner: PENDING OWNER ASSIGNMENT
- UTC window: TBD WITH APPROVAL

- [ ] Exact revision and immutable artifact match the release candidate; worktree/build inputs are clean.
- [ ] Node.js `20.20.2` and lockfile install/build/test results are recorded.
- [ ] Environment contract validation passes with secret values redacted.
- [ ] Migration status is reviewed through the approved staging procedure; no smoke command applies migrations.
- [ ] `/api/health` and database-backed `/api/ready` pass with expected identity, no-store/security headers, and bounded timeouts.
- [ ] Critical role/tenant negative tests and supported buyer/shop/admin journeys pass.
- [ ] Enabled marketplace, auction, sell/pawn, subscription, payment, refund/dispute, payout, message, upload, AI, email, and geocoding paths pass approved staging tests; disabled paths are blocked at UI and API.
- [ ] Stripe webhook duplicate/out-of-order/retry/recovery behavior and reconciliation are tested in non-live mode.
- [ ] Redis, storage, Stripe, email, AI, geocoding, database, and frontend/API outage/degradation behavior is exercised without changing external configuration.
- [ ] Structured log fields/redaction, audit records, metrics, alerts, and on-call delivery are verified.
- [ ] Backup/isolated restore, application rollback, migration compatibility, and incident tabletop evidence is current.
- [ ] Accessibility, browser/device, performance/capacity, support, moderation, and privacy request rehearsals pass.
- [ ] Known defects/exceptions have severity, owner, due date, workaround, and explicit approver.
- [ ] Final result is `CERTIFIED`, `NOT CERTIFIED`, or `CONTROLLED BETA ONLY` with evidence links.

Current result: `NOT CERTIFIED`.

## Production deployment and smoke test

Follow [`DEPLOYMENT.md`](../../DEPLOYMENT.md) and [`rollback-runbook.md`](rollback-runbook.md). OWNER: TBD must approve the exact target and each state-changing step. Never use local synthetic webhook/payment scripts against production.

Repository controls already implemented include the production read-only write gate, durable-upload readiness controls, canonical migration history, and read-only Render metadata discovery. Provider settings, live storage, backups, monitoring, deployment identity, and rollback capability require **PENDING OPERATOR EVIDENCE**. Counsel decisions remain **PENDING COUNSEL REVIEW**. Deployment, maintenance-mode changes, automatic-deployment changes, write enablement, migrations, provider changes, and transactional smoke tests are release actions requiring separate authorization.

Pre-deployment:

- [ ] Public-launch go/no-go is signed; deployment owner, incident commander, observers, rollback target/threshold, maintenance/status messages, and monitoring window are assigned.
- [ ] Exact artifact/revision, production environment contract, schema compatibility, last-known-good target, and fresh verified recovery point are recorded.
- [ ] Required provider status and integration configuration are verified through approved evidence, without exposing values.
- [ ] Last-known-good application/configuration identity and provider rollback mechanism have dated rehearsal evidence. Current evidence: PENDING OPERATOR EVIDENCE.

Read-only smoke:

- [ ] Confirm target origin and revision/deploy ID before requests.
- [ ] Run the repository's approved bounded production smoke command; record command name, time, exit result, and redacted evidence.
- [ ] Verify liveness/readiness, expected application/environment/version identity, security/cache headers, and absence of error spikes.
- [ ] Verify public Terms/Privacy and all required policy/support links resolve to approved versions. **PENDING COUNSEL REVIEW**.
- [ ] Verify only approved public catalog/auction reads; do not create accounts, transactions, payments, messages, uploads, or provider events unless separately authorized.

Authorized functional smoke (only if specifically approved):

- [ ] Use dedicated production test identities/data, bounded amounts/actions, cleanup/reconciliation plan, and explicit Finance/Security approval where applicable.
- [ ] Correlate internal/provider IDs and verify final state, audit trail, communications, and reconciliation without exposing customer/payment data.

Observation and decision:

- [ ] Observe approved SLIs/alerts, logs, webhooks, schedulers, provider status, financial reconciliation, and support intake for the defined window.
- [ ] Roll back or stop according to recorded thresholds; do not improvise a database reversal.
- [ ] Record `CONTINUE`, `ROLL BACK`, or `STOP/CONTAIN`, approvers, UTC time, evidence, exceptions, and handoff to `first-72-hours.md`.

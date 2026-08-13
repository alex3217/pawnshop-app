# PawnLoop Production Launch Operations and Incident Response V1

Status: operational framework; approval and external evidence remain required.

This directory is the operator entry point for a paid-beta launch. Creating these documents does not prove that production, monitoring, providers, staffing, backups, or drills are ready.

## Documents

- [Incident response](incident-response.md): severity, command, lifecycle, emergency access, communications, and postmortems.
- [Incident playbooks](incident-playbooks.md): service, security, data, payment, and provider scenarios.
- [Rollback runbook](rollback-runbook.md): application/configuration rollback and database safety.
- [Production release control](../production-release-control-v1.md): immutable-SHA promotion, production approvals, provider pause points, and required checks.
- [Paid-beta launch checklist](paid-beta-launch-checklist.md): evidence-based go/no-go record.
- [First 72 hours](first-72-hours.md): observation cadence, continuation decisions, and stop criteria.
- [Public launch go/no-go](public-launch-go-no-go.md): unrestricted-launch evidence and decision record.
- [Support, vendor, data, secrets, and access](support-vendor-access-matrix.md): escalation ownership and dependency/control inventories.
- [Staging and production verification](staging-and-production-verification.md): release certification and bounded smoke evidence.
- [Production backup and recovery](../production-backup-recovery-runbook-v1.md): guarded backup, isolated restore drill, approvals, and recovery evidence.
- [Legal counsel review](../legal-counsel-review-checklist-v1.md): issue-spotting checklist; every conclusion remains pending counsel review.

## Repository-supported controls

- `GET /api/health` is liveness; `GET /api/ready` includes database readiness. `scripts/check-staging-smoke.sh` and `scripts/check-prod-smoke.sh` perform bounded read-only checks, with different assertions.
- `scripts/check-prod-preflight.sh` checks a local production environment file, database separation, existence (not freshness or recoverability) of a production-named dump, static safety, and the web build.
- `scripts/backup-db.sh` creates a PostgreSQL custom-format dump. `scripts/restore-db.sh` is destructive (`--clean --if-exists`) and requires explicit confirmations, including an additional production confirmation. Neither proves scheduling, off-host retention, encryption, or a successful isolated restore drill.
- `scripts/check-payment-webhook.sh` is a state-changing local/development flow using local credentials and synthetic webhook data. It is not a production smoke test or provider reconciliation tool.
- The application contains signed Stripe platform and Connect webhook handling and internal payment/refund/payout audit data. The repository does not supply a safe generic webhook replay command, a provider-side reconciliation command, or proof of live Stripe configuration.
- Authentication rate limiting is process-local and assumes one API process. See `docs/auth-rate-limiting-v1.md`.

## Controls not established by this repository

Central monitoring/paging, alert thresholds, log retention, live provider settings, an approved on-call roster, support coverage, a tested recovery objective, backup freshness/off-host retention, and completed production restore/rollback drills require dated external evidence. Record them as `BLOCKED`, never infer them from source code.

## Evidence standard

Every decision and action record uses an incident/release ID, UTC timestamp, actor role, observation or command name, redacted result, evidence reference, and next decision. Never attach secrets, authorization headers, database URLs, customer payment details, or raw environment files.

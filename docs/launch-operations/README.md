# PawnLoop Production Launch Operations and Incident Response V1

Status: operational framework; approval and external evidence remain required.

This directory is the operator entry point for a paid-beta launch. Creating these documents does not prove that production, monitoring, providers, staffing, backups, or drills are ready.

Current status: the repository contains public-preview containment and release-safety controls, but production maintenance mode remains enabled, Render automatic deployment remains disabled, and neither public launch nor transactional beta is certified. PR #352 replaced and integrated PR #330, and PR #355 replaced and integrated PR #315. Final accessibility evidence from PR #354 remains pending refresh before an immutable release-candidate SHA is selected.

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
- Production business writes fail closed unless `PRODUCTION_WRITES_ENABLED` is exactly `true`; see [`production-read-only-write-gate.md`](../production-read-only-write-gate.md). This repository control does not prove the deployed configuration or authorize enabling writes.
- Production durable-upload and readiness controls are implemented; live storage/provider durability, redeploy, cache, TTL, and browser evidence remain uncertified. See [`production-upload-durability-certification-v1.md`](../production-upload-durability-certification-v1.md).
- Canonical migration-history restoration and read-only Render metadata discovery are merged. Managed-public-media controls, Super Admin shop-inventory support, and the closed publication bypass are merged through PR #352 and PR #355. PR #355 recorded 618 local automated executions with zero failures and 14 successful GitHub checks. Its two migrations are present in repository history but have not been applied to production. GitHub Actions run `32135509506` passed and verified the live backend source SHA as `27096da51750479880289b7cd506933d971eb184`, with maintenance mode enabled and automatic deployment disabled. This dated operator evidence does not certify launch readiness or make current `main` (`ef0e55e91f3d960bd66b3960b5a23277318faeac`) the deployed release.
- Authentication rate limiting is process-local and assumes one API process. See `docs/auth-rate-limiting-v1.md`.

## Controls not established by this repository

Central monitoring/paging, alert thresholds, log retention, live provider settings, an approved on-call roster, support coverage, a tested recovery objective, backup freshness/off-host retention, and completed production restore/rollback drills require dated external evidence. Record them as `BLOCKED`, never infer them from source code.

## Evidence standard

Every decision and action record uses an incident/release ID, UTC timestamp, actor role, observation or command name, redacted result, evidence reference, and next decision. Never attach secrets, authorization headers, database URLs, customer payment details, or raw environment files.

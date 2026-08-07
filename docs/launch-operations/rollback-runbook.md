# Rollback Runbook V1

## Rollback decision triggers

The IC/release authority (`OWNER/TBD`) considers rollback when a release causes a beta stop criterion, health/readiness failure, uncontrolled 5xx or latency, critical workflow failure, security regression, data-integrity risk, or financial-state uncertainty. Prefer forward mitigation only when its risk and time are demonstrably lower. Record the decision, alternatives, approvers, compatibility evidence, and UTC timestamp.

## Preconditions and evidence

- Identify incident/release ID, deployed revision, last-known-good revision/configuration, change window, and authorized executor.
- Preserve logs, provider/deploy identifiers, redacted configuration fingerprints, health results, and current financial/data state.
- Establish a recovery point before destructive action. `scripts/backup-db.sh` can create a custom PostgreSQL dump when deliberately invoked with an approved environment file, but existence alone does not prove a usable recovery point. Never run it or expose its URL casually during an incident.
- Determine whether migrations ran and whether the last-known-good application is compatible with the current schema. Repository readiness does not prove migration history.

## Application rollback

1. Freeze unrelated releases and state-changing test traffic.
2. Select the exact reviewed last-known-good revision using deployment evidence; do not rely on the stale checkpoint in `DEPLOYMENT.md`.
3. Confirm current-schema compatibility and required environment contract before changing traffic/deployment.
4. Use the approved deployment-provider rollback mechanism owned by `OWNER/TBD`. This repository does not automate Render or Cloudflare rollback.
5. Record deploy ID/revision/timestamps and validate as below. If rollback fails, return command to the IC and reassess containment.

`DEPLOYMENT.md` contains a legacy local `git checkout`/PM2 sequence. It is not sufficient production-provider automation and must not be treated as authorization to mutate this worktree or provider state.

## Configuration rollback

1. Identify the exact changed keys without recording secret values.
2. Confirm prior values from an approved versioned/fingerprinted source and assess compatibility.
3. Obtain IC plus Security/Finance approval when access, signing, payment, or financial behavior is affected.
4. Apply only the minimal provider-side change through the approved mechanism; record actor/provider audit reference and redacted before/after fingerprints.
5. Restart/redeploy only if the provider/runtime contract requires it; validate and revoke temporary access.

## Database migration compatibility review

Review migration history, backward/forward compatibility, destructive operations, new required columns/constraints, application read/write behavior, and whether old code can safely operate on the applied schema. Capture reviewers and evidence. A code rollback is blocked until compatibility is established.

### When database rollback must NOT be attempted

Do not attempt database rollback when the target/recovery point is uncertain; a verified backup and isolated restore evidence are absent; newer valid writes would be lost; old code is incompatible; corruption scope is unknown; financial/provider reconciliation is incomplete; or required Database, Security, Finance, and IC approvals (`OWNER/TBD`) are missing. Contain writes and escalate instead.

`scripts/restore-db.sh` performs a destructive clean restore and requires confirmations. It is not a migration rollback, merge tool, point-in-time recovery tool, or safe production incident default. Use only under a separately reviewed recovery plan with an exact target, preserved recovery point, isolated rehearsal, approvals, and reconciliation plan.

## Validation

- Run appropriate offline/preflight checks before deployment; keep secret-bearing output out of evidence.
- Validate `GET /api/health` and database-backed `GET /api/ready`. For an approved live check, `scripts/check-prod-smoke.sh` also reads public items/auctions; confirm its target first. Staging has stricter identity/header assertions in `scripts/check-staging-smoke.sh`.
- Validate critical unauthenticated and authenticated workflows with approved non-destructive test identities. The repository has no safe generic production authenticated smoke suite.
- For financial flows, correlate an approved test transaction's internal ID, Stripe object/event ID, expected ledger/settlement state, webhook processing, and final reconciliation. Never use `scripts/check-payment-webhook.sh` against production; it creates state and synthesizes an event.
- Validate security/access boundaries and observe error/latency/backlog signals for the approved window.

## Rollback evidence

Record incident/release ID, decision and approvals, revisions/config fingerprints, schema compatibility review, recovery point, commands/mechanisms by name, UTC timestamps, deploy/provider IDs, redacted outputs, health/readiness and smoke results, workflow/financial validation, remaining risk, temporary-access revocation, and final IC decision.

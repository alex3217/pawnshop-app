# PawnLoop production backup and recovery runbook V1

This runbook defines the repository-side controls for PostgreSQL backup and recovery. It does not assert that any external backup schedule, retention, point-in-time recovery, monitoring, or provider configuration exists.

## Ownership and policy decisions

| Decision | Required value |
| --- | --- |
| Backup owner | OWNER/TBD |
| Recovery incident commander | OWNER/TBD |
| Database/provider approver | OWNER/TBD |
| Security approver | OWNER/TBD |
| Backup schedule | TBD; must be approved against the business RPO |
| Retention policy | TBD; include local, off-host, and provider-managed retention |
| Business-approved RPO | TBD — business approval required |
| Business-approved RTO | TBD — business approval required |
| Encryption and key ownership | OWNER/TBD |

Point-in-time recovery (PITR) must be enabled and independently verified at the database provider before production readiness is claimed. Document the recovery window, restore granularity, retention, encryption, access controls, and a tested procedure. Repository dumps complement PITR; they do not replace it.

## Backup procedure

The operator must explicitly provide environment, env file, approved hostname, and database name. Example placeholders only:

```sh
npm run db:backup -- --environment production --env-file PATH_TO_ENV_FILE --approved-host APPROVED_HOSTNAME --database APPROVED_PRODUCTION_DATABASE
```

The script creates a restrictive `0600` custom-format archive and adjacent `0600` JSON manifest in a `0700` directory. It validates the URL target before `pg_dump`, inspects the archive with `pg_restore --list`, and records timestamp, non-secret target identity, exact source schema scope, application revision, filename, size, SHA-256 checksum, archive evidence, and tool version. An empty `sourceSchema` means `pg_dump` captured the full database; it never means an implicit `public` schema. Never attach env files, URLs, credentials, or command traces to an incident record.

V1 does not support schema remapping. The manifest source schema and destination `?schema=` scope must match exactly: schema-scoped backups restore only to the same explicit schema, and full-database backups restore only with no schema scope. Operators must not add, remove, or change `?schema=` merely to force a restore. Any incompatibility is a hard stop requiring a separately reviewed recovery plan.

OWNER/TBD must securely transfer backups off host, enforce the approved retention policy, and monitor scheduled completion. A missing, empty, stale, invalid, or manifest-less backup is a backup failure. Escalate immediately to OWNER/TBD, record the failure and last known-good recovery point, preserve non-secret diagnostics, and do not claim RPO compliance until a valid replacement exists.

## Recovery decision tree

1. Is this data loss, corruption, an application regression, or infrastructure loss? Open an incident record and assign OWNER/TBD.
2. Can the source be made read-only or isolated without destroying evidence? If yes, preserve it. Never test recovery by writing to the source.
3. Does provider PITR produce the safest recovery point within the approved RPO? If yes, follow the separately approved provider procedure in an isolated destination first.
4. Otherwise, select a repository archive only if its manifest, checksum, age, environment, and `pg_restore --list` validation pass.
5. Restore to an isolated loopback database and complete validation. If validation fails, stop, preserve evidence, and choose another recovery point.
6. A production restore requires the approval set below. Without it, remain isolated and escalate.

## Isolated restore drill

Create a disposable, network-isolated PostgreSQL destination whose database name contains exactly one isolation marker such as `restore` or `drill`. It must be loopback-only and must not reuse a source credential. Then run, using placeholders:

```sh
CONFIRM_RESTORE='RESTORE isolated APPROVED_ISOLATED_DATABASE' npm run db:restore -- \
  --destination-environment isolated \
  --env-file PATH_TO_ISOLATED_ENV_FILE \
  --approved-host localhost \
  --database APPROVED_ISOLATED_DATABASE \
  --backup PATH_TO_DUMP \
  --manifest PATH_TO_MANIFEST
```

The script permits a valid backup from any source environment into an explicitly named loopback isolated target. It never defaults to production. It rejects missing confirmation, non-loopback isolated targets, ambiguous database names, stale backups, mismatched manifests, checksum changes, and invalid archives. Confirm firewall/network isolation separately. Do not configure the restored application with source-environment credentials or outbound integrations.

## Production restore approvals

Before production restore, require and record approval from OWNER/TBD for incident command, database operations, application operations, security, and business impact. Confirm the exact destination hostname/database, recovery point, maintenance/write-freeze plan, rollback point, tested isolated-restore evidence, communication plan, and provider procedure. The CLI additionally requires both exact confirmations:

```text
CONFIRM_RESTORE=RESTORE production APPROVED_PRODUCTION_DATABASE
CONFIRM_PRODUCTION_RESTORE=RESTORE PRODUCTION
```

These strings are safety interlocks, not substitutes for organizational approval.

## Post-restore validation checklist

Run these checks only against the approved isolated destination first. Production execution requires the approvals above.

- [ ] Confirm connection metadata points to the destination, never the source; keep the source read-only or disconnected.
- [ ] Run `prisma migrate status` using destination-only credentials; record the non-secret result.
- [ ] Verify schema sanity and expected tables from the reviewed Prisma schema.
- [ ] Sample bounded row counts and referential/integrity checks; do not export sensitive rows into evidence.
- [ ] Start the application with outbound email, payments, webhooks, schedulers, and other write-capable integrations disabled.
- [ ] Verify `/api/health` and readiness against the restored destination.
- [ ] Perform an approved read-only smoke test and confirm no accidental writes reached the source environment.
- [ ] Compare observed recovery point and elapsed recovery time with the approved RPO/RTO; record gaps.

## Rollback and evidence

Before cutover, preserve the prior destination recovery point according to the approved retention policy. Define rollback triggers, decision owner, time limit, and exact recovery point in the incident record. Record manifest checksum, archive size, application revision, PostgreSQL tool versions, approvals, timestamps, validation results, restore logs with secrets removed, deviations, and final disposition. Never store passwords, connection strings, tokens, credentials, or sensitive row data in recovery evidence.

Every drill or incident requires an incident record with OWNER/TBD, scope, impact, timeline, selected recovery point, decisions and approvals, validation evidence, RPO/RTO outcome, rollback outcome, follow-up actions, and retention location. Organizational, legal, and notification requirements remain TBD and must not be inferred from this document.

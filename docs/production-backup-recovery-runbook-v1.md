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

### Encrypted backup contract

After the custom-format archive and manifest pass all existing checks, package them together and encrypt the package with `scripts/encrypt-backup.sh`. The approved contract is OpenSSL AES-256-CBC with PBKDF2, 600000 iterations, and a random salt. The encryption secret is loaded at runtime from the protected `pawnloop-production-backup-encryption` secret source; it is never a command-line argument, log value, manifest field, shell-history value, or error message. Use `umask 077`, mode `0700` temporary directories, and mode `0600` archive, manifest, and encrypted output files. The encrypted destination must be unique and must never be overwritten. Encryption writes a temporary sibling and atomically renames it only after a non-empty output check. Delete plaintext only after encryption and integrity checks succeed. If a later restore drill fails, preserve the encrypted artifact for investigation and remove only decrypted/plaintext material.

Decrypt only in an isolated mode-0700 directory with `scripts/decrypt-backup.sh`, using the exact matching command contract: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000`. The secret remains runtime-only and is never emitted. Sanitize `pg_dump`, `pg_restore`, and shell diagnostics before retaining evidence.

The operator must explicitly provide the environment and env file. For a Production backup, place the approved hostname and database name in a dedicated JSON approval file whose parent directory is operator-owned mode `0700` and whose file is operator-owned mode `0600`. The file must be a regular file, not a symlink, and may contain only `hostname` and `databaseName`. Managed database providers can assign a neutral database name that does not contain `prod` or `production`; renaming that provider-managed database is not required. The env file must also contain `PRODUCTION_DATABASE_HOST`, which must exactly match both the parsed PostgreSQL hostname and the protected approval. The parsed database name must exactly match the protected approval. Production rejects loopback targets and any hostname or database name marked local, development, test, or staging. These exact identity checks are independent of credentials and do not relax restore controls.

Production backup execution additionally requires the exact fail-closed confirmation `CONFIRM_PRODUCTION_BACKUP='BACKUP PRODUCTION'`. The value is required only for Production backup and must never be logged. Create the approval file without command-line target values; the placeholders below represent values written by an approved secure process:

```json
{
  "hostname": "APPROVED_PRODUCTION_HOST_PLACEHOLDER",
  "databaseName": "APPROVED_PRODUCTION_DATABASE_PLACEHOLDER"
}
```

After confirming the directory and file modes, run the placeholder-only interface:

```sh
CONFIRM_PRODUCTION_BACKUP='BACKUP PRODUCTION' npm run db:backup -- \
  --environment production \
  --env-file PATH_TO_ENV_FILE \
  --approval-file PATH_TO_MODE_600_APPROVAL_FILE \
  --output-dir PATH_TO_MODE_700_BACKUP_DIRECTORY
```

Never pass the Production hostname or database name through `--approved-host` or `--database`. Shell tracing, command wrappers, process inspection, CI runners, and task transcripts can capture raw arguments before the backup script can redact them. Production rejects those raw target arguments. Internally, the script validates protected files and gives `pg_dump` a fixed libpq service name backed by a short-lived mode-`0600` service file in a mode-`0700` runtime directory; target metadata and the connection URL do not appear in the `pg_dump` argument list. The script removes only runtime files it creates and never deletes the operator's approval or env file.

The script creates a restrictive `0600` custom-format archive and adjacent `0600` JSON manifest in a `0700` directory. It validates the URL target before `pg_dump`, inspects the archive with `pg_restore --list`, and records timestamp, non-secret target identity, exact source schema scope, application revision, filename, size, SHA-256 checksum, archive evidence, and tool version. An empty `sourceSchema` means `pg_dump` captured the full database; it never means an implicit `public` schema. Never attach env files, URLs, credentials, or command traces to an incident record.

V1 does not support schema remapping. The manifest source schema and destination `?schema=` scope must match exactly: schema-scoped backups restore only to the same explicit schema, and full-database backups restore only with no schema scope. Operators must not add, remove, or change `?schema=` merely to force a restore. Any incompatibility is a hard stop requiring a separately reviewed recovery plan. A neutral-name allowance applies only to the read-only Production backup target after every stronger confirmation above passes. It does not make that name eligible as a Production restore destination.

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

The script permits a valid backup from any source environment into an explicitly named loopback isolated target whose database name is unambiguously marked `isolated`, `restore`, `recovery`, or `drill`. It never defaults to production. It rejects missing confirmation, non-loopback isolated targets, ambiguous database names, stale backups, mismatched manifests, checksum changes, and invalid archives. Confirm firewall/network isolation separately. Do not configure the restored application with source-environment credentials or outbound integrations.

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

## Cloudflare containment response contract

Read-only Pages project responses are validated by `scripts/lib/cloudflare-containment.mjs`. The parser requires the successful API envelope, project name `pawnloop-frontend`, and the documented fields under `result.source.config`: `production_branch` must be `main`, `production_deployments_enabled` must be the boolean `false`, and `preview_deployment_setting` must be `all`. It also requires the pinned canonical deployment ID under `result.canonical_deployment.id`. Missing, null, duplicated-at-an-unexpected-location, malformed, or wrongly typed fields fail closed with sanitized errors.

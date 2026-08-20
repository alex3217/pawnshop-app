#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
FAKE_BIN="$TMP_DIR/bin"; mkdir -p "$FAKE_BIN"
BACKUP="$TMP_DIR/synthetic.dump"; MANIFEST="$BACKUP.manifest.json"; ENV_FILE="$TMP_DIR/isolated.env"; TRACE="$TMP_DIR/trace"
printf 'synthetic valid archive\n' >"$BACKUP"
printf 'DATABASE_URL=postgresql://synthetic_user:do-not-print-secret@localhost/pawnloop_restore_drill\n' >"$ENV_FILE"
node "$ROOT/scripts/lib/database-recovery-safety.mjs" manifest --backup "$BACKUP" --environment production --host prod-db.invalid --database pawnloop_production --source-schema "" --revision synthetic --tool-version synthetic --archive-metadata synthetic >"$MANIFEST"

cat >"$FAKE_BIN/pg_restore" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "--list" ]; then
  if grep -q invalid "$2"; then exit 1; fi
  echo 'synthetic archive list'; exit 0
fi
echo 'CREATE TABLE synthetic_restore_check (id integer);'
FAKE
cat >"$FAKE_BIN/pg_dump" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "--version" ]; then echo 'pg_dump synthetic 1.0'; exit 0; fi
if [ -n "${PG_DUMP_TRACE:-}" ]; then printf 'invoked %s\n' "$*" >>"$PG_DUMP_TRACE"; fi
if [ "${1:-}" = "service=pawnloop-production-backup" ]; then
  node -e 'const fs=require("fs"),path=require("path");const f=process.env.PGSERVICEFILE,s=fs.lstatSync(f),d=fs.lstatSync(path.dirname(f));if(s.isSymbolicLink()||!s.isFile()||(s.mode&0o077)!==0||d.isSymbolicLink()||!d.isDirectory()||(d.mode&0o777)!==0o700)process.exit(1)'
fi
if [ -n "${SYNTHETIC_PG_DUMP_FAIL:-}" ]; then printf 'connection failed for %s/%s\n' "$SYNTHETIC_CANARY_HOST" "$SYNTHETIC_CANARY_DATABASE" >&2; exit 1; fi
output=""
for argument in "$@"; do
  case "$argument" in --file=*) output="${argument#--file=}";; esac
done
if [ -z "$output" ]; then echo 'Synthetic pg_dump did not receive an output file.' >&2; exit 1; fi
printf 'synthetic custom archive from fake pg_dump\n' >"$output"
FAKE
cat >"$FAKE_BIN/psql" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf 'psql invoked\n' >>"$SYNTHETIC_TRACE"
while IFS= read -r line; do :; done
FAKE
chmod 755 "$FAKE_BIN/pg_dump" "$FAKE_BIN/pg_restore" "$FAKE_BIN/psql"

PROD_SECURE_DIR="$TMP_DIR/production-secure"; mkdir -m 700 "$PROD_SECURE_DIR"
PROD_ENV_FILE="$PROD_SECURE_DIR/production.env"
PROD_APPROVAL_FILE="$PROD_SECURE_DIR/approval.json"
PROD_OUTPUT_DIR="$TMP_DIR/production-backups"
PROD_TRACE="$TMP_DIR/production-pg-dump-trace"
CANARY_HOST="t60r2bs-canary-host.invalid"
CANARY_DATABASE="t60r2bs_canary_database"
printf 'DATABASE_URL=postgresql://synthetic_user:synthetic-secret@%s/%s?sslmode=require\nPRODUCTION_DATABASE_HOST=%s\n' "$CANARY_HOST" "$CANARY_DATABASE" "$CANARY_HOST" >"$PROD_ENV_FILE"
printf '{"hostname":"%s","databaseName":"%s"}\n' "$CANARY_HOST" "$CANARY_DATABASE" >"$PROD_APPROVAL_FILE"
chmod 600 "$PROD_ENV_FILE" "$PROD_APPROVAL_FILE"
run_production_backup() {
  PG_DUMP_TRACE="$PROD_TRACE" PATH="$FAKE_BIN:$PATH" "$ROOT/scripts/backup-db.sh" --environment production \
    --env-file "$PROD_ENV_FILE" --approval-file "$PROD_APPROVAL_FILE" \
    --output-dir "${PROD_ACTIVE_OUTPUT_DIR:-$PROD_OUTPUT_DIR}"
}
for confirmation in "" "BACKUP production" "RESTORE PRODUCTION"; do
  : >"$PROD_TRACE"
  if CONFIRM_PRODUCTION_BACKUP="$confirmation" run_production_backup >/dev/null 2>&1; then
    echo "FAIL: neutral Production backup passed without the exact confirmation" >&2; exit 1
  fi
  test ! -s "$PROD_TRACE" || { echo "FAIL: failed confirmation reached pg_dump" >&2; exit 1; }
done
PROD_OUTPUT="$(CONFIRM_PRODUCTION_BACKUP='BACKUP PRODUCTION' run_production_backup 2>&1)"
case "$PROD_OUTPUT" in *synthetic-secret*|*synthetic_user*|*postgresql://*|*"$CANARY_HOST"*|*"$CANARY_DATABASE"*) echo "FAIL: Production target or credentials appeared in backup output" >&2; exit 1;; esac
case "$(cat "$PROD_TRACE")" in *"$CANARY_HOST"*|*"$CANARY_DATABASE"*|*postgresql://*|*synthetic-secret*|*synthetic_user*) echo "FAIL: Production target metadata appeared in pg_dump arguments" >&2; exit 1;; esac
: >"$PROD_TRACE"; set +e
FAILURE_OUTPUT="$(PROD_ACTIVE_OUTPUT_DIR="$TMP_DIR/production-failure-output" SYNTHETIC_PG_DUMP_FAIL=1 SYNTHETIC_CANARY_HOST="$CANARY_HOST" SYNTHETIC_CANARY_DATABASE="$CANARY_DATABASE" CONFIRM_PRODUCTION_BACKUP='BACKUP PRODUCTION' run_production_backup 2>&1)"
FAILURE_STATUS=$?; set -e
test "$FAILURE_STATUS" -ne 0 && test -s "$PROD_TRACE" || { echo "FAIL: synthetic pg_dump failure path was not exercised" >&2; exit 1; }
case "$FAILURE_OUTPUT" in *"$CANARY_HOST"*|*"$CANARY_DATABASE"*|*synthetic-secret*|*synthetic_user*|*postgresql://*) echo "FAIL: Production pg_dump error exposed target metadata" >&2; exit 1;; esac
PROD_BACKUP="$(find "$PROD_OUTPUT_DIR" -type f -name 'pawnloop-production-*.dump' -print)"
test -s "$PROD_BACKUP" && test -s "$PROD_BACKUP.manifest.json" || { echo "FAIL: confirmed neutral Production backup was not created" >&2; exit 1; }
test -f "$PROD_APPROVAL_FILE" && test -f "$PROD_ENV_FILE" || { echo "FAIL: backup deleted an operator-owned input file" >&2; exit 1; }
XTRACE_OUTPUT_DIR="$TMP_DIR/production-xtrace-backups"; : >"$PROD_TRACE"
XTRACE_OUTPUT="$(CONFIRM_PRODUCTION_BACKUP='BACKUP PRODUCTION' PG_DUMP_TRACE="$PROD_TRACE" PATH="$FAKE_BIN:$PATH" bash -x "$ROOT/scripts/backup-db.sh" \
  --environment production --env-file "$PROD_ENV_FILE" --approval-file "$PROD_APPROVAL_FILE" --output-dir "$XTRACE_OUTPUT_DIR" 2>&1)"
case "$XTRACE_OUTPUT" in *"$CANARY_HOST"*|*"$CANARY_DATABASE"*|*synthetic-secret*|*synthetic_user*|*postgresql://*) echo "FAIL: Production target metadata appeared in shell trace" >&2; exit 1;; esac
if rg -q --fixed-strings "$CANARY_HOST" "$ROOT/docs/production-backup-recovery-runbook-v1.md" || rg -q --fixed-strings "$CANARY_DATABASE" "$ROOT/docs/production-backup-recovery-runbook-v1.md"; then
  echo "FAIL: synthetic Production canary appeared in documented examples" >&2; exit 1
fi

assert_production_rejected() {
  local label="$1" env_file="$2" approval_file="$3"
  : >"$PROD_TRACE"
  local output status
  set +e
  output="$(CONFIRM_PRODUCTION_BACKUP='BACKUP PRODUCTION' PG_DUMP_TRACE="$PROD_TRACE" PATH="$FAKE_BIN:$PATH" "$ROOT/scripts/backup-db.sh" \
    --environment production --env-file "$env_file" --approval-file "$approval_file" --output-dir "$TMP_DIR/rejected-output" 2>&1)"
  status=$?
  set -e
  test "$status" -ne 0 || { echo "FAIL: $label was accepted" >&2; exit 1; }
  test ! -s "$PROD_TRACE" || { echo "FAIL: $label reached pg_dump" >&2; exit 1; }
  case "$output" in *"$CANARY_HOST"*|*"$CANARY_DATABASE"*|*synthetic-secret*|*synthetic_user*|*postgresql://*) echo "FAIL: $label exposed target metadata" >&2; exit 1;; esac
}

: >"$PROD_TRACE"
if CONFIRM_PRODUCTION_BACKUP='BACKUP PRODUCTION' PG_DUMP_TRACE="$PROD_TRACE" PATH="$FAKE_BIN:$PATH" "$ROOT/scripts/backup-db.sh" \
  --environment production --env-file "$PROD_ENV_FILE" --approved-host "$CANARY_HOST" --database "$CANARY_DATABASE" --output-dir "$TMP_DIR/raw-output" >/dev/null 2>&1; then
  echo "FAIL: raw Production target arguments were accepted" >&2; exit 1
fi
test ! -s "$PROD_TRACE" || { echo "FAIL: rejected raw Production arguments reached pg_dump" >&2; exit 1; }

assert_production_rejected "missing approval" "$PROD_ENV_FILE" "$PROD_SECURE_DIR/missing.json"
ln -s "$PROD_APPROVAL_FILE" "$PROD_SECURE_DIR/approval-link.json"
assert_production_rejected "symlink approval" "$PROD_ENV_FILE" "$PROD_SECURE_DIR/approval-link.json"
cp "$PROD_APPROVAL_FILE" "$PROD_SECURE_DIR/insecure.json"; chmod 644 "$PROD_SECURE_DIR/insecure.json"
assert_production_rejected "insecure approval permissions" "$PROD_ENV_FILE" "$PROD_SECURE_DIR/insecure.json"
printf '{"hostname":"%s"}\n' "$CANARY_HOST" >"$PROD_SECURE_DIR/missing-value.json"; chmod 600 "$PROD_SECURE_DIR/missing-value.json"
assert_production_rejected "missing approval value" "$PROD_ENV_FILE" "$PROD_SECURE_DIR/missing-value.json"
printf '{"hostname":"bad host","databaseName":"%s"}\n' "$CANARY_DATABASE" >"$PROD_SECURE_DIR/malformed-value.json"; chmod 600 "$PROD_SECURE_DIR/malformed-value.json"
assert_production_rejected "malformed approval value" "$PROD_ENV_FILE" "$PROD_SECURE_DIR/malformed-value.json"
printf '{"hostname":"%s","databaseName":"%s","extra":"not-allowed"}\n' "$CANARY_HOST" "$CANARY_DATABASE" >"$PROD_SECURE_DIR/extra-value.json"; chmod 600 "$PROD_SECURE_DIR/extra-value.json"
assert_production_rejected "extra approval value" "$PROD_ENV_FILE" "$PROD_SECURE_DIR/extra-value.json"
printf '{"hostname":"other.invalid","databaseName":"%s"}\n' "$CANARY_DATABASE" >"$PROD_SECURE_DIR/host-mismatch.json"; chmod 600 "$PROD_SECURE_DIR/host-mismatch.json"
assert_production_rejected "host mismatch" "$PROD_ENV_FILE" "$PROD_SECURE_DIR/host-mismatch.json"
printf '{"hostname":"%s","databaseName":"other_database"}\n' "$CANARY_HOST" >"$PROD_SECURE_DIR/database-mismatch.json"; chmod 600 "$PROD_SECURE_DIR/database-mismatch.json"
assert_production_rejected "database mismatch" "$PROD_ENV_FILE" "$PROD_SECURE_DIR/database-mismatch.json"
printf 'DATABASE_URL=postgresql://synthetic_user:synthetic-secret@%s/%s\n' "$CANARY_HOST" "$CANARY_DATABASE" >"$PROD_SECURE_DIR/missing-host.env"; chmod 600 "$PROD_SECURE_DIR/missing-host.env"
assert_production_rejected "missing Production host" "$PROD_SECURE_DIR/missing-host.env" "$PROD_APPROVAL_FILE"
for marker in local dev development test testing stage staging; do
  printf 'DATABASE_URL=postgresql://synthetic_user:synthetic-secret@%s.invalid/%s_database\nPRODUCTION_DATABASE_HOST=%s.invalid\n' "$marker" "$marker" "$marker" >"$PROD_SECURE_DIR/marker.env"
  printf '{"hostname":"%s.invalid","databaseName":"%s_database"}\n' "$marker" "$marker" >"$PROD_SECURE_DIR/marker.json"
  chmod 600 "$PROD_SECURE_DIR/marker.env" "$PROD_SECURE_DIR/marker.json"
  assert_production_rejected "forbidden Production marker" "$PROD_SECURE_DIR/marker.env" "$PROD_SECURE_DIR/marker.json"
done
printf 'DATABASE_URL=postgresql://synthetic_user:synthetic-secret@localhost/%s\nPRODUCTION_DATABASE_HOST=localhost\n' "$CANARY_DATABASE" >"$PROD_SECURE_DIR/loopback.env"
printf '{"hostname":"localhost","databaseName":"%s"}\n' "$CANARY_DATABASE" >"$PROD_SECURE_DIR/loopback.json"
chmod 600 "$PROD_SECURE_DIR/loopback.env" "$PROD_SECURE_DIR/loopback.json"
assert_production_rejected "loopback Production target" "$PROD_SECURE_DIR/loopback.env" "$PROD_SECURE_DIR/loopback.json"

DEV_ENV_FILE="$TMP_DIR/development.env"
DEV_OUTPUT_DIR="$TMP_DIR/development-backups"
DEV_SECRET="p1-interface-secret-password"
printf 'DATABASE_URL=postgresql://p1_interface_user:%s@localhost/pawnshop?schema=public\n' "$DEV_SECRET" >"$DEV_ENV_FILE"
BACKUP_OUTPUT="$(cd "$ROOT" && PATH="$FAKE_BIN:$PATH" npm run db:backup -- \
  --environment development --env-file "$DEV_ENV_FILE" --approved-host localhost \
  --database pawnshop --output-dir "$DEV_OUTPUT_DIR" 2>&1)"
case "$BACKUP_OUTPUT" in *"$DEV_SECRET"*|*p1_interface_user*|*postgresql://*) echo "FAIL: synthetic backup credentials appeared in output" >&2; exit 1;; esac
DEV_BACKUP="$(find "$DEV_OUTPUT_DIR" -type f -name 'pawnloop-development-*.dump' -print)"
if [ -z "$DEV_BACKUP" ] || [ ! -s "$DEV_BACKUP" ]; then echo "FAIL: interface backup was not created" >&2; exit 1; fi
DEV_MANIFEST="$DEV_BACKUP.manifest.json"
if [ ! -s "$DEV_MANIFEST" ]; then echo "FAIL: interface backup manifest was not created" >&2; exit 1; fi
node "$ROOT/scripts/lib/database-recovery-safety.mjs" validate --backup "$DEV_BACKUP" \
  --manifest "$DEV_MANIFEST" --environment development --max-age-hours 1 >/dev/null
MANIFEST_DATABASE="$(MANIFEST_FILE="$DEV_MANIFEST" node -e 'const m=require(process.env.MANIFEST_FILE); process.stdout.write(m.databaseName)')"
if [ "$MANIFEST_DATABASE" != "pawnshop" ]; then echo "FAIL: interface manifest database mismatch" >&2; exit 1; fi
MANIFEST_SOURCE_SCHEMA="$(MANIFEST_FILE="$DEV_MANIFEST" node -e 'const m=require(process.env.MANIFEST_FILE); process.stdout.write(m.sourceSchema)')"
if [ "$MANIFEST_SOURCE_SCHEMA" != "public" ]; then echo "FAIL: schema-scoped backup manifest did not record public" >&2; exit 1; fi

IPV6_ENV_FILE="$TMP_DIR/development-ipv6.env"
IPV6_OUTPUT_DIR="$TMP_DIR/development-ipv6-backups"
printf 'DATABASE_URL=postgresql://ipv6_interface_user:ipv6-interface-secret@[::1]/pawnshop\n' >"$IPV6_ENV_FILE"
IPV6_OUTPUT="$(cd "$ROOT" && PATH="$FAKE_BIN:$PATH" npm run db:backup -- \
  --environment development --env-file "$IPV6_ENV_FILE" --approved-host ::1 \
  --database pawnshop --output-dir "$IPV6_OUTPUT_DIR" 2>&1)"
case "$IPV6_OUTPUT" in *ipv6-interface-secret*|*ipv6_interface_user*|*postgresql://*) echo "FAIL: IPv6 backup credentials appeared in output" >&2; exit 1;; esac
IPV6_BACKUP="$(find "$IPV6_OUTPUT_DIR" -type f -name 'pawnloop-development-*.dump' -print)"
if [ -z "$IPV6_BACKUP" ] || [ ! -s "$IPV6_BACKUP.manifest.json" ]; then echo "FAIL: IPv6 interface backup or manifest was not created" >&2; exit 1; fi
IPV6_MANIFEST_HOST="$(MANIFEST_FILE="$IPV6_BACKUP.manifest.json" node -e 'const m=require(process.env.MANIFEST_FILE); process.stdout.write(m.approvedHostname)')"
if [ "$IPV6_MANIFEST_HOST" != "::1" ]; then echo "FAIL: IPv6 manifest hostname was not normalized" >&2; exit 1; fi

run_restore() {
  PATH="$FAKE_BIN:$PATH" SYNTHETIC_TRACE="$TRACE" "$ROOT/scripts/restore-db.sh" \
    --destination-environment isolated --env-file "$ENV_FILE" --approved-host localhost \
    --database pawnloop_restore_drill --backup "$BACKUP" --manifest "$MANIFEST"
}

if run_restore >/dev/null 2>&1; then echo "FAIL: restore passed without destructive confirmation" >&2; exit 1; fi
CONFIRM_RESTORE="RESTORE isolated pawnloop_restore_drill" run_restore >/dev/null
test -s "$TRACE" || { echo "FAIL: isolated restore did not reach synthetic psql" >&2; exit 1; }

PROD_RESTORE_ENV="$TMP_DIR/production-restore.env"
printf 'DATABASE_URL=postgresql://restore_user:restore-secret@prod-db.invalid/pawnloop_production\n' >"$PROD_RESTORE_ENV"
: >"$TRACE"
if PATH="$FAKE_BIN:$PATH" SYNTHETIC_TRACE="$TRACE" CONFIRM_RESTORE='RESTORE production pawnloop_production' \
  "$ROOT/scripts/restore-db.sh" --destination-environment production --env-file "$PROD_RESTORE_ENV" \
  --approved-host prod-db.invalid --database pawnloop_production --backup "$BACKUP" --manifest "$MANIFEST" >/dev/null 2>&1; then
  echo "FAIL: Production restore passed without separate Production confirmation" >&2; exit 1
fi
test ! -s "$TRACE" || { echo "FAIL: blocked Production restore reached synthetic psql" >&2; exit 1; }

SCOPED_PUBLIC_ENV="$TMP_DIR/isolated-public.env"
SCOPED_OTHER_ENV="$TMP_DIR/isolated-other.env"
SCOPED_FULL_ENV="$TMP_DIR/isolated-full.env"
printf 'DATABASE_URL=postgresql://scoped_user:scoped-secret@localhost/pawnloop_restore_drill?schema=public\n' >"$SCOPED_PUBLIC_ENV"
printf 'DATABASE_URL=postgresql://scoped_user:scoped-secret@localhost/pawnloop_restore_drill?schema=other\n' >"$SCOPED_OTHER_ENV"
printf 'DATABASE_URL=postgresql://scoped_user:scoped-secret@localhost/pawnloop_restore_drill\n' >"$SCOPED_FULL_ENV"

run_scoped_restore() {
  local destination_env_file="$1"
  PATH="$FAKE_BIN:$PATH" SYNTHETIC_TRACE="$TRACE" CONFIRM_RESTORE="RESTORE isolated pawnloop_restore_drill" \
    "$ROOT/scripts/restore-db.sh" --destination-environment isolated --env-file "$destination_env_file" \
    --approved-host localhost --database pawnloop_restore_drill --backup "$DEV_BACKUP" --manifest "$DEV_MANIFEST"
}

: >"$TRACE"
run_scoped_restore "$SCOPED_PUBLIC_ENV" >/dev/null
test -s "$TRACE" || { echo "FAIL: matching schema-scoped restore did not invoke synthetic psql" >&2; exit 1; }

for mismatch_env in "$SCOPED_OTHER_ENV" "$SCOPED_FULL_ENV"; do
  : >"$TRACE"
  if run_scoped_restore "$mismatch_env" >/dev/null 2>&1; then echo "FAIL: incompatible schema-scoped restore passed" >&2; exit 1; fi
  if [ -s "$TRACE" ]; then echo "FAIL: schema mismatch invoked synthetic psql" >&2; exit 1; fi
done

: >"$TRACE"
CONFIRM_RESTORE="RESTORE isolated pawnloop_restore_drill" run_restore >/dev/null
test -s "$TRACE" || { echo "FAIL: full-database restore to full scope did not invoke synthetic psql" >&2; exit 1; }
: >"$TRACE"
if PATH="$FAKE_BIN:$PATH" SYNTHETIC_TRACE="$TRACE" CONFIRM_RESTORE="RESTORE isolated pawnloop_restore_drill" \
  "$ROOT/scripts/restore-db.sh" --destination-environment isolated --env-file "$SCOPED_PUBLIC_ENV" \
  --approved-host localhost --database pawnloop_restore_drill --backup "$BACKUP" --manifest "$MANIFEST" >/dev/null 2>&1; then
  echo "FAIL: full-database backup restored to schema-scoped destination" >&2; exit 1
fi
if [ -s "$TRACE" ]; then echo "FAIL: full-to-scoped mismatch invoked synthetic psql" >&2; exit 1; fi

printf 'invalid archive\n' >"$BACKUP"
node "$ROOT/scripts/lib/database-recovery-safety.mjs" manifest --backup "$BACKUP" --environment production --host prod-db.invalid --database pawnloop_production --source-schema "" --revision synthetic --tool-version synthetic --archive-metadata synthetic >"$MANIFEST"
if CONFIRM_RESTORE="RESTORE isolated pawnloop_restore_drill" run_restore >/dev/null 2>&1; then echo "FAIL: invalid archive was accepted" >&2; exit 1; fi

OUTPUT="$(CONFIRM_RESTORE=wrong run_restore 2>&1 || true)"
case "$OUTPUT" in *do-not-print-secret*|*synthetic_user*) echo "FAIL: secret appeared in restore output" >&2; exit 1;; esac
echo "Database recovery shell tests passed; only synthetic files and fake PostgreSQL clients were used."

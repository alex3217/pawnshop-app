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

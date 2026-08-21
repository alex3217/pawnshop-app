#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() { echo "Usage: $0 --backup PATH --manifest PATH --output PATH --working-dir PATH" >&2; exit 1; }
BACKUP=""; MANIFEST=""; OUTPUT=""; WORKING_DIR=""
ENCRYPTION_SECRET="${BACKUP_ENCRYPTION_SECRET:-}"; unset BACKUP_ENCRYPTION_SECRET
while [ "$#" -gt 0 ]; do
  case "$1" in
    --backup) BACKUP="${2:-}"; shift 2;;
    --manifest) MANIFEST="${2:-}"; shift 2;;
    --output) OUTPUT="${2:-}"; shift 2;;
    --working-dir) WORKING_DIR="${2:-}"; shift 2;;
    *) usage;;
  esac
done
[ -f "$BACKUP" ] && [ -f "$MANIFEST" ] && [ -n "$OUTPUT" ] && [ -n "$WORKING_DIR" ] || usage
[ ! -e "$OUTPUT" ] || { echo "Encrypted backup already exists; refusing to overwrite it." >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKING_DIR="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" dir "$WORKING_DIR")" || { echo "Backup safety validation failed." >&2; exit 1; }
BACKUP_RECORD="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" file "$BACKUP" "$WORKING_DIR" backup)" || { echo "Backup safety validation failed." >&2; exit 1; }
MANIFEST_RECORD="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" file "$MANIFEST" "$WORKING_DIR" manifest)" || { echo "Backup safety validation failed." >&2; exit 1; }
BACKUP="$(RECORD="$BACKUP_RECORD" node -e 'process.stdout.write(JSON.parse(process.env.RECORD).canonical)')"
MANIFEST="$(RECORD="$MANIFEST_RECORD" node -e 'process.stdout.write(JSON.parse(process.env.RECORD).canonical)')"
OUTPUT="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" output "$OUTPUT" "$WORKING_DIR")" || { echo "Backup safety validation failed." >&2; exit 1; }
[ "$OUTPUT" != "$BACKUP" ] && [ "$OUTPUT" != "$MANIFEST" ] || { echo "Backup safety validation failed." >&2; exit 1; }
BACKUP_RECORD="$BACKUP_RECORD" MANIFEST_RECORD="$MANIFEST_RECORD" node -e 'const a=JSON.parse(process.env.BACKUP_RECORD),b=JSON.parse(process.env.MANIFEST_RECORD);if(a.dev===b.dev&&a.ino===b.ino)process.exit(1)' || { echo "Backup safety validation failed." >&2; exit 1; }
TMP_DIR="$(mktemp -d "$WORKING_DIR/.encrypt.XXXXXX")"; chmod 700 "$TMP_DIR"
ARCHIVE="$TMP_DIR/backup.tar"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT INT TERM

if [ -z "$ENCRYPTION_SECRET" ]; then
  ENCRYPTION_SECRET="$(security find-generic-password -s pawnloop-production-backup-encryption -w)" || { echo "Encryption secret unavailable." >&2; exit 1; }
fi
[ -n "$ENCRYPTION_SECRET" ] || { echo "Encryption secret unavailable." >&2; exit 1; }

COPYFILE_DISABLE=1 tar --format=ustar -C "$(dirname "$BACKUP")" -cf "$ARCHIVE" "$(basename "$BACKUP")" "$(basename "$MANIFEST")" >/dev/null 2>&1 || { echo "Backup packaging failed." >&2; exit 1; }
chmod 600 "$ARCHIVE"
TMP_OUTPUT="$(mktemp "$TMP_DIR/encrypted.XXXXXX")"; chmod 600 "$TMP_OUTPUT"
trap cleanup EXIT INT TERM
BACKUP_ENCRYPTION_SECRET="$ENCRYPTION_SECRET" openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$ARCHIVE" -out "$TMP_OUTPUT" -pass env:BACKUP_ENCRYPTION_SECRET >/dev/null 2>&1 || { rm -f "$TMP_OUTPUT"; echo "Backup encryption failed." >&2; exit 1; }
chmod 600 "$TMP_OUTPUT"
[ -s "$TMP_OUTPUT" ] || { rm -f "$TMP_OUTPUT"; echo "Encrypted backup is empty." >&2; exit 1; }
VERIFY_ARCHIVE="$TMP_DIR/verify.tar"
BACKUP_ENCRYPTION_SECRET="$ENCRYPTION_SECRET" openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$TMP_OUTPUT" -out "$VERIFY_ARCHIVE" -pass env:BACKUP_ENCRYPTION_SECRET >/dev/null 2>&1 || { rm -f "$TMP_OUTPUT"; echo "Encrypted backup integrity check failed." >&2; exit 1; }
ENCRYPTION_SECRET=""
tar -tf "$VERIFY_ARCHIVE" >/dev/null 2>&1 || { rm -f "$TMP_OUTPUT"; echo "Encrypted backup integrity check failed." >&2; exit 1; }
ln "$TMP_OUTPUT" "$OUTPUT" 2>/dev/null || { echo "Encrypted destination exists; refusing to overwrite it." >&2; exit 1; }
rm -f "$TMP_OUTPUT"; chmod 600 "$OUTPUT"
OUTPUT_RECORD="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" file "$OUTPUT" "$WORKING_DIR" encrypted)" || { echo "Encrypted output validation failed." >&2; exit 1; }
BACKUP_RECORD="$BACKUP_RECORD" MANIFEST_RECORD="$MANIFEST_RECORD" OUTPUT_RECORD="$OUTPUT_RECORD" node -e 'const x=[process.env.BACKUP_RECORD,process.env.MANIFEST_RECORD,process.env.OUTPUT_RECORD].map(JSON.parse),s=new Set(x.map(v=>`${v.dev}:${v.ino}`));if(s.size!==3)process.exit(1)' || { echo "Backup safety validation failed." >&2; exit 1; }
node "$ROOT/scripts/lib/backup-process-safety.mjs" delete "$BACKUP_RECORD" "$WORKING_DIR" >/dev/null || { echo "Plaintext cleanup failed safely." >&2; exit 1; }
node "$ROOT/scripts/lib/backup-process-safety.mjs" delete "$MANIFEST_RECORD" "$WORKING_DIR" >/dev/null || { echo "Plaintext cleanup failed safely." >&2; exit 1; }
printf 'Encrypted backup created.\n'

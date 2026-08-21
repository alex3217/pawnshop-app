#!/usr/bin/env bash
set -euo pipefail
umask 077
usage() { echo "Usage: $0 --input PATH --output-dir PATH --working-dir PATH" >&2; exit 1; }
INPUT=""; OUTPUT_DIR=""; WORKING_DIR=""
ENCRYPTION_SECRET="${BACKUP_ENCRYPTION_SECRET:-}"; unset BACKUP_ENCRYPTION_SECRET
while [ "$#" -gt 0 ]; do
  case "$1" in
    --input) INPUT="${2:-}"; shift 2;;
    --output-dir) OUTPUT_DIR="${2:-}"; shift 2;;
    --working-dir) WORKING_DIR="${2:-}"; shift 2;;
    *) usage;;
  esac
done
[ -f "$INPUT" ] && [ -n "$OUTPUT_DIR" ] && [ -n "$WORKING_DIR" ] || usage
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKING_DIR="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" dir "$WORKING_DIR")" || { echo "Backup safety validation failed." >&2; exit 1; }
INPUT_RECORD="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" file "$INPUT" "$WORKING_DIR" encrypted)" || { echo "Backup safety validation failed." >&2; exit 1; }
INPUT="$(RECORD="$INPUT_RECORD" node -e 'process.stdout.write(JSON.parse(process.env.RECORD).canonical)')"
OUTPUT_RECORD="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" create-directory "$OUTPUT_DIR" "$WORKING_DIR")" || { echo "Backup safety validation failed." >&2; exit 1; }
TMP_ARCHIVE=""; TMP_RECORD=""; KEEP_OUTPUT=0
cleanup_resources() {
  local status="$?" cleanup_failed=0
  if [ -n "${TMP_RECORD:-}" ]; then env -i PATH="$PATH" node "$ROOT/scripts/lib/backup-process-safety.mjs" delete "$TMP_RECORD" "$WORKING_DIR" >/dev/null 2>&1 || cleanup_failed=1; TMP_RECORD=""; fi
  if [ "$KEEP_OUTPUT" -ne 1 ] && [ -n "${OUTPUT_RECORD:-}" ]; then env -i PATH="$PATH" node "$ROOT/scripts/lib/backup-process-safety.mjs" delete-directory "$OUTPUT_RECORD" "$WORKING_DIR" >/dev/null 2>&1 || cleanup_failed=1; OUTPUT_RECORD=""; fi
  if [ "$cleanup_failed" -ne 0 ]; then echo "Backup cleanup failed safely." >&2; trap - EXIT; exit 1; fi
  return "$status"
}
trap cleanup_resources EXIT
OUTPUT_DIR="$(printf '%s' "$OUTPUT_RECORD" | env -i PATH="$PATH" node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).canonical)')"
TMP_ARCHIVE="$(mktemp "$WORKING_DIR/.decrypt.XXXXXX.tar")"; chmod 600 "$TMP_ARCHIVE"
TMP_RECORD="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" file "$TMP_ARCHIVE" "$WORKING_DIR")" || { echo "Backup safety validation failed." >&2; exit 1; }
if [ -z "$ENCRYPTION_SECRET" ]; then
  ENCRYPTION_SECRET="$(security find-generic-password -s pawnloop-production-backup-encryption -w)" || { echo "Decryption secret unavailable." >&2; exit 1; }
fi
[ -n "$ENCRYPTION_SECRET" ] || { echo "Decryption secret unavailable." >&2; exit 1; }
if ! BACKUP_ENCRYPTION_SECRET="$ENCRYPTION_SECRET" openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$INPUT" -out "$TMP_ARCHIVE" -pass env:BACKUP_ENCRYPTION_SECRET >/dev/null 2>&1; then
  echo "Backup decryption failed." >&2; exit 1
fi
ENCRYPTION_SECRET=""
if ! EXTRACTION_RESULT="$(env -i PATH="$PATH" node "$ROOT/scripts/lib/backup-process-safety.mjs" extract-archive "$TMP_ARCHIVE" "$WORKING_DIR" "$OUTPUT_RECORD")"; then
  OUTPUT_RECORD=""; echo "Backup archive extraction failed." >&2; exit 1
fi
OUTPUT_RECORD="$(printf '%s' "$EXTRACTION_RESULT" | env -i PATH="$PATH" node -e 'const fs=require("fs");process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(0,"utf8")).directory))')"
env -i PATH="$PATH" node "$ROOT/scripts/lib/backup-process-safety.mjs" delete "$TMP_RECORD" "$WORKING_DIR" >/dev/null || { echo "Plaintext cleanup failed safely." >&2; exit 1; }
TMP_RECORD=""
KEEP_OUTPUT=1
printf 'Backup decrypted.\n'

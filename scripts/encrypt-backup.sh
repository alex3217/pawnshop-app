#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() { echo "Usage: $0 --backup PATH --manifest PATH --output PATH" >&2; exit 1; }
BACKUP=""; MANIFEST=""; OUTPUT=""; WORKING_DIR=""
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
BACKUP="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" file "$BACKUP" "$WORKING_DIR")" || { echo "Backup safety validation failed." >&2; exit 1; }
MANIFEST="$(node "$ROOT/scripts/lib/backup-process-safety.mjs" file "$MANIFEST" "$WORKING_DIR")" || { echo "Backup safety validation failed." >&2; exit 1; }
OUTPUT_DIR_CANON="$(node -e 'const fs=require("fs"); process.stdout.write(fs.realpathSync(process.argv[1]))' "$(dirname "$OUTPUT")")" || { echo "Backup safety validation failed." >&2; exit 1; }
OUTPUT="$OUTPUT_DIR_CANON/$(basename "$OUTPUT")"
case "$OUTPUT" in "$BACKUP"|"$MANIFEST"|"$WORKING_DIR"/*) ;; *) echo "Backup safety validation failed." >&2; exit 1;; esac
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pawnloop-encrypt.XXXXXX")"; chmod 700 "$TMP_DIR"
ARCHIVE="$TMP_DIR/backup.tar"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT INT TERM

if [ -z "${BACKUP_ENCRYPTION_SECRET:-}" ]; then
  BACKUP_ENCRYPTION_SECRET="$(security find-generic-password -s pawnloop-production-backup-encryption -w)" || { echo "Encryption secret unavailable." >&2; exit 1; }
  export BACKUP_ENCRYPTION_SECRET
fi
[ -n "$BACKUP_ENCRYPTION_SECRET" ] || { echo "Encryption secret unavailable." >&2; exit 1; }

tar -C "$(dirname "$BACKUP")" -cf "$ARCHIVE" "$(basename "$BACKUP")" "$(basename "$MANIFEST")" >/dev/null 2>&1 || { echo "Backup packaging failed." >&2; exit 1; }
chmod 600 "$ARCHIVE"
TMP_OUTPUT="$OUTPUT.tmp.$$"
trap 'rm -f "$TMP_OUTPUT"; cleanup' EXIT INT TERM
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$ARCHIVE" -out "$TMP_OUTPUT" -pass env:BACKUP_ENCRYPTION_SECRET >/dev/null 2>&1 || { rm -f "$TMP_OUTPUT"; echo "Backup encryption failed." >&2; exit 1; }
chmod 600 "$TMP_OUTPUT"
[ -s "$TMP_OUTPUT" ] || { rm -f "$TMP_OUTPUT"; echo "Encrypted backup is empty." >&2; exit 1; }
VERIFY_ARCHIVE="$TMP_DIR/verify.tar"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$TMP_OUTPUT" -out "$VERIFY_ARCHIVE" -pass env:BACKUP_ENCRYPTION_SECRET >/dev/null 2>&1 || { rm -f "$TMP_OUTPUT"; echo "Encrypted backup integrity check failed." >&2; exit 1; }
tar -tf "$VERIFY_ARCHIVE" >/dev/null 2>&1 || { rm -f "$TMP_OUTPUT"; echo "Encrypted backup integrity check failed." >&2; exit 1; }
mv -n "$TMP_OUTPUT" "$OUTPUT" || { rm -f "$TMP_OUTPUT"; echo "Encrypted destination exists; refusing to overwrite it." >&2; exit 1; }
chmod 600 "$OUTPUT"
rm -f "$BACKUP" "$MANIFEST"
printf 'Encrypted backup created.\n'

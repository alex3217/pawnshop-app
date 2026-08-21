#!/usr/bin/env bash
set -euo pipefail
umask 077
usage() { echo "Usage: $0 --input PATH --output-dir PATH" >&2; exit 1; }
INPUT=""; OUTPUT_DIR=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --input) INPUT="${2:-}"; shift 2;;
    --output-dir) OUTPUT_DIR="${2:-}"; shift 2;;
    *) usage;;
  esac
done
[ -f "$INPUT" ] && [ -n "$OUTPUT_DIR" ] || usage
[ ! -e "$OUTPUT_DIR" ] || { echo "Output directory already exists." >&2; exit 1; }
mkdir -p "$OUTPUT_DIR"; chmod 700 "$OUTPUT_DIR"
if [ -z "${BACKUP_ENCRYPTION_SECRET:-}" ]; then
  BACKUP_ENCRYPTION_SECRET="$(security find-generic-password -s pawnloop-production-backup-encryption -w)" || { rm -rf "$OUTPUT_DIR"; echo "Decryption secret unavailable." >&2; exit 1; }
  export BACKUP_ENCRYPTION_SECRET
fi
[ -n "$BACKUP_ENCRYPTION_SECRET" ] || { rm -rf "$OUTPUT_DIR"; echo "Decryption secret unavailable." >&2; exit 1; }
TMP_ARCHIVE="$OUTPUT_DIR/backup.tar.tmp"
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$INPUT" -out "$TMP_ARCHIVE" -pass env:BACKUP_ENCRYPTION_SECRET >/dev/null 2>&1; then
  rm -rf "$OUTPUT_DIR"; echo "Backup decryption failed." >&2; exit 1
fi
if ! tar -C "$OUTPUT_DIR" -xf "$TMP_ARCHIVE" >/dev/null 2>&1; then
  rm -rf "$OUTPUT_DIR"; echo "Backup archive extraction failed." >&2; exit 1
fi
rm -f "$TMP_ARCHIVE"
chmod 600 "$OUTPUT_DIR"/*
printf 'Backup decrypted.\n'

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
FAKE_BIN="$TMP_DIR/fake-bin"
CALL_LOG="$TMP_DIR/curl-calls.log"

mkdir -p "$FAKE_BIN"
cat >"$FAKE_BIN/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail

connect_timeout=""
max_time=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --connect-timeout) connect_timeout="${2:-}"; shift 2 ;;
    --max-time) max_time="${2:-}"; shift 2 ;;
    -sS) shift ;;
    *) url="$1"; shift ;;
  esac
done

if [ "$connect_timeout" != "${FAKE_EXPECT_CONNECT:-5}" ]; then
  echo "Missing or unexpected connection timeout: $connect_timeout" >&2
  exit 90
fi
if [ "$max_time" != "${FAKE_EXPECT_MAX:-15}" ]; then
  echo "Missing or unexpected total timeout: $max_time" >&2
  exit 91
fi
case "$url" in
  http://synthetic.invalid/api/health|http://synthetic.invalid/api/ready|http://synthetic.invalid/api/items?limit=5|http://synthetic.invalid/api/auctions?limit=5) ;;
  *) echo "Unexpected synthetic URL: $url" >&2; exit 92 ;;
esac

printf '%s\t%s\t%s\n' "$connect_timeout" "$max_time" "$url" >>"$FAKE_CURL_LOG"
if [ "${FAKE_CURL_TIMEOUT:-0}" = "1" ]; then
  exit 28
fi
printf '{"ok":true,"success":true,"data":[]}\n'
FAKE_CURL
chmod 755 "$FAKE_BIN/curl"

run_smoke() {
  PATH="$FAKE_BIN:$PATH" BASE_URL="http://synthetic.invalid" FAKE_CURL_LOG="$CALL_LOG" \
    bash "$ROOT/scripts/check-prod-smoke.sh"
}

run_smoke >/dev/null
if [ "$(wc -l <"$CALL_LOG" | tr -d ' ')" != "4" ]; then
  echo "Expected exactly four bounded curl calls." >&2
  exit 1
fi

: >"$CALL_LOG"
PATH="$FAKE_BIN:$PATH" BASE_URL="http://synthetic.invalid" FAKE_CURL_LOG="$CALL_LOG" \
  FAKE_EXPECT_CONNECT=7 FAKE_EXPECT_MAX=20 CURL_CONNECT_TIMEOUT_SECONDS=7 CURL_MAX_TIME_SECONDS=20 \
  bash "$ROOT/scripts/check-prod-smoke.sh" >/dev/null
if [ "$(wc -l <"$CALL_LOG" | tr -d ' ')" != "4" ]; then
  echo "Expected four curl calls with validated timeout overrides." >&2
  exit 1
fi

invalid_cases=(
  "CURL_CONNECT_TIMEOUT_SECONDS="
  "CURL_CONNECT_TIMEOUT_SECONDS=0"
  "CURL_CONNECT_TIMEOUT_SECONDS=-1"
  "CURL_CONNECT_TIMEOUT_SECONDS=1.5"
  "CURL_CONNECT_TIMEOUT_SECONDS=abc"
  "CURL_CONNECT_TIMEOUT_SECONDS=61"
  "CURL_MAX_TIME_SECONDS="
  "CURL_MAX_TIME_SECONDS=0"
  "CURL_MAX_TIME_SECONDS=-1"
  "CURL_MAX_TIME_SECONDS=1.5"
  "CURL_MAX_TIME_SECONDS=abc"
  "CURL_MAX_TIME_SECONDS=301"
)
for setting in "${invalid_cases[@]}"; do
  if env "$setting" PATH="$FAKE_BIN:$PATH" BASE_URL="http://synthetic.invalid" FAKE_CURL_LOG="$CALL_LOG" \
    bash "$ROOT/scripts/check-prod-smoke.sh" >/dev/null 2>&1; then
    echo "Expected invalid timeout to fail: $setting" >&2
    exit 1
  fi
done

if PATH="$FAKE_BIN:$PATH" BASE_URL="http://synthetic.invalid" FAKE_CURL_LOG="$CALL_LOG" \
  CURL_CONNECT_TIMEOUT_SECONDS=20 CURL_MAX_TIME_SECONDS=10 \
  bash "$ROOT/scripts/check-prod-smoke.sh" >/dev/null 2>&1; then
  echo "Expected connection timeout greater than total timeout to fail." >&2
  exit 1
fi

if PATH="$FAKE_BIN:$PATH" BASE_URL="http://synthetic.invalid" FAKE_CURL_LOG="$CALL_LOG" \
  FAKE_CURL_TIMEOUT=1 bash "$ROOT/scripts/check-prod-smoke.sh" >/dev/null 2>&1; then
  echo "Expected a synthetic curl timeout to fail the smoke script." >&2
  exit 1
fi

echo "Production smoke timeout fixture tests passed."

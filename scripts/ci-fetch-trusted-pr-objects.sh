#!/usr/bin/env bash
set -euo pipefail

fail_history() {
  printf 'trusted secret scan could not obtain or verify required pull-request history\n' >&2
  exit 1
}

is_commit() {
  git cat-file -e "$1^{commit}" 2>/dev/null
}

: "${PR_NUMBER:?PR_NUMBER is required}"
: "${BASE_SHA:?BASE_SHA is required}"
: "${BASE_REF:?BASE_REF is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"

case "$PR_NUMBER" in (*[!0-9]*|'') fail_history ;; esac
case "$BASE_SHA" in (*[!0-9a-fA-F]*|'') fail_history ;; esac
case "$HEAD_SHA" in (*[!0-9a-fA-F]*|'') fail_history ;; esac
git check-ref-format --branch "$BASE_REF" >/dev/null 2>&1 || fail_history

if ! git fetch --no-tags origin \
  "+refs/pull/${PR_NUMBER}/head:refs/secret-scan/head" >/dev/null 2>&1; then
  fail_history
fi
fetched_head="$(git rev-parse --verify refs/secret-scan/head^{commit} 2>/dev/null)" || fail_history
if [ "$fetched_head" != "$HEAD_SHA" ]; then
  fail_history
fi

if ! is_commit "$BASE_SHA"; then
  git fetch --no-tags origin \
    "+refs/heads/${BASE_REF}:refs/secret-scan/base-history" >/dev/null 2>&1 || true
fi
if ! is_commit "$BASE_SHA"; then
  git fetch --no-tags --depth=1 origin "$BASE_SHA" >/dev/null 2>&1 || true
fi
is_commit "$BASE_SHA" || fail_history

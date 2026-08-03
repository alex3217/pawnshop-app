#!/usr/bin/env bash
set -euo pipefail

readonly empty_tree=4b825dc642cb6eb9a060e54bf8d69288fbee4904
readonly zero=0000000000000000000000000000000000000000

require_commit() {
  local sha="$1"
  if git cat-file -e "$sha^{commit}" 2>/dev/null; then
    return 0
  fi
  git fetch --no-tags --depth=1 origin "$sha" >/dev/null 2>&1 || true
  if ! git cat-file -e "$sha^{commit}" 2>/dev/null; then
    printf 'secret-history-scan: required event commit is unavailable\n' >&2
    return 1
  fi
}

: "${EVENT_NAME:?EVENT_NAME is required}"
: "${BASE_SHA:?BASE_SHA is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"

require_commit "$HEAD_SHA"

case "$EVENT_NAME" in
  pull_request|pull_request_target)
    [ "$BASE_SHA" != "$zero" ] || { printf 'secret-history-scan: pull-request base is invalid\n' >&2; exit 1; }
    require_commit "$BASE_SHA"
    node scripts/secret-scan.mjs --range "$BASE_SHA..$HEAD_SHA"
    ;;
  push)
    if [ "$BASE_SHA" = "$zero" ]; then
      node scripts/secret-scan.mjs --range "$empty_tree..$HEAD_SHA"
    else
      require_commit "$BASE_SHA"
      node scripts/secret-scan.mjs --range "$BASE_SHA..$HEAD_SHA"
    fi
    ;;
  *)
    printf 'secret-history-scan: unsupported event\n' >&2
    exit 1
    ;;
esac

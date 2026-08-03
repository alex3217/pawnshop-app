#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
for hook in pre-commit pre-push; do
  test -f "$repo_root/.githooks/$hook" || { printf 'Missing hook: %s\n' "$hook" >&2; exit 1; }
  test -x "$repo_root/.githooks/$hook" || { printf 'Hook is not executable: %s\n' "$hook" >&2; exit 1; }
done

git -C "$repo_root" config --local core.hooksPath .githooks
git -C "$repo_root" config --local --get core.hooksPath

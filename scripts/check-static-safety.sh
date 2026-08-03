#!/usr/bin/env bash
set -euo pipefail

fail_if_output() {
  local label="$1"
  local output="$2"

  if [ -n "$output" ]; then
    printf '\n❌ %s\n' "$label" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi

  printf '✅ %s\n' "$label"
}

printf '\nChecking secret leak prevention assets...\n'
SECRET_ASSETS_INVALID="$(
  for path in scripts/secret-scan.mjs scripts/secret-scan.test.mjs .github/workflows/trusted-secret-leak-prevention.yml; do
    [ -s "$path" ] || printf '%s\n' "$path"
  done
  for path in .githooks/pre-commit .githooks/pre-push scripts/install-git-hooks.sh scripts/ci-secret-history-scan.sh scripts/ci-fetch-trusted-pr-objects.sh; do
    if [ ! -s "$path" ] || [ ! -x "$path" ]; then printf '%s\n' "$path"; fi
  done
)"
fail_if_output "Secret scanner, tests, hooks, installer, and CI history runner are nonempty and executable where required" "$SECRET_ASSETS_INVALID"

SECRET_SYNTAX_INVALID="$(
  node --check scripts/secret-scan.mjs >/dev/null 2>&1 || printf '%s\n' 'scanner syntax'
  node --check scripts/secret-scan.test.mjs >/dev/null 2>&1 || printf '%s\n' 'scanner test syntax'
  for path in .githooks/pre-commit .githooks/pre-push scripts/install-git-hooks.sh scripts/ci-secret-history-scan.sh scripts/ci-fetch-trusted-pr-objects.sh; do
    bash -n "$path" >/dev/null 2>&1 || printf '%s\n' "$path syntax"
  done
)"
fail_if_output "Secret prevention JavaScript and shell assets parse successfully" "$SECRET_SYNTAX_INVALID"

PACKAGE_SECRET_SCRIPTS_INVALID="$(node <<'NODE'
const { readFileSync } = require('node:fs');
let parsed;
try { parsed = JSON.parse(readFileSync('package.json', 'utf8')); } catch {}
const expected = {
  'check:secrets:tracked': 'node scripts/secret-scan.mjs --tracked',
  'check:secrets:staged': 'node scripts/secret-scan.mjs --staged',
  'test:secret-scan': 'node --test scripts/secret-scan.test.mjs',
  'hooks:install': 'bash scripts/install-git-hooks.sh',
};
if (!parsed) process.stdout.write('package.json parse failure\n');
else for (const [name, command] of Object.entries(expected)) {
  if (parsed.scripts?.[name] !== command) process.stdout.write(`${name}\n`);
}
NODE
)"
fail_if_output "Package secret scripts exactly invoke the intended commands" "$PACKAGE_SECRET_SCRIPTS_INVALID"

SECRET_CI_INVALID="$(node <<'NODE'
const { readFileSync } = require('node:fs');
const candidateSource = readFileSync('.github/workflows/core-ci.yml', 'utf8');
const candidateMatch = candidateSource.match(/^  secret-scanner-candidate-validation:\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\n)/m);
const candidateJob = candidateMatch?.[0] || '';
const candidateRequired = [
  /^  secret-scanner-candidate-validation:$/m,
  /^    name: Secret Scanner Candidate Validation$/m,
  /^    permissions:\n      contents: read$/m,
  /^          fetch-depth: 0$/m,
  /^          ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}$/m,
  /^        run: node --test scripts\/secret-scan\.test\.mjs$/m,
  /^        run: node scripts\/secret-scan\.mjs --tracked$/m,
  /^        run: bash scripts\/ci-secret-history-scan\.sh$/m,
];
if (!candidateJob || candidateRequired.some((pattern) => !pattern.test(candidateJob)) || /^    name: Secret Leak Prevention$/m.test(candidateSource) || /\bnpm\s+(?:ci|install)|npm\s+--prefix/.test(candidateJob)) {
  process.stdout.write('Secret Scanner Candidate Validation job structure\n');
}

const trustedSource = readFileSync('.github/workflows/trusted-secret-leak-prevention.yml', 'utf8');
const trustedFetcher = readFileSync('scripts/ci-fetch-trusted-pr-objects.sh', 'utf8');
const trustedMatch = trustedSource.match(/^  secret-leak-prevention:\n([\s\S]*)$/m);
const trustedJob = trustedMatch?.[0] || '';
const trustedRequired = [
  /^  pull_request_target: \{\}$/m,
  /^  push:\n    branches:\n      - main$/m,
  /^permissions:\n  contents: read$/m,
  /^  secret-leak-prevention:$/m,
  /^    name: Secret Leak Prevention$/m,
  /^    permissions:\n      contents: read$/m,
  /^          fetch-depth: 0$/m,
  /^          ref: \$\{\{ github\.event_name == 'pull_request_target' && github\.event\.repository\.default_branch \|\| github\.sha \}\}$/m,
  /^        run: bash scripts\/ci-fetch-trusted-pr-objects\.sh$/m,
  /^        run: node scripts\/secret-scan\.mjs --tree "\$HEAD_SHA"$/m,
  /^        run: bash scripts\/ci-secret-history-scan\.sh$/m,
];
const trustedForbidden = [
  /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha/,
  /\bsecrets\./,
  /\bnpm\s+(?:ci|install)|npm\s+--prefix/,
  /actions\/cache|actions\/upload-artifact/,
  /^\s+[a-z-]+:\s*write$/m,
];
if (!trustedJob || trustedRequired.some((pattern) => !pattern.test(trustedSource)) || trustedForbidden.some((pattern) => pattern.test(trustedSource))) {
  process.stdout.write('Trusted Secret Leak Prevention workflow structure\n');
}
const fetcherRequired = [
  /refs\/pull\/\$\{PR_NUMBER\}\/head:refs\/secret-scan\/head/,
  /fetched_head=.*refs\/secret-scan\/head/,
  /\[ "\$fetched_head" != "\$HEAD_SHA" \]/,
  /git cat-file -e "\$1\^\{commit\}"/,
  /refs\/heads\/\$\{BASE_REF\}:refs\/secret-scan\/base-history/,
  /git fetch --no-tags --depth=1 origin "\$BASE_SHA"/,
  /is_commit "\$BASE_SHA" \|\| fail_history/,
];
const fetcherForbidden = [
  /fetched_base/,
  /refs\/secret-scan\/base\^\{commit\}/,
  /REMOTE_URL|HEAD_REPOSITORY_URL/,
  /git fetch[^\n]*(?:\$HEAD_REPOSITORY|\$REMOTE_URL)/,
  /printf[^\n]*\$(?:BASE_SHA|HEAD_SHA)/,
];
if (fetcherRequired.some((pattern) => !pattern.test(trustedFetcher)) || fetcherForbidden.some((pattern) => pattern.test(trustedFetcher))) {
  process.stdout.write('Exact trusted pull-request object acquisition\n');
}
const history = readFileSync('scripts/ci-secret-history-scan.sh', 'utf8');
if (!/pull_request\|pull_request_target\)/.test(history) || !/node scripts\/secret-scan\.mjs --range "\$BASE_SHA\.\.\$HEAD_SHA"/.test(history) || !/node scripts\/secret-scan\.mjs --range "\$empty_tree\.\.\$HEAD_SHA"/.test(history) || /--tracked/.test(history)) {
  process.stdout.write('CI range scanning logic\n');
}
NODE
)"
fail_if_output "Trusted enforcement uses default-branch code and object-only PR data; candidate validation is non-authoritative" "$SECRET_CI_INVALID"

PRE_PUSH_NEW_BRANCH_INVALID="$(node <<'NODE'
const { readFileSync } = require('node:fs');
const source = readFileSync('.githooks/pre-push', 'utf8');
const required = [
  /remote_name="\$\{1:-origin\}"/,
  /destination_namespace=/,
  /git fetch --no-tags "\$remote_name"/,
  /refs\/heads\/\*:.*destination_namespace/,
  /trap cleanup_destination_refs EXIT/,
  /git rev-list --reverse "\$local_sha" --not --glob=/,
  /could not obtain the required destination history/,
];
const forbidden = [/--not\s+--remotes/, /--tracked/, /\breadarray\b|\bmapfile\b|declare\s+-A/];
if (required.some((pattern) => !pattern.test(source)) || forbidden.some((pattern) => pattern.test(source))) {
  process.stdout.write('destination-specific new-branch pre-push logic\n');
}
NODE
)"
fail_if_output "New-branch pre-push scanning excludes only destination-remote history" "$PRE_PUSH_NEW_BRANCH_INVALID"

if ! SCANNER_TESTS_INVALID="$(
  node <<'NODE'
const { readFileSync } = require("node:fs");
const source = readFileSync("scripts/secret-scan.test.mjs", "utf8");
const quote = String.fromCharCode(39);
const titlePattern = new RegExp(`test\\(${quote}([^${quote}]+)${quote}`, "g");
const titles = new Set([...source.matchAll(titlePattern)].map((match) => match[1]));
const required = [
  "prefixed sensitive assignments and punctuated values are detected",
"GitHub Actions runtime references allow jobs context and operator whitespace",
"GitHub Actions runtime references reject dynamic paths and non-ASCII whitespace",
  "exact GitHub Actions bracket-property runtime references are ignored",
  "dynamic and malformed GitHub Actions bracket expressions remain detected",
  "exact GitHub Actions runtime references are ignored while surrounding and hard-coded expressions are detected",
  "whole-value assignment placeholders accept every approved complete form",
  "embedded placeholder markers and arbitrary surrounding credential material are rejected",
  "provider-looking assigned values remain blocked despite placeholder-like text",
  "member assignments detect process env, brackets, nested configuration, and punctuation",
  "member assignment runtime expressions, comparisons, reads, and destructuring are ignored",
  "slash-prefixed sensitive assignments remain detected outside regex metadata",
  "JavaScript regex metadata is ignored only for bounded literals with valid flags",
  "regex metadata with slashes inside character classes is bounded correctly",
  "exported unquoted environment references are narrowly ignored",
  "member assignments use anchored whole-value placeholder validation",
  "multiline bare, quoted-key, process env, bracket, nested, and module assignments are detected",
  "multiline runtime expressions and non-assignments are ignored",
    "multiline whole-value placeholders pass while embedded markers and nearby comments do not",
    "tree mode scans an arbitrary commit without checking it out",
    "tree mode fails closed for an unavailable commit without exposing its identifier",
  "staged mode and pre-commit detect exact multiline index content",
  "range mode detects multiline assignment when only the value line changes",
  "pre-push detects a transient multiline credential removed by a later commit",
  "pre-push fetches the remote tip before detecting an outgoing multiline credential",
  "URL placeholder components require anchored whole-value markers",
  "range mode handles Unicode, quoted, spaced, tabbed, backslash, dash, and newline paths",
  "range mode detects a Unicode-path credential introduced and later deleted",
  "output paths redact credentials and neutralize control characters",
    "pre-push scans all new-branch commits including a secret later deleted",
    "pre-push new-branch scanning does not exclude commits on an unrelated remote",
    "pre-push new-branch scanning excludes only destination-remote heads",
    "pre-push new-branch scanning ignores stale destination tracking refs",
    "pre-push new-branch destination-history failure is closed and redacted",
  "pre-push fetches an absent nonzero remote tip using the supplied remote name",
  "pre-push fails closed without exposing unavailable remote history details",
    "CI force-push scan explicitly fetches an absent event base",
    "trusted workflow enforces pull requests with default-branch code and object-only PR data",
    "trusted PR acquisition accepts exact event base before and after the base branch advances",
    "trusted PR acquisition fails closed when the exact event base is unavailable",
    "trusted PR acquisition rejects a force-moved head ref and ignores fork fetch data",
];
for (const title of required) if (!titles.has(title)) process.stdout.write(`${title}\n`);
NODE
)"; then
  printf '%s\n' '❌ Static safety scanner-title certification failed' >&2
  exit 1
fi

if ! node --test scripts/secret-scan.test.mjs >/dev/null 2>&1; then
  SCANNER_TESTS_INVALID="$(printf '%s\n' 'scanner regression suite')"
fi
fail_if_output "Scanner regression suite certifies assignments, URL placeholders, path redaction, Unicode/transient history, and force pushes" "$SCANNER_TESTS_INVALID"

CI_POSTGRES_MISMATCH="$(node <<'NODE'
const { readFileSync } = require('node:fs');
const source = readFileSync('.github/workflows/core-ci.yml', 'utf8');
const start = source.indexOf('  backend-tests:\n');
const job = start < 0 ? '' : source.slice(start);
const value = (name) => job.match(new RegExp(`^\\s+${name}:\\s*([^\\s]+)\\s*$`, 'm'))?.[1];
const user = value('POSTGRES_USER');
const password = value('POSTGRES_PASSWORD');
const database = value('POSTGRES_DB');
const rawUrl = value('DATABASE_URL');
let parsed;
try { parsed = new URL(rawUrl); } catch {}
if (!parsed || decodeURIComponent(parsed.username) !== user || decodeURIComponent(parsed.password) !== password || parsed.pathname !== `/${database}` || database !== 'pawnshop_test' || parsed.searchParams.get('schema') !== 'public') {
  process.stdout.write('backend-tests PostgreSQL service and DATABASE_URL differ\n');
}
NODE
)"
fail_if_output "Backend CI PostgreSQL service credentials match DATABASE_URL" "$CI_POSTGRES_MISMATCH"

OBSOLETE_LOCAL_COMMANDS="$(
  grep -n -E '"pm2:(staging|prod)"|"db:(backup|restore):(staging|prod)"' package.json || true
)"
fail_if_output "Obsolete local staging/production commands are absent" "$OBSOLETE_LOCAL_COMMANDS"

SCANNER_UNSAFE_OUTPUT="$(
  grep -n -E '(console\.(log|error|warn)|process\.(stdout|stderr)\.write).*\$\{(match|matched|secret|value|sourceLine|text|buffer)\}' scripts/secret-scan.mjs || true
)"
fail_if_output "Scanner output cannot print matched values or source text" "$SCANNER_UNSAFE_OUTPUT"

printf '\nChecking tracked real env files...\n'
TRACKED_ENV="$(
  git ls-files \
    | grep -E '(^|/)\.env($|\.)' \
    | grep -Ev '(^|/)\.env(\.[A-Za-z0-9_-]+)*\.example$|(^|/)\.env\.example$' \
    || true
)"
fail_if_output "No real env files are tracked" "$TRACKED_ENV"

printf '\nChecking backend .env.example completeness...\n'
BACKEND_MISSING="$(
  comm -23 \
    <(git grep -h -o -E 'process\.env\.[A-Z0-9_]+' -- apps/api/backend/src \
      | sed 's/process\.env\.//' \
      | sort -u) \
    <(grep -E '^[A-Z0-9_]+=' apps/api/backend/.env.example \
      | cut -d= -f1 \
      | sort -u) || true
)"
fail_if_output "Backend .env.example documents all consumed env vars" "$BACKEND_MISSING"

printf '\nChecking web .env.example completeness...\n'
WEB_MISSING="$(
  comm -23 \
    <(git grep -h -o -E 'import\.meta\.env\.[A-Z0-9_]+' -- apps/web/src \
      | sed 's/import\.meta\.env\.//' \
      | grep -v '^DEV$' \
      | sort -u) \
    <(grep -E '^[A-Z0-9_]+=' apps/web/.env.example \
      | cut -d= -f1 \
      | sort -u) || true
)"
fail_if_output "Web .env.example documents all consumed env vars" "$WEB_MISSING"

printf '\nChecking destructive DB command guard...\n'
DESTRUCTIVE_DB="$(
  git grep -n -E 'force: true|sync\(|deleteMany|drop table|truncate table|DELETE FROM|delete from' -- \
    apps/api/backend/src \
    apps/api/backend/prisma \
    scripts \
    ':(exclude)scripts/check-prod-readiness.sh' \
    ':(exclude)scripts/check-static-safety.sh' \
    ':(exclude)**/node_modules/**' || true
)"
fail_if_output "No destructive DB commands found in source/scripts" "$DESTRUCTIVE_DB"

printf '\nChecking secret logging guard...\n'
SECRET_LOGGING="$(
  git grep -n -E 'console\.log\(process\.env|console\.error\(process\.env|console\.warn\(process\.env' -- \
    apps/api/backend/src apps/web/src scripts || true
)"
fail_if_output "No process.env secret logging found" "$SECRET_LOGGING"

printf '\nChecking complete environment and database URL logging guard...\n'
SENSITIVE_LOGGING="$(
  git grep -n -E '(console\.(log|error|warn|info)|logger\.(log|error|warn|info|debug)).*(process\.env([[:space:])},]|\.DATABASE_URL)|env\.DATABASE_URL)|JSON\.stringify\([[:space:]]*process\.env' -- \
    apps/api/backend/src apps/web/src scripts || true
)"
fail_if_output "No complete process.env or DATABASE_URL logging found" "$SENSITIVE_LOGGING"

printf '\nChecking runtime environment selection fail-closed guard...\n'
GENERIC_ENV_FALLBACK="$(
  grep -n -E '["'"'"']\.env["'"'"']' apps/api/backend/src/config/runtimeEnvSelection.js || true
)"
fail_if_output "Runtime selection has no generic .env fallback" "$GENERIC_ENV_FALLBACK"

RUNTIME_FILENAME_GUARD_MISSING="$(
  for marker in EXPECTED_ENV_FILE_BY_ENVIRONMENT path.basename path.dirname realpath; do
    if ! grep -q "$marker" apps/api/backend/src/config/runtimeEnvSelection.js; then
      printf '%s\n' "$marker"
    fi
  done
)"
fail_if_output "Runtime selection rejects wrong-environment and escaping files" "$RUNTIME_FILENAME_GUARD_MISSING"

printf '\nChecking backend dotenv example isolation...\n'
DOTENV_EXAMPLE_INVALID="$(
  if ! grep -q '^DOTENV_CONFIG_PATH=\.env\.development$' apps/api/backend/.env.example; then
    printf '%s\n' 'DOTENV_CONFIG_PATH must be .env.development'
  fi
)"
fail_if_output "Backend example uses a backend-root-relative dotenv path" "$DOTENV_EXAMPLE_INVALID"

printf '\nChecking local PM2 environment isolation...\n'
LOCAL_DEPLOY_APPS="$(
  grep -n -E 'pawn-(prod|staging)' ecosystem.config.cjs || true
)"
fail_if_output "PM2 config contains no local production or staging apps" "$LOCAL_DEPLOY_APPS"

printf '\nChecking Vite development proxy isolation...\n'
UNSAFE_VITE_DEFAULT="$(
  grep -n -E 'DEFAULT_VITE_API_TARGET.*:(6001|6003)' apps/web/viteProxyTarget.js || true
)"
fail_if_output "Vite proxy default does not use production or staging ports" "$UNSAFE_VITE_DEFAULT"

VITE_PATH_GUARD_MISSING="$(
  if ! grep -q 'target\.pathname !== "/"' apps/web/viteProxyTarget.js; then
    printf '%s\n' 'root-path validation missing'
  fi
)"
fail_if_output "Vite proxy rejects non-root paths" "$VITE_PATH_GUARD_MISSING"

printf '\nChecking expected database identity documentation...\n'
EXPECTED_IDENTITY_MISSING="$(
  for key in EXPECTED_DATABASE_HOST EXPECTED_DATABASE_NAME; do
    if git grep -q "$key" -- apps/api/backend/src \
      && ! grep -q "^${key}=" apps/api/backend/.env.example; then
      printf '%s\n' "$key"
    fi
  done
)"
fail_if_output "Expected database identity variables are documented" "$EXPECTED_IDENTITY_MISSING"

EXPECTED_PLACEHOLDER_INVALID="$(
  if ! grep -q '^EXPECTED_DATABASE_HOST=replace-.*\.invalid$' apps/api/backend/.env.example; then
    printf '%s\n' 'EXPECTED_DATABASE_HOST lacks a rejected placeholder marker'
  fi
  if ! grep -q '^EXPECTED_DATABASE_NAME=replace-' apps/api/backend/.env.example; then
    printf '%s\n' 'EXPECTED_DATABASE_NAME lacks a rejected placeholder marker'
  fi
)"
fail_if_output "Expected database identity examples are unmistakable placeholders" "$EXPECTED_PLACEHOLDER_INVALID"

printf '\nChecking frontend page/admin raw fetch guard...\n'
RAW_FETCH="$(
  grep -R "fetch(" -n apps/web/src/pages apps/web/src/admin/pages \
    --include="*.tsx" \
    --include="*.ts" || true
)"
fail_if_output "No raw fetch in frontend page/admin-page layer" "$RAW_FETCH"

printf '\n✅ Static safety guard passed.\n'

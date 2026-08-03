import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('./secret-scan.mjs', import.meta.url));
const ciHistoryScanner = fileURLToPath(new URL('./ci-secret-history-scan.sh', import.meta.url));
const trustedPrObjectFetcher = fileURLToPath(new URL('./ci-fetch-trusted-pr-objects.sh', import.meta.url));
const trustedWorkflow = fileURLToPath(new URL('../.github/workflows/trusted-secret-leak-prevention.yml', import.meta.url));
const coreWorkflow = fileURLToPath(new URL('../.github/workflows/core-ci.yml', import.meta.url));

function run(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [scanner, ...args], { cwd, encoding: 'utf8' });
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Scanner Test', GIT_AUTHOR_EMAIL: 'scanner@example.invalid', GIT_COMMITTER_NAME: 'Scanner Test', GIT_COMMITTER_EMAIL: 'scanner@example.invalid' },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repository() {
  const dir = mkdtempSync(join(tmpdir(), 'secret-scan-'));
  git(dir, 'init', '-q');
  return dir;
}

function commitFile(dir, path, content, message) {
  writeFileSync(join(dir, path), content);
  git(dir, 'add', path);
  git(dir, 'commit', '-qm', message);
  return git(dir, 'rev-parse', 'HEAD');
}

function hookRepository() {
  const dir = repository();
  const remote = mkdtempSync(join(tmpdir(), 'secret-hook-origin-'));
  git(remote, 'init', '--bare', '-q');
  git(dir, 'remote', 'add', 'origin', remote);
  installHookFiles(dir);
  return dir;
}

function installHookFiles(dir) {
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, '.githooks'));
  copyFileSync(scanner, join(dir, 'scripts', 'secret-scan.mjs'));
  copyFileSync(fileURLToPath(new URL('../.githooks/pre-commit', import.meta.url)), join(dir, '.githooks', 'pre-commit'));
  copyFileSync(fileURLToPath(new URL('../.githooks/pre-push', import.meta.url)), join(dir, '.githooks', 'pre-push'));
}

function runPrePush(dir, input, remoteName = 'origin', remoteUrl = 'unused') {
  return spawnSync('bash', [join(dir, '.githooks', 'pre-push'), remoteName, remoteUrl], { cwd: dir, input, encoding: 'utf8' });
}

function runPreCommit(dir) {
  return spawnSync('bash', [join(dir, '.githooks', 'pre-commit')], { cwd: dir, encoding: 'utf8' });
}

function remoteTipScenario() {
  const root = mkdtempSync(join(tmpdir(), 'secret-remote-tip-'));
  const remote = join(root, 'remote');
  const local = join(root, 'local');
  mkdirSync(remote);
  git(remote, 'init', '-q');
  const base = commitFile(remote, 'history.txt', 'safe base', 'base');
  git(remote, 'branch', '-M', 'main');
  git(root, 'clone', '-q', remote, local);
  git(local, 'remote', 'rename', 'origin', 'review-remote');
  const remoteHead = commitFile(remote, 'remote.txt', 'safe remote update', 'remote update');
  installHookFiles(local);
  return { local, remote, base, remoteHead };
}

function syntheticCredentials() {
  const repeat = (character, count) => character.repeat(count);
  return [
    ['PRIVATE_KEY', ['-----BEGIN ', 'OPENSSH PRIVATE KEY-----'].join('')],
    ['GITHUB_TOKEN', ['gh', 'p_', repeat('a', 36)].join('')],
    ['GITHUB_TOKEN', ['gh', 'o_', repeat('c', 36)].join('')],
    ['GITHUB_TOKEN', ['gh', 'u_', repeat('d', 36)].join('')],
    ['GITHUB_TOKEN', ['gh', 's_', repeat('e', 36)].join('')],
    ['GITHUB_TOKEN', ['gh', 'r_', repeat('f', 36)].join('')],
    ['GITHUB_TOKEN', ['github', '_pat_', repeat('b', 60)].join('')],
    ['AWS_ACCESS_KEY_ID', ['AK', 'IA', repeat('C', 16)].join('')],
    ['STRIPE_KEY', ['sk', '_live_', repeat('d', 24)].join('')],
    ['STRIPE_KEY', ['rk', '_live_', repeat('e', 24)].join('')],
    ['OPENAI_API_KEY', ['sk', '-proj-', repeat('f', 30)].join('')],
    ['SLACK_TOKEN', ['xox', 'b-', repeat('1', 12), '-', repeat('2', 12)].join('')],
    ['SLACK_TOKEN', ['xapp', '-', repeat('3', 12), '-', repeat('4', 12)].join('')],
    ['GOOGLE_API_KEY', ['AI', 'za', repeat('G', 35)].join('')],
    ['AUTHORIZATION_VALUE', ['Authorization: Bearer ', repeat('h', 30)].join('')],
    ['AUTHORIZATION_VALUE', ['Authorization: Basic ', repeat('Q', 24)].join('')],
    ['JWT', ['eyJ', repeat('a', 8), '.', repeat('b', 10), '.', repeat('c', 12)].join('')],
    ['CREDENTIAL_URL', ['postgresql://user:', repeat('p', 18), '@db.host/app'].join('')],
    ['CREDENTIAL_URL', ['mysql://user:', repeat('m', 18), '@db.host/app'].join('')],
    ['CREDENTIAL_URL', ['mongodb://user:', repeat('n', 18), '@db.host/app'].join('')],
    ['CREDENTIAL_URL', ['redis://user:', repeat('r', 18), '@cache.host/0'].join('')],
    ['SENSITIVE_ASSIGNMENT', ['CLIENT_', 'SECRET=', repeat('s', 24)].join('')],
  ];
}

test('GitHub Actions runtime references allow jobs context and operator whitespace', () => {
  const dir = repository();
  const fixturePath = join(dir, "safe-spaced-runtime-references.yml");
  writeFileSync(
    fixturePath,
    [
      "PASSWORD: ${{ job.status }}",
      "PASSWORD: ${{ jobs.setup.outputs.password }}",
      "PASSWORD: ${{ jobs['setup'].outputs['password'] }}",
      'PASSWORD: ${{ jobs [ \'setup\' ] . outputs [ "password" ] }}',
      "API_KEY: ${{ secrets.API_KEY }}",
      "API_KEY: ${{ secrets . API_KEY }}",
      "API_KEY: ${{ secrets. API_KEY }}",
      "API_KEY: ${{ secrets .API_KEY }}",
      "API_KEY: ${{ secrets [ 'API_KEY' ] }}",
      "API_KEY: ${{ secrets[ 'API_KEY' ] }}",
      "API_KEY: ${{ secrets ['API_KEY'] }}",
      'API_KEY: ${{ secrets[ "API_KEY" ] }}',
      "CLIENT_SECRET: ${{ steps [ 'credentials' ] . outputs [ 'client-secret' ] }}",
      'PASSWORD: ${{ needs [ "setup" ] . outputs . password }}',
      "TOKEN: ${{ github . event [ 'pull_request' ] . head . sha }}",
      'API_KEY: "${{ secrets [ \'API_KEY\' ] }}"',
      "TOKEN: '${{ env . RUNTIME_TOKEN }}'",
      "TOKEN: ${{\tsteps\t[\t'credentials'\t]\t.\toutputs\t[\t'client-secret'\t]\t}}",
      "",
    ].join("\n"),
  );

  const result = run(["--file", fixturePath], dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test('GitHub Actions runtime references reject dynamic paths and non-ASCII whitespace', () => {
  const dir = repository();
  const fixturePath = join(dir, "unsafe-spaced-runtime-references.yml");
  const unsafeValues = [
    "${{ secrets [ matrix.key ] }}",
    "${{ secrets [ github.ref ] }}",
    "${{ secrets [ 'API KEY' ] }}",
    "${{ secrets [ '' ] }}",
    "${{ secrets . }}",
    "${{ secrets [ 'API_KEY' }}",
    "${{ secrets 'API_KEY' }}",
    "${{ secrets [ 'API_KEY' ] || 'fallback' }}",
    "${{ secrets [ 'API_KEY' ] }}-suffix",
    "prefix-${{ secrets [ 'API_KEY' ] }}",
    "${{ secrets [ 'API_KEY' ] }} ${{ secrets [ 'OTHER' ] }}",
    "${{ secrets [ 'API_KEY' ] . replace('A', 'B') }}",
    "${{ format('{0}', secrets [ 'API_KEY' ]) }}",
    "${{ fromJSON('hard-coded-value') }}",
    "${{ 'hard-coded-credential' }}",
    "${{ unknown . API_KEY }}",
    "${{ secrets\u00a0.API_KEY }}",
    "${{ secrets\v.API_KEY }}",
    "${{ secrets\n.API_KEY }}",
  ];
  writeFileSync(
    fixturePath,
    [...unsafeValues.map((value) => `API_KEY: ${value}`), ""].join("\n"),
  );

  const result = run(["--file", fixturePath], dir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 1);
  assert.equal(
    (output.match(/\[SENSITIVE_ASSIGNMENT\]/g) || []).length,
    unsafeValues.length,
  );
  for (const value of unsafeValues) {
    assert.equal(output.includes(value), false);
  }
});

test('exact GitHub Actions bracket-property runtime references are ignored', () => {
  const dir = repository();
  const fixturePath = join(dir, "safe-bracket-runtime-references.yml");
  writeFileSync(
    fixturePath,
    [
      "DATABASE_URL: ${{ secrets['DATABASE_URL'] }}",
      'API_KEY: ${{ secrets["API_KEY"] }}',
      'TOKEN: "${{ env[\'RUNTIME_TOKEN\'] }}"',
      "CLIENT_SECRET: ${{ steps['credentials'].outputs['client-secret'] }}",
      'PASSWORD: ${{ needs["setup"].outputs.password }}',
      "WEBHOOK_SECRET: ${{ vars['WEBHOOK_SECRET_NAME'] }}",
      "TOKEN: '${{ github.event[\"pull_request\"].head.sha }}'",
      "",
    ].join("\n"),
  );

  const result = run(["--file", fixturePath], dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test('dynamic and malformed GitHub Actions bracket expressions remain detected', () => {
  const dir = repository();
  const fixturePath = join(dir, "unsafe-bracket-runtime-references.yml");
  const unsafeValues = [
    "${{ secrets[matrix.key] }}",
    "${{ secrets[github.ref] }}",
    "${{ secrets['API_KEY'] || 'fallback' }}",
    "${{ secrets['API_KEY'] }}-suffix",
    "prefix-${{ secrets['API_KEY'] }}",
    "${{ secrets['API_KEY'] }} ${{ secrets['OTHER'] }}",
    "${{ secrets[''] }}",
    "${{ secrets['API KEY'] }}",
    "${{ secrets['API_KEY\"] }}",
    "${{ secrets['API_KEY' }}",
    "${{ secrets['API_KEY'].replace('A', 'B') }}",
    "${{ format('{0}', secrets['API_KEY']) }}",
    "${{ fromJSON('hard-coded-value') }}",
    "${{ 'hard-coded-credential' }}",
  ];
  writeFileSync(
    fixturePath,
    [...unsafeValues.map((value) => `API_KEY: ${value}`), ""].join("\n"),
  );

  const result = run(["--file", fixturePath], dir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 1);
  assert.equal(
    (output.match(/\[SENSITIVE_ASSIGNMENT\]/g) || []).length,
    unsafeValues.length,
  );
  for (const value of unsafeValues) {
    assert.equal(output.includes(value), false);
  }
});

test('exact GitHub Actions runtime references are ignored while surrounding and hard-coded expressions are detected', () => {
  const dir = repository();
  const safePath = join(dir, "safe-runtime-references.yml");
  const unsafePath = join(dir, "unsafe-runtime-references.yml");

  writeFileSync(
    safePath,
    [
      "DATABASE_URL: ${{ secrets.DATABASE_URL }}",
      'API_KEY: "${{ secrets.API_KEY }}"',
      "TOKEN: ${{ env.RUNTIME_TOKEN }}",
      "CLIENT_SECRET: ${{ steps.credentials.outputs.client-secret }}",
      "PASSWORD: ${{ needs.setup.outputs.password }}",
      "WEBHOOK_SECRET: ${{ vars.WEBHOOK_SECRET_NAME }}",
      "",
    ].join("\n"),
  );

  const safe = run(["--file", safePath], dir);
  assert.equal(safe.status, 0);
  assert.equal(safe.stdout, "");
  assert.equal(safe.stderr, "");

  const unsafeValues = [
    "actual-credential-material",
    "${{ secrets.DATABASE_URL }}-suffix",
    "prefix-${{ secrets.API_KEY }}",
    "${{ 'hard-coded-credential' }}",
    "${{ secrets.TOKEN || 'hard-coded-fallback' }}",
    "${{ format('hard-coded-{0}', github.sha) }}",
    "${{ secrets.ONE }} ${{ secrets.TWO }}",
  ];
  writeFileSync(
    unsafePath,
    [
      `DATABASE_URL: ${unsafeValues[0]}`,
      `DATABASE_URL: ${unsafeValues[1]}`,
      `API_KEY: ${unsafeValues[2]}`,
      `PASSWORD: ${unsafeValues[3]}`,
      `TOKEN: ${unsafeValues[4]}`,
      `CLIENT_SECRET: ${unsafeValues[5]}`,
      `WEBHOOK_SECRET: ${unsafeValues[6]}`,
      "",
    ].join("\n"),
  );

  const unsafe = run(["--file", unsafePath], dir);
  const output = `${unsafe.stdout}${unsafe.stderr}`;
  assert.equal(unsafe.status, 1);
  assert.equal((output.match(/\[SENSITIVE_ASSIGNMENT\]/g) || []).length, 7);
  for (const value of unsafeValues) {
    assert.equal(output.includes(value), false);
  }
});

test('every high-confidence rule detects synthetic credentials without exposing values', () => {
  for (const [rule, secret] of syntheticCredentials()) {
    const dir = mkdtempSync(join(tmpdir(), 'secret-file-'));
    const path = join(dir, 'candidate.txt');
    writeFileSync(path, `${secret}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1, `expected ${rule} to be detected`);
    assert.match(result.stdout, new RegExp(`\\[${rule}\\]`));
    assert.equal(result.stdout.includes(secret), false);
    assert.equal(result.stderr.includes(secret), false);
  }
});

test('explicit placeholders and env example placeholders are accepted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-placeholders-'));
  const path = join(dir, '.env.example');
  writeFileSync(path, [
    'API_KEY=replace-with-api-key',
    'PASSWORD=changeme-password',
    'CLIENT_SECRET=dummy-client-secret',
    'DATABASE_URL=postgresql://example-user:test-only-password@db.invalid/example',
  ].join('\n'));
  assert.equal(run(['--file', path]).status, 0);
});

test('prefixed sensitive assignments and punctuated values are detected', () => {
  const candidates = [
    `JWT_SECRET=${'j'.repeat(24)}`,
    `const STRIPE_SECRET_KEY = "${'s'.repeat(24)}";`,
    `"OPENAI_API_KEY": "${'o'.repeat(24)}",`,
    `GITHUB_TOKEN=${'g'.repeat(24)}`,
    `SLACK_TOKEN: ${'l'.repeat(12)}!${'m'.repeat(12)}`,
    `AWS_SECRET_ACCESS_KEY=${'a'.repeat(12)}!${'b'.repeat(12)}`,
    `PAYMENT_WEBHOOK_SECRET: ${'w'.repeat(12)}!${'x'.repeat(12)}`,
    `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY=${'i'.repeat(24)}`,
    `SHOP_PASSWORD=${'p'.repeat(12)}!${'q'.repeat(12)}`,
  ];
  for (const content of candidates) {
    const dir = mkdtempSync(join(tmpdir(), 'secret-assignment-'));
    const path = join(dir, 'assignment.txt');
    writeFileSync(path, `${content}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[SENSITIVE_ASSIGNMENT\]/);
    assert.equal(result.stdout.includes(content), false);
    assert.equal(result.stderr.includes(content), false);
  }
});

test('whole-value assignment placeholders accept every approved complete form', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-assignment-placeholder-'));
  const path = join(dir, 'assignment.txt');
  const placeholders = [
    'replace-with-secret', 'replace-with-api-key', 'example-secret', 'example-token',
    'example-password', 'invalid-secret', 'placeholder-api-key', 'changeme-password',
    'not-for-production-secret', 'test-only-secret', 'unit-test-token', 'fake-api-key',
    'dummy-password', 'replace_with_api_key', 'test_only_secret',
  ];
  writeFileSync(path, placeholders.map((value, index) => {
    if (index % 3 === 0) return `JWT_SECRET=${value}`;
    if (index % 3 === 1) return `const STRIPE_SECRET_KEY = "${value}";`;
    return `"OPENAI_API_KEY": '${value}',`;
  }).join('\n'));
  assert.equal(run(['--file', path]).status, 0);
});

test('embedded placeholder markers and arbitrary surrounding credential material are rejected', () => {
  const candidates = [
    'production-example-actual-secret-value',
    'real-test-only-password-material',
    'dummy-prefix-followed-by-real-secret-material',
    'actual-secret-placeholder',
    'real-fake-token-value',
    'changeme-plus-real-password',
  ];
  for (const value of candidates) {
    const dir = mkdtempSync(join(tmpdir(), 'secret-placeholder-bypass-'));
    const path = join(dir, 'assignment.txt');
    writeFileSync(path, `JWT_SECRET="${value}!"\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[SENSITIVE_ASSIGNMENT\]/);
    assert.equal(result.stdout.includes(value), false);
    assert.equal(result.stderr.includes(value), false);
  }
});

test('provider-looking assigned values remain blocked despite placeholder-like text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-provider-placeholder-'));
  const path = join(dir, 'assignment.txt');
  const value = ['sk', '_live_', 'testonly'.repeat(3)].join('');
  writeFileSync(path, `STRIPE_SECRET_KEY="${value}"\n`);
  const result = run(['--file', path]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[STRIPE_KEY\]/);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('member assignments detect process env, brackets, nested configuration, and punctuation', () => {
  const literal = (character) => `${character.repeat(14)}!${character.repeat(14)}`;
  const candidates = [
    `process.env.JWT_SECRET = "${literal('a')}";`,
    `process.env["JWT_SECRET"] = "${literal('b')}";`,
    `process.env['OPENAI_API_KEY'] = "${literal('c')}";`,
    `config.API_KEY = "${literal('d')}";`,
    `config["CLIENT_SECRET"] = "${literal('e')}";`,
    `settings.auth.PASSWORD = "${literal('f')}";`,
    `secrets.payment.WEBHOOK_SECRET = "${literal('g')}";`,
    `applicationConfig.AWS_SECRET_ACCESS_KEY = "${literal('h')}";`,
    `module.exports.JWT_SECRET = "${literal('i')}";`,
  ];
  for (const content of candidates) {
    const dir = mkdtempSync(join(tmpdir(), 'secret-member-'));
    const path = join(dir, 'assignment.txt');
    writeFileSync(path, `${content}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[SENSITIVE_ASSIGNMENT\]/);
    assert.equal(result.stdout.includes(content), false);
    assert.equal(result.stderr.includes(content), false);
  }
});

test('member assignment runtime expressions, comparisons, reads, and destructuring are ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-member-negative-'));
  const path = join(dir, 'assignment.txt');
  writeFileSync(path, [
    'process.env.JWT_SECRET === "comparison";',
    'const value = process.env.JWT_SECRET;',
    'config?.API_KEY;',
    'const { JWT_SECRET } = process.env;',
    'process.env.JWT_SECRET = buildSecret();',
    'config.API_KEY = parts.join("");',
    'settings.PASSWORD = getPassword();',
    'process.env.TOKEN = existingToken;',
  ].join('\n'));
  assert.equal(run(['--file', path]).status, 0);
});

test('shell environment expansions and required checks are ignored while literal fallbacks are detected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-shell-expansion-'));
  const safePath = join(dir, 'safe.sh');
  writeFileSync(safePath, [
    'TOKEN="${TOKEN}"',
    'ADMIN_PASSWORD="${ADMIN_PASSWORD:-$ROLE_ROUTE_PASSWORD}"',
    'PASSWORD="${PASSWORD:?Required credential is missing}"',
  ].join('\n'));
  assert.equal(run(['--file', safePath]).status, 0);

  const unsafePath = join(dir, 'unsafe.sh');
  const fallback = ['actual', '-credential-', 'material'].join('');
  writeFileSync(unsafePath, `PASSWORD="\${PASSWORD:-${fallback}}"\n`);
  const result = run(['--file', unsafePath]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[SENSITIVE_ASSIGNMENT\]/);
  assert.equal(result.stdout.includes(fallback), false);
  assert.equal(result.stderr.includes(fallback), false);
});

test('validation collections, regex metadata, property reads, and comparisons are ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-validation-constructs-'));
  const path = join(dir, 'validation.mjs');
  writeFileSync(path, [
    'const required = ["JWT_SECRET", "STRIPE_SECRET_KEY"];',
    'const optional = new Set(["API_KEY", "WEBHOOK_SECRET"]);',
    'const formats = {',
    '  STRIPE_SECRET_KEY: /^sk_test_[A-Za-z0-9_]+$/,',
    '  STRIPE_WEBHOOK_SECRET: /^whsec_[A-Za-z0-9_]+$/,',
    '};',
    'const current = process.env.JWT_SECRET;',
    'process.env.JWT_SECRET === "comparison";',
  ].join('\n'));
  assert.equal(run(['--file', path]).status, 0);
});

test('slash-prefixed sensitive assignments remain detected outside regex metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-slash-assignment-'));
  const assignedValue = ['/synthetic', '-credential-material'].join('');
  const candidates = [
    `PASSWORD=${assignedValue}`,
    `export ADMIN_PASSWORD=${assignedValue}`,
    `JWT_SECRET=${assignedValue}`,
    `process.env.API_KEY = ${assignedValue}`,
    `config.PASSWORD = ${assignedValue}`,
    `STRIPE_SECRET_KEY: ${assignedValue}`,
    `STRIPE_WEBHOOK_SECRET: /^bounded$/ ${assignedValue}`,
  ];
  for (const [index, content] of candidates.entries()) {
    const path = join(dir, `candidate-${index}.txt`);
    writeFileSync(path, `${content}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[SENSITIVE_ASSIGNMENT\]/);
    assert.equal(result.stdout.includes(assignedValue), false);
    assert.equal(result.stderr.includes(assignedValue), false);
    assert.equal(result.stdout.includes(content), false);
    assert.equal(result.stderr.includes(content), false);
  }
});

test('JavaScript regex metadata is ignored only for bounded literals with valid flags', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-regex-metadata-'));
  const path = join(dir, 'validation.mjs');
  writeFileSync(path, [
    'const formats = {',
    '  STRIPE_SECRET_KEY: /^sk_test_[A-Za-z0-9_]+$/,',
    '  STRIPE_WEBHOOK_SECRET: /^https:\\/\\/hooks\\/[^\\/]+$/gi; // validation pattern',
    '};',
  ].join('\n'));
  assert.equal(run(['--file', path]).status, 0);
});

test('regex metadata with slashes inside character classes is bounded correctly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-regex-character-class-'));
  const safePath = join(dir, 'safe.mjs');
  writeFileSync(safePath, [
    'const formats = {',
    '  API_KEY: /^[a/b]{8}$/,',
    '  SECRET_KEY: /[/]/,',
    '  CLIENT_SECRET: /^[abc/def]+$/i,',
    '  WEBHOOK_SECRET: /^https:\\/\\/hooks\\/path$/g,',
    '  JWT_SECRET: /^[a\\]b/]+$/m,',
    '  TOKEN: /^[a/b]+$/d; // validation pattern',
    '};',
  ].join('\n'));
  assert.equal(run(['--file', safePath]).status, 0);

  const assignedValue = ['synthetic', '-credential-material'].join('');
  const unsafe = [
    'API_KEY: /^[abc/def]+$',
    'API_KEY: /^[abc/def+$/',
    'API_KEY: /^bounded$/z,',
    'API_KEY: /^bounded$/gg,',
    'API_KEY: /^bounded$/uv,',
    `API_KEY: /^bounded$/ ${assignedValue}`,
  ];
  for (const [index, content] of unsafe.entries()) {
    const path = join(dir, `unsafe-${index}.mjs`);
    writeFileSync(path, `${content}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[SENSITIVE_ASSIGNMENT\]/);
    assert.equal(result.stdout.includes(assignedValue), false);
    assert.equal(result.stderr.includes(assignedValue), false);
    assert.equal(result.stdout.includes(content), false);
    assert.equal(result.stderr.includes(content), false);
  }
});

test('exported unquoted environment references are narrowly ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-export-reference-'));
  const safePath = join(dir, 'safe.sh');
  writeFileSync(safePath, [
    'export API_KEY=$API_KEY',
    'export PASSWORD=$SOURCE_PASSWORD',
    'TOKEN=$TOKEN',
    'SECRET=${SECRET}',
  ].join('\n'));
  assert.equal(run(['--file', safePath]).status, 0);

  const assignedValue = ['synthetic', '-credential-material'].join('');
  const unsafe = [
    `export API_KEY=${assignedValue}`,
    `export API_KEY=/${assignedValue}`,
    'export API_KEY=$API_KEY-hard-coded-suffix',
    'export PASSWORD=$PASSWORD/embedded-material',
    'export API_KEY=${API_KEY:-hard-coded-fallback}',
    'process.env.API_KEY = $API_KEY',
    'config.API_KEY = $API_KEY',
  ];
  for (const [index, content] of unsafe.entries()) {
    const path = join(dir, `unsafe-${index}.sh`);
    writeFileSync(path, `${content}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[SENSITIVE_ASSIGNMENT\]/);
    assert.equal(result.stdout.includes(assignedValue), false);
    assert.equal(result.stderr.includes(assignedValue), false);
    assert.equal(result.stdout.includes(content), false);
    assert.equal(result.stderr.includes(content), false);
  }
});

test('direct literals remain detected while runtime-fragment synthetic fixtures stay clean and output is redacted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-runtime-fragment-'));
  const safePath = join(dir, 'safe.mjs');
  writeFileSync(safePath, [
    'const TEST_STRIPE_SECRET_KEY = ["sk", "_test_", "test", "only"].join("");',
    'const TEST_WEBHOOK_SECRET = ["wh", "sec_", "test", "only"].join("");',
  ].join('\n'));
  assert.equal(run(['--file', safePath]).status, 0);

  const unsafePath = join(dir, 'unsafe.mjs');
  const literal = ['direct', '-credential-', 'material'].join('');
  writeFileSync(unsafePath, `const JWT_SECRET = "${literal}";\n`);
  const result = run(['--file', unsafePath]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[SENSITIVE_ASSIGNMENT\]/);
  assert.equal(result.stdout.includes(literal), false);
  assert.equal(result.stderr.includes(literal), false);
});

test('member assignments use anchored whole-value placeholder validation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-member-placeholder-'));
  const safePath = join(dir, 'safe.txt');
  writeFileSync(safePath, [
    'process.env.JWT_SECRET = "test-only-secret";',
    'config.API_KEY = `replace-with-api-key`;',
  ].join('\n'));
  assert.equal(run(['--file', safePath]).status, 0);

  const unsafe = 'production-example-real-key';
  const unsafePath = join(dir, 'unsafe.txt');
  writeFileSync(unsafePath, `config.API_KEY = "${unsafe}";\n`);
  const result = run(['--file', unsafePath]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(unsafe), false);
  assert.equal(result.stderr.includes(unsafe), false);
});

test('multiline bare, quoted-key, process env, bracket, nested, and module assignments are detected', () => {
  const value = `${'m'.repeat(14)}!${'n'.repeat(14)}`;
  const candidates = [
    `const JWT_SECRET =\n  "${value}";`,
    `"CLIENT_SECRET":\n  '${value}',`,
    `process.env.JWT_SECRET =\n  // test configuration\n  "${value}";`,
    `process.env["OPENAI_API_KEY"] =\n  '${value}';`,
    `config.API_KEY =\n  \`${value}\`;`,
    `config["CLIENT_SECRET"] =\n  "${value}";`,
    `settings.auth.PASSWORD =\n\n  "${value}";`,
    `module.exports.JWT_SECRET =\n  "${value}";`,
  ];
  for (const content of candidates) {
    const dir = mkdtempSync(join(tmpdir(), 'secret-multiline-file-'));
    const path = join(dir, 'assignment.txt');
    writeFileSync(path, `${content}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /:1 \[SENSITIVE_ASSIGNMENT\]/);
    assert.equal(result.stdout.includes(value), false);
    assert.equal(result.stderr.includes(value), false);
  }
});

test('multiline runtime expressions and non-assignments are ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-multiline-negative-'));
  const path = join(dir, 'assignment.txt');
  writeFileSync(path, [
    'const JWT_SECRET =', '  buildSecret();',
    'process.env.JWT_SECRET =', '  existingSecret;',
    'config.API_KEY =', '  parts.join("");',
    'settings.PASSWORD =', '  getPassword();',
    'process.env.JWT_SECRET', '  === "comparison";',
    'const { JWT_SECRET } = process.env;',
    'config?.API_KEY;',
    'config.API_KEY =', '  `prefix-${runtimeValue}`;',
  ].join('\n'));
  assert.equal(run(['--file', path]).status, 0);
});

test('multiline whole-value placeholders pass while embedded markers and nearby comments do not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-multiline-placeholder-'));
  const safePath = join(dir, 'safe.txt');
  writeFileSync(safePath, [
    'const JWT_SECRET =', '  "test-only-secret";',
    'config.API_KEY =', '  `replace-with-api-key`;',
  ].join('\n'));
  assert.equal(run(['--file', safePath]).status, 0);

  const value = 'production-example-real-secret';
  const unsafePath = join(dir, 'unsafe.txt');
  writeFileSync(unsafePath, ['process.env.JWT_SECRET =', '  // placeholder test-only', `  "${value}";`].join('\n'));
  const result = run(['--file', unsafePath]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('multiline assignment parsing stops safely at its physical-line bound', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-multiline-bound-'));
  const path = join(dir, 'assignment.txt');
  const content = ['const JWT_SECRET =', ...Array(8).fill(''), `"${'b'.repeat(30)}";`].join('\n');
  writeFileSync(path, content);
  const result = run(['--file', path]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('URL placeholder components require anchored whole-value markers', () => {
  const embedded = ['example', 'fake', 'dummy', 'test'];
  for (const marker of embedded) {
    const dir = mkdtempSync(join(tmpdir(), 'secret-url-component-'));
    const path = join(dir, 'candidate.txt');
    const url = ['postgresql://real', marker, 'user:real', marker, 'password@host.invalid/db'].join('');
    writeFileSync(path, `${url}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[CREDENTIAL_URL\]/);
    assert.equal(result.stdout.includes(url), false);
    assert.equal(result.stderr.includes(url), false);
  }
});

test('percent-encoded explicit URL placeholder components are accepted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-url-placeholder-'));
  const path = join(dir, 'candidate.txt');
  const url = ['postgresql://example%2Duser:test%2Donly%2Dpassword@host.invalid/db'].join('');
  writeFileSync(path, `${url}\n`);
  assert.equal(run(['--file', path]).status, 0);
});

test('unrelated placeholder text cannot hide high-confidence credentials', () => {
  const credentials = [
    ['OPENAI_API_KEY', `${['sk', '-proj-', 'o'.repeat(30)].join('')} # test-secret`],
    ['GITHUB_TOKEN', `${['gh', 'p_', 'g'.repeat(36)].join('')} # placeholder`],
    ['AWS_ACCESS_KEY_ID', `${['AK', 'IA', 'W'.repeat(16)].join('')} # localhost`],
    ['CREDENTIAL_URL', `${['redis://user:', 'v'.repeat(20), '@cache.host/0'].join('')} # dummy`],
    ['AUTHORIZATION_VALUE', `${['Authorization: Bearer ', 'h'.repeat(30)].join('')} # development`],
    ['STRIPE_KEY', `${['sk', '_live_', 'k'.repeat(24)].join('')} # example`],
    ['SLACK_TOKEN', `${['xapp', '-', '5'.repeat(12), '-', '6'.repeat(12)].join('')} # placeholder`],
  ];
  for (const [rule, content] of credentials) {
    const dir = mkdtempSync(join(tmpdir(), 'secret-context-'));
    const path = join(dir, 'context.txt');
    writeFileSync(path, content);
    const result = run(['--file', path]);
    assert.equal(result.status, 1, rule);
    assert.match(result.stdout, new RegExp(`\\[${rule}\\]`));
    assert.equal(result.stdout.includes(content.split(' # ')[0]), false);
  }
});

test('real-looking credentials in documentation are rejected', () => {
  const secret = ['gh', 'p_', 'z'.repeat(36)].join('');
  const dir = mkdtempSync(join(tmpdir(), 'secret-doc-'));
  const path = join(dir, 'README.md');
  writeFileSync(path, `Example placeholder that must still fail: ${secret}\n`);
  const result = run(['--file', path]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
});

test('tracked mode scans committed HEAD blobs despite safe working-tree replacements', () => {
  const dir = repository();
  const secret = ['AI', 'za', 'T'.repeat(35)].join('');
  commitFile(dir, 'tracked file.txt', secret, 'tracked fixture');
  writeFileSync(join(dir, 'tracked file.txt'), 'safe unstaged replacement');
  const result = run(['--tracked'], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('tracked mode scans a HEAD blob deleted only from the working tree', () => {
  const dir = repository();
  const secret = ['gh', 'u_', 't'.repeat(36)].join('');
  commitFile(dir, 'deleted file.txt', secret, 'tracked fixture');
  unlinkSync(join(dir, 'deleted file.txt'));
  const result = run(['--tracked'], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('tracked mode exits safely in a repository with no HEAD', () => {
  const dir = repository();
  assert.equal(run(['--tracked'], dir).status, 0);
});

test('tracked mode detects a multiline literal in the committed HEAD blob', () => {
  const dir = repository();
  const value = `${'t'.repeat(14)}!${'u'.repeat(14)}`;
  commitFile(dir, 'tracked multiline.js', `const JWT_SECRET =\n  "${value}";\n`, 'multiline fixture');
  writeFileSync(join(dir, 'tracked multiline.js'), 'safe unstaged replacement');
  const result = run(['--tracked'], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('tree mode scans an arbitrary commit without checking it out', () => {
  const dir = repository();
  const value = `${'t'.repeat(14)}!${'u'.repeat(14)}`;
  const secretCommit = commitFile(dir, 'tree-é file.js', `process.env.JWT_SECRET =\n  "${value}";\n`, 'secret tree');
  commitFile(dir, 'tree-é file.js', 'safe checked-out replacement\n', 'safe tree');
  const result = run(['--tree', secretCommit], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
  assert.equal(readFileSync(join(dir, 'tree-é file.js'), 'utf8'), 'safe checked-out replacement\n');
});

test('tree mode fails closed for an unavailable commit without exposing its identifier', () => {
  const dir = repository();
  commitFile(dir, 'base.txt', 'safe\n', 'base');
  const unavailable = '1'.repeat(40);
  const result = run(['--tree', unavailable], dir);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.includes(unavailable), false);
  assert.equal(result.stderr.includes(unavailable), false);
});

test('staged mode reads index blobs instead of unstaged files', () => {
  const dir = repository();
  writeFileSync(join(dir, 'indexed.txt'), 'initial');
  git(dir, 'add', 'indexed.txt');
  git(dir, 'commit', '-qm', 'initial');
  const secret = ['xox', 'p-', '7'.repeat(25)].join('');
  writeFileSync(join(dir, 'indexed.txt'), secret);
  git(dir, 'add', 'indexed.txt');
  writeFileSync(join(dir, 'indexed.txt'), 'safe unstaged replacement');
  const result = run(['--staged'], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
});

test('staged mode ignores unchanged committed secret-like fixtures', () => {
  const dir = repository();
  const oldSecret = ['gh', 'p_', 'q'.repeat(36)].join('');
  writeFileSync(join(dir, 'legacy-fixture.txt'), oldSecret);
  writeFileSync(join(dir, 'changed.txt'), 'initial');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'baseline');
  writeFileSync(join(dir, 'changed.txt'), 'safe staged change');
  git(dir, 'add', 'changed.txt');
  const result = run(['--staged'], dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('staged mode detects a newly staged credential', () => {
  const dir = repository();
  commitFile(dir, 'base.txt', 'base', 'base');
  const secret = ['gh', 'o_', 'n'.repeat(36)].join('');
  writeFileSync(join(dir, 'new file.txt'), secret);
  git(dir, 'add', 'new file.txt');
  const result = run(['--staged'], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
});

test('staged deletion is ignored safely', () => {
  const dir = repository();
  commitFile(dir, 'delete-me.txt', 'safe', 'base');
  git(dir, 'rm', 'delete-me.txt');
  assert.equal(run(['--staged'], dir).status, 0);
});

test('empty staged change set exits zero', () => {
  const dir = repository();
  commitFile(dir, 'base.txt', 'safe', 'base');
  const result = run(['--staged'], dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('staged mode handles a repository with no HEAD', () => {
  const dir = repository();
  writeFileSync(join(dir, 'first file.txt'), 'safe');
  git(dir, 'add', 'first file.txt');
  assert.equal(run(['--staged'], dir).status, 0);
});

test('staged mode and pre-commit detect exact multiline index content', () => {
  const dir = hookRepository();
  commitFile(dir, 'base.txt', 'safe', 'base');
  const value = `${'s'.repeat(14)}!${'v'.repeat(14)}`;
  writeFileSync(join(dir, 'staged multiline.js'), `process.env.JWT_SECRET =\n  "${value}";\n`);
  git(dir, 'add', 'staged multiline.js');
  writeFileSync(join(dir, 'staged multiline.js'), 'safe unstaged replacement');
  for (const result of [run(['--staged'], dir), runPreCommit(dir)]) {
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(value), false);
    assert.equal(result.stderr.includes(value), false);
  }
});

test('range mode detects credentials introduced by commits', () => {
  const dir = repository();
  writeFileSync(join(dir, 'history.txt'), 'safe');
  git(dir, 'add', 'history.txt');
  git(dir, 'commit', '-qm', 'base');
  const base = git(dir, 'rev-parse', 'HEAD');
  const secret = ['sk', '-svcacct-', 'u'.repeat(30)].join('');
  writeFileSync(join(dir, 'history.txt'), `safe\n${secret}\n`);
  git(dir, 'add', 'history.txt');
  git(dir, 'commit', '-qm', 'introduce fixture');
  const head = git(dir, 'rev-parse', 'HEAD');
  const result = run(['--range', `${base}..${head}`], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
});

test('range mode detects multiline assignment and value introduced together', () => {
  const dir = repository();
  const base = commitFile(dir, 'base.txt', 'safe', 'base');
  const value = `${'r'.repeat(14)}!${'w'.repeat(14)}`;
  const head = commitFile(dir, 'multiline.js', `const JWT_SECRET =\n  "${value}";\n`, 'introduce multiline');
  const result = run(['--range', `${base}..${head}`], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('range mode detects multiline assignment when only the value line changes', () => {
  const dir = repository();
  const path = 'multiline.js';
  const base = commitFile(dir, path, 'const JWT_SECRET =\n  "test-only-secret";\n', 'placeholder base');
  const value = `${'c'.repeat(14)}!${'d'.repeat(14)}`;
  const head = commitFile(dir, path, `const JWT_SECRET =\n  "${value}";\n`, 'change value only');
  const result = run(['--range', `${base}..${head}`], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('range mode detects a newly introduced assignment line beside existing literal context', () => {
  const dir = repository();
  const path = 'multiline.js';
  const value = `${'e'.repeat(14)}!${'f'.repeat(14)}`;
  const base = commitFile(dir, path, `"${value}";\n`, 'literal context');
  const head = commitFile(dir, path, `const JWT_SECRET =\n"${value}";\n`, 'add assignment only');
  const result = run(['--range', `${base}..${head}`], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('range mode detects multiline assignments across blank and comment lines', () => {
  const dir = repository();
  const base = commitFile(dir, 'base.txt', 'safe', 'base');
  const value = `${'g'.repeat(14)}!${'h'.repeat(14)}`;
  const head = commitFile(dir, 'multiline.js', `config["CLIENT_SECRET"] =\n\n  // example placeholder\n  '${value}';\n`, 'introduce commented multiline');
  const result = run(['--range', `${base}..${head}`], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('range mode handles Unicode, quoted, spaced, tabbed, backslash, dash, and newline paths', () => {
  const names = ['unicode-é.txt', 'quoted-"file.txt', 'spaced file.txt', 'tab\tfile.txt', 'back\\slash.txt', '-leading.txt', 'line\nbreak.txt'];
  for (const [index, name] of names.entries()) {
    const dir = repository();
    const base = commitFile(dir, 'base.txt', 'safe', 'base');
    const secret = ['gh', 'p_', String(index).repeat(36)].join('');
    writeFileSync(join(dir, name), secret);
    git(dir, 'add', '--', name);
    git(dir, 'commit', '-qm', 'introduce unusual path');
    const head = git(dir, 'rev-parse', 'HEAD');
    const result = run(['--range', `${base}..${head}`], dir);
    assert.equal(result.status, 1, `unusual path case ${index}`);
    assert.equal(result.stdout.includes(secret), false);
    assert.equal(result.stderr.includes(secret), false);
  }
});

test('range mode detects a Unicode-path credential introduced and later deleted', () => {
  const dir = repository();
  const base = commitFile(dir, 'base.txt', 'safe', 'base');
  const name = 'transient-é.txt';
  const secret = ['gh', 'o_', 'u'.repeat(36)].join('');
  commitFile(dir, name, secret, 'introduce unusual path');
  unlinkSync(join(dir, name));
  git(dir, 'add', '-u');
  git(dir, 'commit', '-qm', 'remove unusual path');
  const head = git(dir, 'rev-parse', 'HEAD');
  const result = run(['--range', `${base}..${head}`], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('output paths redact credentials and neutralize control characters', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-output-path-'));
  const secret = ['gh', 'r_', 'r'.repeat(36)].join('');
  const credentialPath = join(dir, secret);
  writeFileSync(credentialPath, `${secret}\n`);
  const credentialResult = run(['--file', credentialPath]);
  assert.equal(credentialResult.status, 1);
  assert.match(credentialResult.stdout, /\[redacted-path:[a-f0-9]{12}\]/);
  assert.equal(credentialResult.stdout.includes(secret), false);
  assert.equal(credentialResult.stderr.includes(secret), false);

  for (const [index, name] of ['line\nforged.txt', 'ansi\u001b[31m.txt', 'tab\tfile.txt'].entries()) {
    const path = join(dir, name);
    writeFileSync(path, `${['AI', 'za', String(index).repeat(35)].join('')}\n`);
    const result = run(['--file', path]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(name), false);
    assert.equal(/[\u0000-\u001f\u007f-\u009f]/.test(result.stdout.replace(/\n$/, '')), false);
  }

  const normalPath = join(dir, 'normal path.txt');
  writeFileSync(normalPath, `${['AI', 'za', 'N'.repeat(35)].join('')}\n`);
  assert.match(run(['--file', normalPath]).stdout, /normal path\.txt:/);
});

test('binary files are skipped safely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-binary-'));
  const path = join(dir, 'asset.bin');
  writeFileSync(path, Buffer.from([0, 1, 2, 3, 255]));
  assert.equal(run(['--file', path]).status, 0);
});

test('malformed arguments and ranges fail safely', () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(['--range', 'HEAD']).status, 2);
  assert.equal(run(['--tracked', '--file', 'x']).status, 2);
  const result = run(['--range', '--bad..HEAD']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
});

test('pre-push scans an existing remote branch update', () => {
  const dir = hookRepository();
  const base = commitFile(dir, 'history file.txt', 'safe', 'base');
  git(dir, 'update-ref', 'refs/remotes/origin/main', base);
  const secret = ['gh', 's_', 'x'.repeat(36)].join('');
  const head = commitFile(dir, 'history file.txt', secret, 'outgoing secret');
  const result = runPrePush(dir, `refs/heads/topic/secret-check ${head} refs/heads/topic/secret-check ${base}\n`);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('pre-push scans all new-branch commits including a secret later deleted', () => {
  const dir = hookRepository();
  const base = commitFile(dir, 'history.txt', 'safe', 'base');
  git(dir, 'update-ref', 'refs/remotes/origin/main', base);
  git(dir, 'checkout', '-qb', 'feature');
  const secret = ['gh', 'r_', 'y'.repeat(36)].join('');
  commitFile(dir, 'history.txt', secret, 'introduce secret');
  const head = commitFile(dir, 'history.txt', 'safe again', 'remove secret');
  const zero = '0'.repeat(40);
  const result = runPrePush(dir, `refs/heads/feature ${head} refs/heads/feature ${zero}\n`);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('pre-push new-branch scanning does not exclude commits on an unrelated remote', () => {
  const dir = hookRepository();
  commitFile(dir, 'base.txt', 'safe\n', 'base');
  const value = `${'d'.repeat(14)}!${'e'.repeat(14)}`;
  const head = commitFile(dir, 'secondary-é file.js', `config.API_KEY =\n  "${value}";\n`, 'secondary-only credential');
  git(dir, 'update-ref', 'refs/remotes/secondary/topic', head);
  const zero = '0'.repeat(40);
  const result = runPrePush(dir, `refs/heads/topic ${head} refs/heads/topic ${zero}\n`);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('pre-push new-branch scanning excludes only destination-remote heads', () => {
  const dir = hookRepository();
  const destinationCredential = ['gh', 'p_', 'h'.repeat(36)].join('');
  const base = commitFile(dir, 'base.txt', `${destinationCredential}\n`, 'destination history');
  git(dir, 'push', '-q', 'origin', `${base}:refs/heads/main`, `${base}:refs/heads/release`);
  const head = commitFile(dir, 'candidate.txt', 'safe outgoing update\n', 'safe outgoing');
  git(dir, 'update-ref', 'refs/remotes/secondary/topic', head);
  const zero = '0'.repeat(40);
  const result = runPrePush(dir, `refs/heads/topic ${head} refs/heads/topic ${zero}\n`);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes(destinationCredential), false);
  assert.equal(result.stderr.includes(destinationCredential), false);
});

test('pre-push new-branch scanning ignores stale destination tracking refs', () => {
  const dir = hookRepository();
  const base = commitFile(dir, 'base.txt', 'safe\n', 'base');
  git(dir, 'push', '-q', 'origin', `${base}:refs/heads/main`);
  const value = `${'j'.repeat(14)}!${'k'.repeat(14)}`;
  const head = commitFile(dir, 'stale-ref.js', `module.exports.JWT_SECRET =\n  "${value}";\n`, 'credential after base');
  git(dir, 'update-ref', 'refs/remotes/origin/deleted-topic', head);
  const zero = '0'.repeat(40);
  const result = runPrePush(dir, `refs/heads/topic ${head} refs/heads/topic ${zero}\n`);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('pre-push new-branch destination-history failure is closed and redacted', () => {
  const dir = hookRepository();
  const head = commitFile(dir, 'candidate.txt', 'safe\n', 'safe');
  const zero = '0'.repeat(40);
  const remoteUrl = ['https://synthetic-user:', 'synthetic-password@host.invalid/repository'].join('');
  const result = runPrePush(dir, `refs/heads/topic ${head} refs/heads/topic ${zero}\n`, 'missing-destination', remoteUrl);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /could not obtain the required destination history/);
  assert.equal(result.stdout.includes(remoteUrl), false);
  assert.equal(result.stderr.includes(remoteUrl), false);
  assert.equal(result.stdout.includes(head), false);
  assert.equal(result.stderr.includes(head), false);
});

test('pre-push ignores branch deletion safely', () => {
  const dir = hookRepository();
  const head = commitFile(dir, 'history.txt', 'safe', 'base');
  const zero = '0'.repeat(40);
  assert.equal(runPrePush(dir, `refs/heads/old ${zero} refs/heads/old ${head}\n`).status, 0);
});

test('pre-push processes multiple ref updates', () => {
  const dir = hookRepository();
  const base = commitFile(dir, 'history.txt', 'safe', 'base');
  git(dir, 'update-ref', 'refs/remotes/origin/main', base);
  git(dir, 'branch', 'safe-branch');
  git(dir, 'checkout', '-qb', 'secret-branch');
  const secret = ['xox', 'b-', '8'.repeat(25)].join('');
  const secretHead = commitFile(dir, 'history.txt', secret, 'secret update');
  const input = [
    `refs/heads/safe-branch ${base} refs/heads/safe-branch ${base}`,
    `refs/heads/secret-branch ${secretHead} refs/heads/secret-branch ${base}`,
  ].join('\n') + '\n';
  const result = runPrePush(dir, input);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('pre-push fetches an absent nonzero remote tip using the supplied remote name', () => {
  const { local, remote, remoteHead } = remoteTipScenario();
  assert.notEqual(spawnSync('git', ['cat-file', '-e', `${remoteHead}^{commit}`], { cwd: local }).status, 0);
  const localHead = commitFile(local, 'local.txt', 'safe local update', 'local update');
  const result = runPrePush(local, `refs/heads/main ${localHead} refs/heads/main ${remoteHead}\n`, 'review-remote', remote);
  assert.equal(result.status, 0);
  assert.equal(spawnSync('git', ['cat-file', '-e', `${remoteHead}^{commit}`], { cwd: local }).status, 0);
});

test('pre-push fetches the remote tip before detecting an outgoing multiline credential', () => {
  const { local, remote, remoteHead } = remoteTipScenario();
  const secret = `${'k'.repeat(14)}!${'l'.repeat(14)}`;
  const localHead = commitFile(local, 'local.js', `process.env.JWT_SECRET =\n  "${secret}";\n`, 'outgoing credential');
  const result = runPrePush(local, `refs/heads/main ${localHead} refs/heads/main ${remoteHead}\n`, 'review-remote', remote);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('pre-push detects a transient multiline credential removed by a later commit', () => {
  const dir = hookRepository();
  const base = commitFile(dir, 'history.txt', 'safe', 'base');
  git(dir, 'update-ref', 'refs/remotes/origin/main', base);
  const value = `${'x'.repeat(14)}!${'y'.repeat(14)}`;
  commitFile(dir, 'history.js', `module.exports.JWT_SECRET =\n  "${value}";\n`, 'introduce multiline');
  const head = commitFile(dir, 'history.js', 'safe again', 'remove multiline');
  for (const result of [run(['--range', `${base}..${head}`], dir), runPrePush(dir, `refs/heads/main ${head} refs/heads/main ${base}\n`)]) {
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(value), false);
    assert.equal(result.stderr.includes(value), false);
  }
});

test('pre-push fails closed without exposing unavailable remote history details', () => {
  const { local, remote } = remoteTipScenario();
  const localHead = commitFile(local, 'local.txt', 'safe local update', 'local update');
  const unavailable = '1'.repeat(40);
  const remoteUrl = ['https://synthetic-user:', 'synthetic-password@host.invalid/repository'].join('');
  const sourceContent = 'safe remote update';
  const result = runPrePush(local, `refs/heads/main ${localHead} refs/heads/main ${unavailable}\n`, 'review-remote', remoteUrl);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /could not obtain the required remote history/);
  assert.equal(result.stdout.includes(unavailable), false);
  assert.equal(result.stderr.includes(unavailable), false);
  assert.equal(result.stdout.includes(remoteUrl), false);
  assert.equal(result.stderr.includes(remoteUrl), false);
  assert.equal(result.stdout.includes(sourceContent), false);
  assert.equal(result.stderr.includes(sourceContent), false);
});

test('pre-push blocks transient credentials in Unicode and quoted paths', () => {
  for (const [index, name] of ['push-é.txt', 'push-"quoted.txt', 'push\\backslash.txt'].entries()) {
    const dir = hookRepository();
    const base = commitFile(dir, 'base.txt', 'safe', 'base');
    git(dir, 'update-ref', 'refs/remotes/origin/main', base);
    const secret = ['gh', 'u_', String(index).repeat(36)].join('');
    commitFile(dir, name, secret, 'introduce unusual path');
    unlinkSync(join(dir, name));
    git(dir, 'add', '-u');
    git(dir, 'commit', '-qm', 'remove unusual path');
    const head = git(dir, 'rev-parse', 'HEAD');
    const result = runPrePush(dir, `refs/heads/topic/path-${index} ${head} refs/heads/topic/path-${index} ${base}\n`);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(secret), false);
    assert.equal(result.stderr.includes(secret), false);
  }
});

function ciRepository() {
  const dir = repository();
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(scanner, join(dir, 'scripts', 'secret-scan.mjs'));
  copyFileSync(ciHistoryScanner, join(dir, 'scripts', 'ci-secret-history-scan.sh'));
  return dir;
}

function runCiHistory(dir, eventName, base, head) {
  return spawnSync('bash', [join(dir, 'scripts', 'ci-secret-history-scan.sh')], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, EVENT_NAME: eventName, BASE_SHA: base, HEAD_SHA: head },
  });
}

function trustedPullRequestScenario({ advanceBase = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'trusted-pr-objects-'));
  const origin = join(root, 'origin.git');
  const producer = join(root, 'producer');
  const checkout = join(root, 'trusted-checkout');
  mkdirSync(producer);
  mkdirSync(checkout);
  git(root, 'init', '--bare', '-q', origin);
  git(producer, 'init', '-q');
  const base = commitFile(producer, 'base.txt', 'safe base\n', 'event base');
  git(producer, 'branch', '-M', 'release/secure');
  git(producer, 'checkout', '-qb', 'pull-request');
  const head = commitFile(producer, 'head.txt', 'safe pull request\n', 'event head');
  git(producer, 'remote', 'add', 'origin', origin);
  git(producer, 'push', '-q', 'origin', `${head}:refs/pull/17/head`, `${base}:refs/heads/release/secure`);
  if (advanceBase) {
    git(producer, 'checkout', '-q', 'release/secure');
    const advanced = commitFile(producer, 'advanced.txt', 'safe advanced base\n', 'advanced base');
    git(producer, 'push', '-q', 'origin', `${advanced}:refs/heads/release/secure`);
  }
  git(checkout, 'init', '-q');
  git(checkout, 'remote', 'add', 'origin', origin);
  return { checkout, origin, base, head };
}

function runTrustedPrObjectFetch(dir, base, head, extraEnv = {}) {
  return spawnSync('bash', [trustedPrObjectFetcher], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PR_NUMBER: '17',
      BASE_SHA: base,
      BASE_REF: 'release/secure',
      HEAD_SHA: head,
      ...extraEnv,
    },
  });
}

test('trusted PR acquisition accepts exact event base before and after the base branch advances', () => {
  for (const advanceBase of [false, true]) {
    const { checkout, base, head } = trustedPullRequestScenario({ advanceBase });
    const currentBaseTip = git(checkout, 'ls-remote', 'origin', 'refs/heads/release/secure').split(/\s/)[0];
    assert.equal(currentBaseTip === base, !advanceBase);
    const result = runTrustedPrObjectFetch(checkout, base, head);
    assert.equal(result.status, 0);
    assert.equal(run(['--range', `${base}..${head}`], checkout).status, 0);
    assert.equal(git(checkout, 'rev-parse', '--verify', 'refs/secret-scan/head'), head);
  }
});

test('trusted PR acquisition fails closed when the exact event base is unavailable', () => {
  const { checkout, origin, head } = trustedPullRequestScenario({ advanceBase: true });
  const unavailable = '1'.repeat(40);
  const remoteUrl = ['https://synthetic-user:', 'synthetic-password@host.invalid/repository'].join('');
  const result = runTrustedPrObjectFetch(checkout, unavailable, head, { REMOTE_URL: remoteUrl });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /could not obtain or verify required pull-request history/);
  for (const unsafe of [unavailable, head, origin, remoteUrl]) {
    assert.equal(result.stdout.includes(unsafe), false);
    assert.equal(result.stderr.includes(unsafe), false);
  }
});

test('trusted PR acquisition rejects a force-moved head ref and ignores fork fetch data', () => {
  const { checkout, origin, base, head } = trustedPullRequestScenario();
  const producer = repository();
  const movedHead = commitFile(producer, 'moved.txt', 'safe moved head\n', 'moved head');
  git(producer, 'remote', 'add', 'origin', origin);
  git(producer, 'push', '-q', '-f', 'origin', `${movedHead}:refs/pull/17/head`);
  const forkUrl = ['https://synthetic-user:', 'synthetic-password@fork.invalid/repository'].join('');
  const result = runTrustedPrObjectFetch(checkout, base, head, { HEAD_REPOSITORY_URL: forkUrl });
  assert.notEqual(result.status, 0);
  for (const unsafe of [head, movedHead, origin, forkUrl]) {
    assert.equal(result.stdout.includes(unsafe), false);
    assert.equal(result.stderr.includes(unsafe), false);
  }
});

test('trusted workflow enforces pull requests with default-branch code and object-only PR data', () => {
  const source = readFileSync(trustedWorkflow, 'utf8');
  const candidate = readFileSync(coreWorkflow, 'utf8');
  const fetcher = readFileSync(trustedPrObjectFetcher, 'utf8');
  assert.match(source, /^  pull_request_target: \{\}$/m);
  assert.match(source, /^          fetch-depth: 0$/m);
  assert.match(source, /github\.event\.repository\.default_branch/);
  assert.match(source, /bash scripts\/ci-fetch-trusted-pr-objects\.sh/);
  assert.match(fetcher, /refs\/pull\/\$\{PR_NUMBER\}\/head:refs\/secret-scan\/head/);
  assert.match(fetcher, /fetched_head.*HEAD_SHA/);
  assert.match(fetcher, /git cat-file -e "\$1\^\{commit\}"/);
  assert.match(fetcher, /refs\/heads\/\$\{BASE_REF\}:refs\/secret-scan\/base-history/);
  assert.match(fetcher, /--depth=1 origin "\$BASE_SHA"/);
  assert.doesNotMatch(fetcher, /fetched_base|refs\/secret-scan\/base\^\{commit\}/);
  assert.doesNotMatch(fetcher, /REMOTE_URL|HEAD_REPOSITORY_URL/);
  assert.match(source, /node scripts\/secret-scan\.mjs --tree "\$HEAD_SHA"/);
  assert.match(source, /bash scripts\/ci-secret-history-scan\.sh/);
  assert.match(source, /^    name: Secret Leak Prevention$/m);
  assert.doesNotMatch(source, /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha/);
  assert.doesNotMatch(source, /\bsecrets\./);
  assert.doesNotMatch(source, /\bnpm\s+(?:ci|install)|npm\s+--prefix/);
  assert.match(candidate, /^    name: Secret Scanner Candidate Validation$/m);
  assert.doesNotMatch(candidate, /^    name: Secret Leak Prevention$/m);
});

test('CI history scan handles ordinary pull requests and pushes', () => {
  const dir = ciRepository();
  const base = commitFile(dir, 'base.txt', 'safe', 'base');
  const head = commitFile(dir, 'base.txt', 'safe update', 'head');
  assert.equal(runCiHistory(dir, 'pull_request', base, head).status, 0);
  assert.equal(runCiHistory(dir, 'pull_request_target', base, head).status, 0);
  assert.equal(runCiHistory(dir, 'push', base, head).status, 0);
});

test('CI history scan detects an introduced multiline credential', () => {
  const dir = ciRepository();
  const base = commitFile(dir, 'base.txt', 'safe', 'base');
  const value = `${'i'.repeat(14)}!${'j'.repeat(14)}`;
  const head = commitFile(dir, 'history.js', `config.API_KEY =\n  \`${value}\`;\n`, 'multiline head');
  const result = runCiHistory(dir, 'pull_request', base, head);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(value), false);
  assert.equal(result.stderr.includes(value), false);
});

test('CI history scan fails closed when a nonzero event base is unavailable', () => {
  const dir = ciRepository();
  const head = commitFile(dir, 'base.txt', 'safe', 'head');
  const unavailable = '1'.repeat(40);
  const result = runCiHistory(dir, 'push', unavailable, head);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.includes(unavailable), false);
  assert.equal(result.stderr.includes(unavailable), false);
});

test('CI zero-before scan covers complete introduced history', () => {
  const dir = ciRepository();
  const secret = ['gh', 's_', 'z'.repeat(36)].join('');
  commitFile(dir, 'history.txt', secret, 'introduce');
  const head = commitFile(dir, 'history.txt', 'safe', 'remove');
  const result = runCiHistory(dir, 'push', '0'.repeat(40), head);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test('CI force-push scan explicitly fetches an absent event base', () => {
  const root = mkdtempSync(join(tmpdir(), 'secret-ci-fetch-'));
  const producer = join(root, 'producer');
  const origin = join(root, 'origin.git');
  const checkout = join(root, 'checkout');
  mkdirSync(producer);
  git(producer, 'init', '-q');
  const base = commitFile(producer, 'history.txt', 'safe', 'base');
  const head = commitFile(producer, 'history.txt', 'safe update', 'head');
  git(root, 'init', '--bare', '-q', origin);
  git(producer, 'remote', 'add', 'origin', origin);
  git(producer, 'push', '-q', 'origin', `${head}:refs/heads/main`, `${base}:refs/heads/archive-base`);
  const clone = spawnSync('git', ['clone', '-q', '--depth=1', '--branch', 'main', `file://${origin}`, checkout], { encoding: 'utf8' });
  assert.equal(clone.status, 0, clone.stderr);
  assert.notEqual(spawnSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: checkout }).status, 0);
  mkdirSync(join(checkout, 'scripts'));
  copyFileSync(scanner, join(checkout, 'scripts', 'secret-scan.mjs'));
  copyFileSync(ciHistoryScanner, join(checkout, 'scripts', 'ci-secret-history-scan.sh'));
  const result = runCiHistory(checkout, 'push', base, head);
  assert.equal(result.status, 0);
  assert.equal(spawnSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: checkout }).status, 0);
});

test('CI force-push logic explicitly fetches missing commits and has no tracked fallback', () => {
  const source = readFileSync(ciHistoryScanner, 'utf8');
  assert.match(source, /git fetch --no-tags --depth=1 origin/);
  assert.match(source, /required event commit is unavailable/);
  assert.doesNotMatch(source, /--tracked/);
});

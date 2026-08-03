#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ASSIGNMENT_LINES = 8;
const MAX_ASSIGNMENT_BYTES = 16 * 1024;
const PLACEHOLDER_VALUE = /^(?:replace[-_]with|example|invalid|placeholder|changeme|not[-_]for[-_]production|test[-_]only|unit[-_]test|fake|dummy)[-_](?:secret|token|password|private[-_]key|secret[-_]key|secret[-_]access[-_]key|api[-_]key|client[-_]secret|webhook[-_]secret|database[-_]url|credential[-_]encryption[-_]key|jwt[-_]secret|jwt[-_]signing[-_]secret)$/i;
const SYNTHETIC_PROVIDER_PLACEHOLDER = /^(?:sk[-_]test[-_]test[-_]only[-_]api[-_]key|whsec[-_]test[-_]only[-_]webhook[-_]secret)$/i;

const rules = [
  ['PRIVATE_KEY', /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE\sKEY-----|-----BEGIN OPENSSH PRIVATE\sKEY-----/, 'Remove the private key and rotate it immediately.'],
  ['GITHUB_TOKEN', /\b(?:(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/, 'Revoke the GitHub token and use a secret store.'],
  ['AWS_ACCESS_KEY_ID', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, 'Deactivate the AWS access key and use a secret store.'],
  ['STRIPE_KEY', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/, 'Roll the Stripe key and use a secret store.'],
  ['OPENAI_API_KEY', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/, 'Revoke the OpenAI API key and use a secret store.'],
  ['SLACK_TOKEN', /\b(?:xox[abprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,})\b/, 'Revoke the Slack token and use a secret store.'],
  ['GOOGLE_API_KEY', /\bAIza[0-9A-Za-z_-]{35}\b/, 'Restrict and rotate the Google API key.'],
  ['AUTHORIZATION_VALUE', /\b(?:authorization\s*[:=]\s*["']?|Authorization["']?\s*:\s*["']?)(?:Bearer\s+[A-Za-z0-9._~+\/-]{12,}|Basic\s+[A-Za-z0-9+/]{12,}={0,2})/i, 'Remove the authorization value and rotate its credential.'],
  ['JWT', /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/, 'Remove and invalidate the token; store it outside Git.'],
  ['CREDENTIAL_URL', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/@]+:[^\s/@]+@[^\s"'<>]+/i, 'Remove the credential-bearing URL and rotate its password.'],
];

const sensitiveIdentifier = /^(?:[A-Z][A-Z0-9]*_)*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SECRET_KEY|SECRET_ACCESS_KEY|API_KEY|CLIENT_SECRET|WEBHOOK_SECRET|DATABASE_URL|CREDENTIAL_ENCRYPTION_KEY)$/;
const identifierSource = '[A-Za-z_$][A-Za-z0-9_$]*';
const quotedKeySource = '(?:"[A-Za-z_][A-Za-z0-9_]*"|\'[A-Za-z_][A-Za-z0-9_]*\')';
const memberSource = `(?:\\.\\s*${identifierSource}|\\[\\s*${quotedKeySource}\\s*\\])`;
const assignmentStartRule = new RegExp(`^\\s*(?:(const|let|var|export)\\s+)?((?:${identifierSource})(?:\\s*${memberSource})*|${quotedKeySource})\\s*(:|=(?![=>]))\\s*(.*)$`);

function isExactGitHubActionsRuntimeReference(value) {
  let normalized = value.trim();

  if (
    normalized.length >= 2 &&
    ((normalized.startsWith("\"") && normalized.endsWith("\"")) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1);
  }

  if (!normalized.startsWith("${{") || !normalized.endsWith("}}")) {
    return false;
  }

  const expression = normalized.slice(3, -2);
  const runtimeContexts = new Set([
    "secrets",
    "vars",
    "env",
    "github",
    "inputs",
    "needs",
    "steps",
    "matrix",
    "runner",
    "strategy",
    "job",
    "jobs",
  ]);
  const skipExpressionWhitespace = (startIndex) => {
    let endIndex = startIndex;
    while (expression[endIndex] === " " || expression[endIndex] === "\t") {
      endIndex += 1;
    }
    return endIndex;
  };
  const isPropertyStart = (character) =>
    character !== undefined && /[A-Za-z_]/.test(character);
  const isPropertyCharacter = (character) =>
    character !== undefined && /[A-Za-z0-9_-]/.test(character);
  const consumeProperty = (startIndex) => {
    if (!isPropertyStart(expression[startIndex])) return -1;
    let endIndex = startIndex + 1;
    while (isPropertyCharacter(expression[endIndex])) endIndex += 1;
    return endIndex;
  };

  let index = skipExpressionWhitespace(0);
  const rootStart = index;
  index = consumeProperty(index);
  if (index < 0 || !runtimeContexts.has(expression.slice(rootStart, index))) {
    return false;
  }

  let propertyCount = 0;
  while (true) {
    index = skipExpressionWhitespace(index);
    if (index === expression.length) break;

    if (expression[index] === ".") {
      index = skipExpressionWhitespace(index + 1);
      index = consumeProperty(index);
      if (index < 0) return false;
    } else if (expression[index] === "[") {
      index = skipExpressionWhitespace(index + 1);
      const quote = expression[index];
      if (quote !== "'" && quote !== '"') return false;
      const propertyStart = index + 1;
      const propertyEnd = consumeProperty(propertyStart);
      if (propertyEnd < 0 || expression[propertyEnd] !== quote) {
        return false;
      }
      index = skipExpressionWhitespace(propertyEnd + 1);
      if (expression[index] !== "]") return false;
      index += 1;
    } else {
      return false;
    }
    propertyCount += 1;
  }

  return propertyCount > 0;
}

function isExplicitPlaceholderValue(value) {
  let normalized = value.trim();
  if (normalized.length >= 2 && ['"', "'", '`'].includes(normalized[0]) && normalized.at(-1) === normalized[0]) {
    normalized = normalized.slice(1, -1).trim();
  }
  return PLACEHOLDER_VALUE.test(normalized) || SYNTHETIC_PROVIDER_PLACEHOLDER.test(normalized);
}

function isExplicitPlaceholderComponent(value) {
  return /^(?:(?:example|fake|dummy|placeholder|test[-_]only)[-_](?:user|password)|replace[-_]with[-_](?:user|password))$/i.test(value);
}

function parseAssignmentStart(line) {
  const assignment = assignmentStartRule.exec(line);
  if (!assignment) return null;
  const declaration = assignment[1];
  const target = assignment[2];
  const bracketKey = target.match(/\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]\s*$/);
  const quotedKey = target.match(/^["']([A-Za-z_][A-Za-z0-9_]*)["']$/);
  const dotKey = target.match(/(?:^|\.)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/);
  const identifier = bracketKey?.[1] || quotedKey?.[1] || dotKey?.[1];
  if (!identifier || !sensitiveIdentifier.test(identifier)) return null;
  return { declaration, target, identifier, separator: assignment[3], raw: assignment[4] };
}

function extractShellParameterLiteral(value) {
  const parameter = /^\$\{[A-Za-z_][A-Za-z0-9_]*(?:(:?[-=?+])(.*))?\}$/s.exec(value);
  if (!parameter) return undefined;
  const operator = parameter[1];
  const operand = parameter[2] ?? '';
  if (!operator || operator === '?' || operator === ':?') return null;
  if (!operand || /[$`]/.test(operand)) return null;
  return operand;
}

function isBareShellAssignment(assignment) {
  return assignment.separator === '='
    && (!assignment.declaration || assignment.declaration === 'export')
    && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(assignment.target);
}

function isExactUnquotedShellVariableReference(raw, assignment) {
  return isBareShellAssignment(assignment)
    && /^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})$/.test(raw);
}

function isJavaScriptRegexMetadata(raw, assignment) {
  if (assignment.declaration || assignment.separator !== ':' || /[.[]/.test(assignment.target) || raw[0] !== '/') return false;
  let escaped = false;
  let inCharacterClass = false;
  let closingSlash = -1;
  for (let index = 1; index < raw.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (raw[index] === '\\') {
      escaped = true;
      continue;
    }
    if (raw[index] === '[' && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (raw[index] === ']' && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (raw[index] === '/' && !inCharacterClass) {
      closingSlash = index;
      break;
    }
  }
  if (closingSlash < 0) return false;
  const remainder = raw.slice(closingSlash + 1);
  const suffix = /^([dgimsuvy]*)(\s*[,;]?\s*(?:(?:\/\/.*)|(?:\/\*.*\*\/))?\s*)$/.exec(remainder);
  if (!suffix) return false;
  const flags = suffix[1];
  if (new Set(flags).size !== flags.length || (flags.includes('u') && flags.includes('v'))) return false;
  try {
    new RegExp(raw.slice(1, closingSlash), flags);
    return true;
  } catch {
    return false;
  }
}

function extractLiteralValue(raw, assignment) {
  raw = raw.trim();
  if (!raw) return null;
  if (raw[0] === '"' || raw[0] === "'" || raw[0] === '`') {
    const quote = raw[0];
    let escaped = false;
    for (let index = 1; index < raw.length; index += 1) {
      if (!escaped && raw[index] === quote) {
        const value = raw.slice(1, index);
        if (quote === '`' && value.includes('${')) return null;
        const trailing = raw.slice(index + 1);
        if (!/^\s*[,;]?\s*(?:(?:\/\/|#).*)?$/.test(trailing)) return null;
        if (quote === '"' && value.includes('${') && isBareShellAssignment(assignment)) {
          const shellLiteral = extractShellParameterLiteral(value);
          if (shellLiteral !== undefined) return shellLiteral;
          return null;
        }
        return value;
      }
      escaped = !escaped && raw[index] === '\\';
      if (raw[index] !== '\\') escaped = false;
    }
    return null;
  }
  if (isJavaScriptRegexMetadata(raw, assignment)) return null;
  if (isExactUnquotedShellVariableReference(raw, assignment)) return null;
  if (isBareShellAssignment(assignment) && raw.startsWith('${')) {
    const shellLiteral = extractShellParameterLiteral(raw);
    if (shellLiteral !== undefined) return shellLiteral;
  }
  if ((assignment.declaration && assignment.declaration !== 'export') || /^[`[{(]/.test(raw) || /^(?:new\s+)?[A-Za-z_$][A-Za-z0-9_$.]*\s*\(/.test(raw) || /(?:=>|\.join\s*\()/.test(raw)) return null;
  const value = raw.replace(/\s+#.*$/, '').replace(/[;,]\s*$/, '').trim();
  const memberAssignment = /[.[]/.test(assignment.target);
  if ((assignment.separator === ':' || memberAssignment) && /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) return null;
  return value;
}

function isCommentOnly(text) {
  return /^(?:\/\/|#|\/\*.*\*\/)\s*/.test(text.trim());
}

function extractAssignedValue(lines, startIndex) {
  const assignment = parseAssignmentStart(lines[startIndex]);
  if (!assignment) return null;
  const immediate = assignment.raw.trim();
  if (immediate && !isCommentOnly(immediate)) {
    const value = extractLiteralValue(immediate, assignment);
    return value === null ? null : { identifier: assignment.identifier, value, endIndex: startIndex };
  }

  let bytes = Buffer.byteLength(lines[startIndex], 'utf8');
  for (let offset = 1; offset < MAX_ASSIGNMENT_LINES && startIndex + offset < lines.length; offset += 1) {
    const candidate = lines[startIndex + offset];
    bytes += 1 + Buffer.byteLength(candidate, 'utf8');
    if (bytes > MAX_ASSIGNMENT_BYTES) return null;
    const trimmed = candidate.trim();
    if (!trimmed || isCommentOnly(trimmed)) continue;
    if (!['"', "'", '`'].includes(trimmed[0])) return null;
    const value = extractLiteralValue(trimmed, assignment);
    return value === null ? null : { identifier: assignment.identifier, value, endIndex: startIndex + offset };
  }
  return null;
}

function urlHasExplicitPlaceholderCredentials(matchedUrl) {
  try {
    const parsed = new URL(matchedUrl);
    return isExplicitPlaceholderComponent(decodeURIComponent(parsed.username)) && isExplicitPlaceholderComponent(decodeURIComponent(parsed.password));
  } catch {
    return false;
  }
}

function die(message) {
  process.stderr.write(`secret-scan: ${message}\n`);
  process.exit(2);
}

function git(args, encoding = 'buffer') {
  const result = spawnSync('git', args, { encoding: encoding === 'buffer' ? undefined : encoding, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) die(`Git operation failed (${args[0]}).`);
  return result.stdout;
}

function isBinary(buffer) {
  return buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function scanText(path, text, selectedLines = null) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    if (!selectedLines || selectedLines.has(lineNumber)) {
      for (const [id, pattern, remediation] of rules) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match && !(id === 'CREDENTIAL_URL' && urlHasExplicitPlaceholderCredentials(match[0]))) {
          findings.push({ path, line: lineNumber, id, remediation });
        }
      }
    }
    const assignment = extractAssignedValue(lines, index);
    const assignmentSelected = assignment && (!selectedLines || Array.from(
      { length: assignment.endIndex - index + 1 },
      (_, offset) => index + offset + 1,
    ).some((physicalLine) => selectedLines.has(physicalLine)));
    if (assignmentSelected && assignment.value.length >= 8) {
      const placeholderDatabaseUrl = assignment.identifier === 'DATABASE_URL' && urlHasExplicitPlaceholderCredentials(assignment.value);
      if (!isExplicitPlaceholderValue(assignment.value) &&
      !isExactGitHubActionsRuntimeReference(assignment.value) && !placeholderDatabaseUrl) {
        findings.push({ path, line: lineNumber, id: 'SENSITIVE_ASSIGNMENT', remediation: 'Replace the value with an explicit placeholder and store the credential outside Git.' });
      }
    }
  }
  return findings;
}

function scanBuffer(path, buffer, selectedLines = null) {
  if (buffer.length > MAX_FILE_BYTES || isBinary(buffer)) return [];
  return scanText(path, buffer.toString('utf8'), selectedLines);
}

function nulList(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function parseArgs(argv) {
  if (argv.length === 1 && ['--tracked', '--staged'].includes(argv[0])) return { mode: argv[0].slice(2) };
  if (argv.length === 2 && argv[0] === '--file' && argv[1] && !argv[1].includes('\0')) return { mode: 'file', value: argv[1] };
  if (argv.length === 2 && argv[0] === '--tree' && /^[A-Za-z0-9_./~^{}-]+$/.test(argv[1])) return { mode: 'tree', value: argv[1] };
  if (argv.length === 2 && argv[0] === '--range' && /^[A-Za-z0-9_./~^{}-]+\.\.[A-Za-z0-9_./~^{}-]+$/.test(argv[1])) return { mode: 'range', value: argv[1] };
  die('usage: --tracked | --staged | --tree <commit> | --range <base>..<head> | --file <path>');
}

function treeObjects(commit) {
  git(['rev-parse', '--verify', `${commit}^{commit}`]);
  return nulList(git(['ls-tree', '-r', '-z', '--full-tree', commit])).flatMap((entry) => {
    const separator = entry.indexOf('\t');
    const metadata = entry.slice(0, separator).split(' ');
    if (separator < 0 || metadata[1] !== 'blob') return [];
    return [{ path: entry.slice(separator + 1), object: metadata[2] }];
  });
}

function scanGitObjects(kind, value = null) {
  let objects;
  if (kind === 'tracked') {
    const hasHead = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { encoding: 'utf8' }).status === 0;
    if (!hasHead) return [];
    objects = treeObjects('HEAD');
  } else if (kind === 'tree') {
    objects = treeObjects(value);
  } else {
    objects = nulList(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z', '--']))
      .map((path) => ({ path, object: `:${path}` }));
  }
  const findings = [];
  for (const { path, object } of objects) {
    const sizeResult = spawnSync('git', ['cat-file', '-s', object], { encoding: 'utf8' });
    if (sizeResult.status !== 0) die('Git operation failed (cat-file).');
    const size = Number(sizeResult.stdout.trim());
    if (!Number.isSafeInteger(size) || size < 0) die('Git returned an invalid blob size.');
    if (size > MAX_FILE_BYTES) continue;
    findings.push(...scanBuffer(path, git(['cat-file', 'blob', object])));
  }
  return findings;
}

function addedLinesFromPatch(output) {
  const addedLines = new Set();
  let newLine = 0;
  for (const line of output.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!newLine || line.startsWith('diff --git ') || line.startsWith('--- ') || line.startsWith('+++ ')) continue;
    if (line.startsWith('+')) {
      addedLines.add(newLine);
      newLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\ No newline')) {
      newLine += 1;
    }
  }
  return addedLines;
}

function scanRange(range) {
  const [base, head] = range.split('..');
  git(['rev-parse', '--verify', `${base}^{tree}`]);
  git(['rev-parse', '--verify', `${head}^{commit}`]);

  let commits = spawnSync('git', ['rev-list', '--reverse', range], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (commits.status !== 0 && base === '4b825dc642cb6eb9a060e54bf8d69288fbee4904') {
    commits = spawnSync('git', ['rev-list', '--reverse', head], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  }
  if (commits.status !== 0) die('Git operation failed (rev-list).');

  const findings = [];
  for (const commit of commits.stdout.split('\n').filter(Boolean)) {
    const paths = nulList(git(['diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '-z', '--diff-filter=ACMR', '-M', '-C', '--find-copies-harder', '-r', commit, '--']));
    for (const path of new Set(paths)) {
      const object = `${commit}:${path}`;
      const size = Number(git(['cat-file', '-s', object], 'utf8').trim());
      if (!Number.isSafeInteger(size) || size < 0) die('Git returned an invalid blob size.');
      if (size > MAX_FILE_BYTES) continue;
      const patch = git(['diff-tree', '--root', '-m', '--no-commit-id', '--no-color', '--unified=0', '--diff-filter=ACMR', '-M', '-C', '--find-copies-harder', '-p', commit, '--', path], 'utf8');
      findings.push(...scanBuffer(path, git(['cat-file', 'blob', object]), addedLinesFromPatch(patch)));
    }
  }
  return findings;
}

const options = parseArgs(process.argv.slice(2));
let findings;
if (options.mode === 'tracked' || options.mode === 'staged' || options.mode === 'tree') findings = scanGitObjects(options.mode, options.value);
else if (options.mode === 'range') findings = scanRange(options.value);
else {
  let stat;
  try { stat = statSync(options.value); } catch { die('file cannot be read'); }
  if (!stat.isFile()) die('path is not a file');
  findings = scanBuffer(options.value, readFileSync(options.value));
}

function pathLooksCredentialBearing(path) {
  return rules.some(([, pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(path);
  });
}

function sanitizeOutputPath(path) {
  if (pathLooksCredentialBearing(path)) {
    const digest = createHash('sha256').update(path).digest('hex').slice(0, 12);
    return `[redacted-path:${digest}]`;
  }
  let output = '';
  for (const character of path) {
    const code = character.codePointAt(0);
    if (character === '\\') output += '\\\\';
    else if (character === '"') output += '\\"';
    else if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) output += `\\u${code.toString(16).padStart(4, '0')}`;
    else output += character;
  }
  return output;
}

for (const finding of findings) {
  process.stdout.write(`${sanitizeOutputPath(finding.path)}:${finding.line} [${finding.id}] ${finding.remediation}\n`);
}
process.exit(findings.length ? 1 : 0);

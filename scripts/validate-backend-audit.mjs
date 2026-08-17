#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('../apps/api/backend/', import.meta.url));
const allowlistPath = fileURLToPath(new URL('../security/npm-audit-allowlist.json', import.meta.url));

const highOrCritical = ({ severity }) => severity === 'high' || severity === 'critical';

function severeVulnerabilities(report) {
  return Object.entries(report?.vulnerabilities ?? {}).filter(([, vulnerability]) => highOrCritical(vulnerability));
}

function dependencyAtPath(tree, dependencyPath) {
  let current = tree;
  for (const expected of dependencyPath) {
    current = current?.dependencies?.[expected.name];
    if (!current || current.version !== expected.version) return null;
  }
  return current;
}

export function validateBackendAudit({ productionAudit, fullAudit, dependencyTree, allowlist, now = new Date() }) {
  if (productionAudit?.auditReportVersion !== 2 || fullAudit?.auditReportVersion !== 2) {
    throw new Error('npm audit did not return a valid audit report');
  }

  const productionSevere = severeVulnerabilities(productionAudit);
  if (productionSevere.length > 0) {
    throw new Error(`Production dependency audit contains high/critical vulnerabilities: ${productionSevere.map(([name]) => name).join(', ')}`);
  }

  if (!Array.isArray(allowlist?.exceptions) || allowlist.exceptions.length !== 1) {
    throw new Error('Audit allowlist must contain exactly one exception');
  }

  const exception = allowlist.exceptions[0];
  if (now >= new Date(exception.expiresAt)) {
    throw new Error(`Audit exception ${exception.advisory} expired at ${exception.expiresAt}`);
  }

  const fullSevere = severeVulnerabilities(fullAudit);
  if (fullSevere.length === 0) {
    throw new Error(`Audit exception ${exception.advisory} is stale; remove it because the full audit is clean`);
  }

  const actualPackages = fullSevere.map(([name]) => name).sort();
  const allowedPackages = [...exception.auditPackages].sort();
  if (JSON.stringify(actualPackages) !== JSON.stringify(allowedPackages)) {
    throw new Error(`Unexpected high/critical audit packages: ${actualPackages.join(', ')}`);
  }

  if (fullSevere.some(([, vulnerability]) => vulnerability.severity !== exception.severity)) {
    throw new Error('Critical or unexpected-severity vulnerability cannot be allowlisted');
  }

  const deepmergeVia = fullAudit.vulnerabilities['deepmerge-ts']?.via;
  const advisory = deepmergeVia?.[0];
  if (!advisory || advisory.severity !== exception.severity) {
    throw new Error(`Expected advisory ${exception.advisory} was not the sole deepmerge-ts advisory`);
  }
  if (
    deepmergeVia.length !== 1 ||
    typeof advisory !== 'object' ||
    advisory.source !== exception.source ||
    advisory.url !== exception.url
  ) {
    throw new Error(`Expected advisory ${exception.advisory} was not the sole deepmerge-ts advisory`);
  }

  const prismaVia = fullAudit.vulnerabilities.prisma?.via;
  const configVia = fullAudit.vulnerabilities['@prisma/config']?.via;
  if (JSON.stringify(prismaVia) !== JSON.stringify(['@prisma/config']) || JSON.stringify(configVia) !== JSON.stringify(['deepmerge-ts'])) {
    throw new Error('Audit dependency relationship changed from the allowlisted Prisma chain');
  }

  if (!dependencyAtPath(dependencyTree, exception.dependencyPath)) {
    const expected = exception.dependencyPath.map(({ name, version }) => `${name}@${version}`).join(' -> ');
    throw new Error(`Installed dependency path does not exactly match: ${expected}`);
  }

  return { advisory: exception.advisory, expiresAt: exception.expiresAt };
}

function runNpmJson(arguments_) {
  const result = spawnSync('npm', arguments_, { cwd: backendDirectory, encoding: 'utf8' });
  if (!result.stdout.trim()) {
    throw new Error(`npm ${arguments_.join(' ')} produced no JSON: ${result.stderr.trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`npm ${arguments_.join(' ')} returned invalid JSON`);
  }
}

export function runBackendAuditValidation() {
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  const productionAudit = runNpmJson(['audit', '--omit=dev', '--audit-level=high', '--json']);
  const fullAudit = runNpmJson(['audit', '--audit-level=high', '--json']);
  const dependencyTree = runNpmJson(['ls', 'prisma', '@prisma/config', 'deepmerge-ts', '--all', '--json']);
  const accepted = validateBackendAudit({ productionAudit, fullAudit, dependencyTree, allowlist });
  process.stdout.write(`Production audit passed; accepted only ${accepted.advisory} through ${accepted.expiresAt}.\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runBackendAuditValidation();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

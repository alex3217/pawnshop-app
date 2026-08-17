import assert from 'node:assert/strict';
import test from 'node:test';

import { validateBackendAudit } from './validate-backend-audit.mjs';

const exception = {
  advisory: 'GHSA-ggr8-5vv4-36mx',
  source: 1145093,
  url: 'https://github.com/advisories/GHSA-ggr8-5vv4-36mx',
  severity: 'high',
  expiresAt: '2026-09-17T00:00:00.000Z',
  dependencyPath: [
    { name: 'prisma', version: '6.19.3' },
    { name: '@prisma/config', version: '6.19.3' },
    { name: 'deepmerge-ts', version: '7.1.5' },
  ],
  auditPackages: ['prisma', '@prisma/config', 'deepmerge-ts'],
};

const cleanAudit = { auditReportVersion: 2, vulnerabilities: {} };
const allowedAudit = {
  auditReportVersion: 2,
  vulnerabilities: {
    prisma: { severity: 'high', via: ['@prisma/config'] },
    '@prisma/config': { severity: 'high', via: ['deepmerge-ts'] },
    'deepmerge-ts': {
      severity: 'high',
      via: [{ source: 1145093, url: exception.url, severity: 'high' }],
    },
  },
};
const dependencyTree = {
  dependencies: {
    prisma: {
      version: '6.19.3',
      dependencies: {
        '@prisma/config': {
          version: '6.19.3',
          dependencies: { 'deepmerge-ts': { version: '7.1.5' } },
        },
      },
    },
  },
};

const validInput = () => ({
  productionAudit: structuredClone(cleanAudit),
  fullAudit: structuredClone(allowedAudit),
  dependencyTree: structuredClone(dependencyTree),
  allowlist: { schemaVersion: 1, exceptions: [structuredClone(exception)] },
  now: new Date('2026-08-17T00:00:00.000Z'),
});

test('accepts only the exact development-only advisory and dependency path', () => {
  assert.deepEqual(validateBackendAudit(validInput()), {
    advisory: exception.advisory,
    expiresAt: exception.expiresAt,
  });
});

test('rejects an unrelated high vulnerability', () => {
  const input = validInput();
  input.fullAudit.vulnerabilities.other = { severity: 'high', via: [] };
  assert.throws(() => validateBackendAudit(input), /Unexpected high\/critical audit packages/);
});

test('rejects a critical vulnerability', () => {
  const input = validInput();
  input.fullAudit.vulnerabilities['deepmerge-ts'].severity = 'critical';
  assert.throws(() => validateBackendAudit(input), /Critical or unexpected-severity/);
});

test('rejects an expired exception', () => {
  const input = validInput();
  input.now = new Date(exception.expiresAt);
  assert.throws(() => validateBackendAudit(input), /expired/);
});

test('rejects a production dependency audit failure', () => {
  const input = validInput();
  input.productionAudit.vulnerabilities['production-package'] = { severity: 'high', via: [] };
  assert.throws(() => validateBackendAudit(input), /Production dependency audit/);
});

test('rejects a changed dependency path or version', () => {
  const input = validInput();
  input.dependencyTree.dependencies.prisma.dependencies['@prisma/config'].version = '6.19.4';
  assert.throws(() => validateBackendAudit(input), /Installed dependency path/);
});

test('rejects a stale exception after the advisory is fixed', () => {
  const input = validInput();
  input.fullAudit = structuredClone(cleanAudit);
  assert.throws(() => validateBackendAudit(input), /is stale/);
});

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/;

function requireFullSha(value, label, failures) {
  if (!FULL_SHA.test(String(value || ""))) {
    failures.push(`${label} must be a full lowercase 40-character Git SHA`);
    return null;
  }
  return value;
}

export function verifyProductionReleaseEvidence(evidence) {
  const failures = [];
  const expected = requireFullSha(evidence?.expectedSha, "expectedSha", failures);
  const revisions = [
    ["api.revision", evidence?.api?.revision],
    ["frontend.revision", evidence?.frontend?.revision],
    ["database.releaseSha", evidence?.database?.releaseSha],
    ["releaseRecord.releaseSha", evidence?.releaseRecord?.releaseSha],
  ];

  if (evidence?.api?.readinessPath !== "/api/ready") {
    failures.push("api.readinessPath must equal /api/ready");
  }
  if (evidence?.api?.status !== 200 || evidence?.api?.ready !== true) {
    failures.push("API readiness evidence must report HTTP 200 and ready=true");
  }

  for (const [label, value] of revisions) {
    const revision = requireFullSha(value, label, failures);
    if (expected && revision && revision !== expected) {
      failures.push(`${label} does not match expectedSha`);
    }
  }

  if (failures.length) {
    const error = new Error(`Production release verification failed:\n- ${failures.join("\n- ")}`);
    error.code = "PRODUCTION_RELEASE_VERIFICATION_FAILED";
    error.failures = failures;
    throw error;
  }

  return { verified: true, releaseSha: expected };
}

async function main() {
  const evidencePath = process.argv[2];
  if (!evidencePath || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/verify-production-release.mjs <redacted-evidence.json>");
  }
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const result = verifyProductionReleaseEvidence(evidence);
  process.stdout.write(`Production release parity verified for ${result.releaseSha}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

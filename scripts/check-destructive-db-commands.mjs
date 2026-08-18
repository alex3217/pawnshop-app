import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MFA_SERVICE = "apps/api/backend/src/services/mfa.service.js";

// These are the only production deleteMany calls permitted by static safety.
// Both delete bounded ID lists selected by cleanupExpiredMfaArtifacts; broad
// predicates and every other model or destructive operation remain forbidden.
const MFA_EPHEMERAL_DELETIONS = new Set([
  "? await tx.mfaStepUpProof.deleteMany({ where: { id: { in: proofIds } } })",
  "? await tx.mfaChallenge.deleteMany({ where: { id: { in: challengeIds } } })",
]);

export function isAllowedDestructiveDbOperation({ path, source }) {
  return path === MFA_SERVICE && MFA_EPHEMERAL_DELETIONS.has(source.trim());
}

export function findDestructiveDbViolations(matches) {
  return matches.filter((match) => !isAllowedDestructiveDbOperation(match));
}

function scanRepository() {
  const result = spawnSync("git", [
    "grep", "-n", "-E",
    "force: true|sync\\(|deleteMany|drop table|truncate table|DELETE FROM|delete from",
    "--", "apps/api/backend/src", "apps/api/backend/prisma", "scripts",
    ":(exclude)scripts/check-prod-readiness.sh",
    ":(exclude)scripts/check-static-safety.sh",
    ":(exclude)scripts/check-destructive-db-commands.mjs",
    ":(exclude)scripts/test/static-safety-destructive-db.contract.test.mjs",
    ":(exclude)**/node_modules/**",
  ], { encoding: "utf8" });
  if (result.status !== 0 && result.status !== 1) {
    process.stderr.write(result.stderr || "Unable to scan destructive database commands\n");
    process.exit(2);
  }
  const matches = String(result.stdout || "").trim().split("\n").filter(Boolean).map((line) => {
    const match = line.match(/^([^:]+):(\d+):(.*)$/);
    return match ? { path: match[1], line: Number(match[2]), source: match[3], raw: line } : { path: "", source: line, raw: line };
  });
  for (const violation of findDestructiveDbViolations(matches)) process.stdout.write(`${violation.raw}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) scanRepository();

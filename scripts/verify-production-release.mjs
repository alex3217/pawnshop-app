import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/;
const INTEGER_ID = /^[1-9][0-9]{4,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PLACEHOLDER = /^(?:unknown|pending|placeholder|todo|tbd|example|none|n\/a)$/i;

function requireFullSha(value, label, failures) {
  if (!FULL_SHA.test(String(value || ""))) { failures.push(`${label} must be a full lowercase 40-character Git SHA`); return null; }
  return value;
}

function requireIdentifier(value, label, pattern, failures) {
  const text = String(value || "");
  if (!pattern.test(text) || PLACEHOLDER.test(text)) failures.push(`${label} is missing, placeholder, or malformed`);
  return text;
}

function requireUrl(value, label, hostname, pathPattern, failures) {
  let url;
  try { url = new URL(value); } catch { failures.push(`${label} must be a valid immutable HTTPS URL`); return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== hostname || !pathPattern.test(url.pathname)) {
    failures.push(`${label} must be a valid immutable ${hostname} URL`); return null;
  }
  return url;
}

export function verifyProductionReleaseEvidence(evidence, { now = Date.now(), maxAgeMs = 86400000 } = {}) {
  const failures = [];
  const expected = requireFullSha(evidence?.expectedSha, "expectedSha", failures);
  const revisions = [
    ["api.revision", evidence?.api?.revision], ["frontend.revision", evidence?.frontend?.revision],
    ["database.releaseSha", evidence?.database?.releaseSha], ["releaseRecord.releaseSha", evidence?.releaseRecord?.releaseSha],
    ["github.commitSha", evidence?.github?.commitSha], ["cloudflare.sourceSha", evidence?.cloudflare?.sourceSha], ["render.sourceSha", evidence?.render?.sourceSha],
  ];
  if (evidence?.api?.readinessPath !== "/api/ready") failures.push("api.readinessPath must equal /api/ready");
  if (evidence?.api?.status !== 200 || evidence?.api?.ready !== true) failures.push("API readiness evidence must report HTTP 200 and ready=true");
  for (const [label, value] of revisions) {
    const revision = requireFullSha(value, label, failures);
    if (expected && revision && revision !== expected) failures.push(`${label} does not match expectedSha`);
  }
  if (evidence?.provenance?.collectionMethod !== "independent-provider-api") failures.push("provenance.collectionMethod must identify independent provider API collection; operator-authored JSON alone is not authentic evidence");
  for (const [label, value] of [
    ["provenance.collectedAt", evidence?.provenance?.collectedAt], ["github.collectedAt", evidence?.github?.collectedAt],
    ["database.collectedAt", evidence?.database?.collectedAt], ["cloudflare.collectedAt", evidence?.cloudflare?.collectedAt], ["render.collectedAt", evidence?.render?.collectedAt],
  ]) {
    const collectedAt = Date.parse(value || "");
    if (!Number.isFinite(collectedAt) || collectedAt > now + 300000 || now - collectedAt > maxAgeMs) failures.push(`${label} is missing, malformed, future-dated, or stale`);
  }
  const githubRunId = requireIdentifier(evidence?.github?.workflowRunId, "github.workflowRunId", INTEGER_ID, failures);
  const githubUrl = requireUrl(evidence?.github?.workflowRunUrl, "github.workflowRunUrl", "github.com", /^\/alex3217\/pawnshop-app\/actions\/runs\/[1-9][0-9]{4,}$/, failures);
  const databaseRunId = requireIdentifier(evidence?.database?.workflowRunId, "database.workflowRunId", INTEGER_ID, failures);
  const databaseUrl = requireUrl(evidence?.database?.workflowRunUrl, "database.workflowRunUrl", "github.com", /^\/alex3217\/pawnshop-app\/actions\/runs\/[1-9][0-9]{4,}$/, failures);
  if (githubUrl && githubUrl.pathname.split("/").at(-1) !== githubRunId) failures.push("GitHub workflow run URL and ID do not match");
  if (databaseUrl && databaseUrl.pathname.split("/").at(-1) !== databaseRunId) failures.push("Database workflow run URL and ID do not match");
  if (evidence?.providerIdentity?.githubRepository !== "alex3217/pawnshop-app") failures.push("Wrong GitHub provider/repository identity");
  if (evidence?.providerIdentity?.cloudflareProject !== "pawnloop-frontend") failures.push("Wrong Cloudflare provider/project identity");
  requireIdentifier(evidence?.providerIdentity?.cloudflareAccountId, "providerIdentity.cloudflareAccountId", /^[0-9a-f]{32}$/, failures);
  const renderService = requireIdentifier(evidence?.render?.serviceId, "render.serviceId", /^srv-[a-z0-9]+$/, failures);
  const renderEnvironment = requireIdentifier(evidence?.render?.environmentId, "render.environmentId", /^evm-[a-z0-9]+$/, failures);
  const renderDeploy = requireIdentifier(evidence?.render?.deploymentId, "render.deploymentId", /^dep-[a-z0-9]+$/, failures);
  if (evidence?.providerIdentity?.renderServiceId !== renderService || evidence?.providerIdentity?.renderEnvironmentId !== renderEnvironment) failures.push("Wrong Render provider/environment identity");
  requireUrl(evidence?.render?.deploymentUrl, "render.deploymentUrl", "dashboard.render.com", new RegExp(`/${renderDeploy}$`), failures);
  const cloudflareDeploy = requireIdentifier(evidence?.cloudflare?.deploymentId, "cloudflare.deploymentId", UUID, failures);
  requireUrl(evidence?.cloudflare?.deploymentUrl, "cloudflare.deploymentUrl", "dash.cloudflare.com", new RegExp(`/${cloudflareDeploy}$`), failures);
  requireIdentifier(evidence?.releaseRecord?.recordId, "releaseRecord.recordId", /^[a-z0-9][a-z0-9._-]{7,}$/i, failures);
  requireUrl(evidence?.releaseRecord?.recordUrl, "releaseRecord.recordUrl", "github.com", /^\/alex3217\/pawnshop-app\/(?:issues|actions\/runs)\/[1-9][0-9]*$/, failures);
  if (failures.length) { const error = new Error(`Production release verification failed:\n- ${failures.join("\n- ")}`); error.code = "PRODUCTION_RELEASE_VERIFICATION_FAILED"; error.failures = failures; throw error; }
  return { verified: true, releaseSha: expected, evidenceAuthenticity: "provider-record-references-required-not-cryptographically-proven" };
}

async function main() {
  if (!process.argv[2] || process.argv.length !== 3) throw new Error("Usage: node scripts/verify-production-release.mjs <redacted-evidence.json>");
  const result = verifyProductionReleaseEvidence(JSON.parse(await readFile(process.argv[2], "utf8")));
  process.stdout.write(`Production release evidence consistency and provider references verified for ${result.releaseSha}; authenticity still depends on independently retrieving the referenced provider records.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

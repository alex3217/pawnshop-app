# Production Release Control V1

Production releases promote a certified immutable commit; they do not promote a moving branch. `main` is the development integration branch. Staging is the release-candidate environment. A commit is eligible for production only after that exact 40-character SHA has passed staging certification and all required GitHub checks.

## Release record and required checks

Create one release record containing the release ID, candidate SHA, staging deploy ID and certification evidence, production approvers, intended API and frontend provider deploy IDs, database migration/backup evidence, last-known-good SHA, rollback compatibility review, UTC timestamps, and redacted results. The candidate and every recorded component revision must be the same full lowercase 40-character SHA; branch names, `main`, `latest`, shortened SHAs, and missing evidence fail verification. Never copy credentials, database URLs, tokens, environment files, or authorization headers into the record.

Branch protection for `main` must require these exact checks:

- `Web and API Validation`
- `Mobile TypeScript Validation`
- `Backend Automated Tests`
- `Seller Subscription Browser Tests`

The release owner must verify the checks belong to the certified SHA, not merely to a branch with the same name.

## Certification gate

1. Select a full 40-character SHA reachable from `main`; record it as immutable.
2. Deploy that exact SHA to staging and complete the paid-beta launch checklist and staging certification. Link check runs, Render deploy IDs, staging database status, `/api/ready`, and approved non-destructive workflow evidence.
3. Record a reviewed last-known-good production SHA. Confirm it remains compatible with the schema after any proposed migration. A missing last-known-good SHA or compatibility decision is a release blocker.
4. Obtain the named production approval in the GitHub `production` environment and the provider approvals recorded in the release ticket. Staging approval is not production approval.

## Production mutation sequence

Every numbered mutation below is a separate pause point. Before each provider action, stop, compare the provider target and immutable SHA with the release record, obtain/record the action-specific approval, and name the rollback action. Approval for one mutation does not authorize the next.

1. **Database migration, if required:** pause for the GitHub `production` environment approval, then manually dispatch `PawnLoop Production Database Migration` with the certified SHA, exact production database hostname, fresh backup/restore evidence reference, and exact backup confirmation. Do not invoke Prisma directly from an operator shell.
2. **Render API:** pause again. In Render, manually deploy the certified SHA. Automatic deployment from `main` must be disabled. Record the deploy ID and verify `GET /api/ready` returns 200 before continuing.
3. **Cloudflare frontend:** pause again. In Cloudflare, manually deploy the same certified SHA used by the API. Automatic Production builds from every `main` commit must be disabled. Record the deployment ID.
4. **Traffic/domain/config changes, if any:** treat each as another external production mutation with its own pause, exact target confirmation, approval, evidence, and rollback instruction.

The API and frontend release is incomplete unless provider evidence proves both use the same certified SHA. Do not infer parity from successful health checks or source branch names. `GET /api/health` is liveness only; `GET /api/ready` is the production health gate.

Export a redacted JSON evidence file and run `npm run verify:production-release -- <file>`. The verifier checks evidence consistency and requires immutable references; it does not claim that operator-authored JSON proves authenticity. Independently collect records through provider APIs and record fresh UTC collection timestamps for the provenance envelope and each GitHub, database, Cloudflare, and Render record, `collectionMethod: independent-provider-api`, the exact GitHub repository/run ID/run URL/commit, production-database workflow run ID/run URL, Cloudflare account/project/deployment ID/deployment URL/source SHA, Render service/environment/deployment IDs/deployment URL/source SHA, and immutable release-record ID/URL/SHA. Every critical SHA must match. Missing, placeholder, malformed, stale, or contradictory identifiers fail closed. Outputs remain sanitized and must never contain response bodies, credentials, tokens, or environment values.

## Verification and rollback

After each deployment, verify provider revision evidence and `/api/ready`; then perform only approved read-only smoke checks. Stop immediately on a revision mismatch, readiness failure, unknown migration state, missing evidence, or unapproved provider change.

Rollback requires the recorded last-known-good SHA, provider deploy IDs, and an explicit schema-compatibility decision. Use the provider's manual rollback/redeploy control only after the rollback approval in `docs/launch-operations/rollback-runbook.md`. Database migrations are forward-only by default; never improvise a down migration or production restore.

## Required provider configuration

Repository code enforces immutable workflow inputs, exact database targeting, twice-executed production containment, narrowly scoped secrets, immutable Action references, lifecycle-disabled dependency installation, and evidence-consistency/provenance-reference contracts. Repository changes do not configure providers. The GitHub production environment must exist before merge or integration, and an authorized operator must make and evidence the following external changes before this control can be claimed effective.

At the time of PR #314 remediation, the GitHub production environment does not exist, no required production-environment reviewer gate exists, the `main` ruleset does not require `Seller Subscription Browser Tests`, and PR #314 still needs a qualifying independent approval. Required reviewers, prevention of self-review where supported, and deployment branch/tag restrictions must be configured externally. Cloudflare automatic production builds also require direct operator verification; repository evidence must not claim that setting is complete.

No migration may run unless both executable containment checks pass: once before dependency preparation and again in the step immediately preceding `prisma migrate deploy`. Each check independently queries the exact Render service and deploy records, requires the expected Production environment, maintenance enabled, automatic deployment disabled, a well-formed live deployment matching the configured immutable source SHA, and HTTP 503 from health/readiness at both the Render and canonical origins. Missing credentials/variables/records, provider failures, malformed JSON, wrong identity/origin, healthy or writable responses, and contradictory evidence fail closed.

PR #314 implements the repository workflow, production revision validation, offline parity verifier, contract tests, and this runbook. PR #315 is independent Super Admin inventory-support work and provides no release-control dependency. PRs #317 and #318 are separate closed Super Admin work. None of those changes are duplicated here.

### Render

- Disable automatic production API deploys from `main`; require manual deployment of a selected immutable commit.
- Keep staging as the release-candidate service and production as a separate service/environment.
- Set the production health-check path to `/api/ready`.
- Ensure the API deploy UI/record exposes the exact commit SHA and restrict production deployment permission to approved operators.
- Configure the GitHub `production` environment with required reviewers, prevent self-review where supported, and restrict deployment branches/tags appropriately.
- Add non-secret environment variables `PRODUCTION_DATABASE_HOST`, `PRODUCTION_API_ORIGIN`, `PRODUCTION_RENDER_ORIGIN`, `PRODUCTION_RENDER_SERVICE_ID`, `PRODUCTION_RENDER_SERVICE_NAME`, `PRODUCTION_RENDER_ENVIRONMENT_ID`, and immutable `PRODUCTION_RENDER_SOURCE_SHA`. Add secrets `DATABASE_URL` and read-only, least-privilege `RENDER_API_KEY`. Values belong only in GitHub environment configuration and must never be committed.

### Cloudflare

- Disable automatic Production deployment for every `main` commit; require a manual production promotion/deploy of the certified SHA.
- Keep Preview/staging builds separate from Production and require production approval through the documented operator process.
- Preserve the explicit Production Vite environment contract and record the Cloudflare deployment's source SHA.
- Restrict production deployment and environment-variable changes to approved operators.

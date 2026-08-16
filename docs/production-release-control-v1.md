# Production Release Control V1

Production releases promote one certified 40-character commit, never `main`, `latest`, or another mutable name. Staging is the release-candidate environment; production remains contained until every repository and external control is independently proven.

## Repository-enforced controls

The manually dispatched production database workflow is serialized with `cancel-in-progress: false`, pins third-party Actions by commit, checks that the release SHA is on `origin/main`, installs dependencies without lifecycle scripts, scopes Render and database credentials to separate steps, and verifies containment twice. The first containment check precedes dependency preparation. The second is immediately before `prisma migrate deploy`; no mutable or untrusted step may occur between them.

Containment requires exact HTTPS allowlisted origins with no userinfo, ports, query, fragment, redirect, or alternate path. DNS results must be public. Every request has a timeout, strict content type, and 64 KiB body limit. The verifier directly retrieves the exact Render service and expected deployment, binds service name/ID, Production environment name/ID, origin, live deployment ID, source SHA, maintenance enabled, and auto-deploy disabled, and rejects conflicting active deployments. Both `/api/health` and `/api/ready` on the Render and canonical origins must return HTTP 503 with the approved bounded maintenance-body SHA-256. A generic 503 is not evidence. If Render changes the maintenance response and no stable public signature can be approved, the verifier fails closed and an operator must obtain fresh provider evidence; HTTP 503 alone never proves write containment.

Required GitHub production environment names (values never belong in the repository) are `PRODUCTION_DATABASE_HOST`, `PRODUCTION_API_ORIGIN`, `PRODUCTION_RENDER_ORIGIN`, `PRODUCTION_RENDER_SERVICE_ID`, `PRODUCTION_RENDER_SERVICE_NAME`, `PRODUCTION_RENDER_ENVIRONMENT_ID`, `PRODUCTION_RENDER_ENVIRONMENT_NAME`, `PRODUCTION_RENDER_DEPLOYMENT_ID`, `PRODUCTION_RENDER_SOURCE_SHA`, and `PRODUCTION_MAINTENANCE_BODY_SHA256`. Credential names are `DATABASE_URL` and read-only `RENDER_API_KEY`.

## Evidence retrieval and authenticity

The evidence JSON is only a set of identifiers and expected values; it is never proof. Verification must inject read-only provider clients and independently retrieve:

- the exact GitHub commit, `PawnShop Core CI` run, and `PawnLoop Production Database Migration` run using `GITHUB_TOKEN`;
- the exact Cloudflare Pages deployment using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`;
- the exact Render service and deployment using read-only `RENDER_API_KEY`.

Retrieved records are bound to `alex3217/pawnshop-app`, exact run IDs and URLs, workflow paths/names/events, successful conclusions, head SHA, run attempt, immutable database job ID, clean migration state, timestamps, Cloudflare account/project/deployment/environment/branch/URL, and Render environment/service/deployment/origin/status. URLs reject userinfo, ports, query strings, fragments, unrelated hosts, suffix attacks, and identifier mismatch. Retrieval timestamps and release-run timestamps must be fresh; stale, future, reused, or fabricated records fail closed. Provider response bodies, credentials, tokens, authorization values, and database locations must never be logged.

## Immutable release record

The release manifest is a sanitized JSON file under `docs/releases/` in the exact release commit. Evidence records `type: git-blob`, the immutable Git blob SHA, the commit-pinned GitHub URL, repository, release commit, path, and SHA-256 digest of the manifest bytes. Verification retrieves that Git blob independently through the GitHub API, verifies its object identity and digest, then binds the decoded manifest to the repository and release SHA. GitHub issues, comments, wiki pages, Actions summaries, mutable branch URLs, and editable prose are explicitly forbidden as release records.

Retain the release commit and Git blob for the lifetime of the production release plus the organization’s audit-retention period. Retain the provider run/deployment IDs and immutable database run/job identifiers for at least the same period. If an Actions artifact is additionally used, its retention must cover that period and its provider digest/attestation must be verified before relying on it.

## Migration cancellation and reconciliation

The migration step writes only sanitized start/finish markers and exposes an explicit step outcome. An `always()` postcondition classifies `migration_never_started`, `migration_succeeded_clean`, `migration_command_failed`, or `migration_state_unknown`. Only a successful command followed by a clean `prisma migrate status` is success. Cancellation after start, a missing finish marker, an interrupted status check, or contradictory outcome is unknown and fails the job. Failure and unknown/partial state require manual reconciliation of the exact GitHub run/job, provider state, and database migration status before retry; never repeat the dispatch merely because the prior run stopped.

`always()` cannot execute after hard runner loss. The next attempt must therefore reconcile durable provider and database evidence before any mutation. Concurrency prevents overlapping or duplicate dispatches but cannot prove that a lost command did not partially apply.

## Required checks and external controls

The certified SHA must pass `Web and API Validation`, `Mobile TypeScript Validation`, `Backend Automated Tests`, and `Seller Subscription Browser Tests`. Repository code does not configure providers or GitHub policy. The following remain blockers and must not be claimed complete:

- the GitHub production environment does not exist and therefore has no production-environment reviewer gate;
- the `main` ruleset does not require `Seller Subscription Browser Tests`;
- PR #314 lacks a qualifying independent approval;
- Cloudflare automatic-production configuration remains unverified and requires direct operator verification;
- Render’s production health-check path remains `/api/health`; changing it to `/api/ready` remains operator work.

Cloudflare project settings, Render settings, GitHub environments/rulesets/secrets/variables, deployment, workflow dispatch, and migration are all external operator actions. Each requires separate authority, exact target confirmation, approval, immutable evidence, and rollback planning. PR #314 does not complete any of them.

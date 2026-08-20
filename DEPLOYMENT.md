# PawnLoop Marketplace Deployment Runbook

## Legal / Brand Ownership

Product brand:

    PawnLoop Marketplace

Legal operator:

    Bealtair LLC


## Current Verified Commands

Run before deployment:

    npm run build:web
    npm run check:dev-safe
    npm run check:app-flow
    npm run check:app-flow-full
    npm run check:payment-webhook
    npm run check:prod-readiness

## PM2 Processes

Each environment currently defines exactly one API process. Authentication
rate limiting is process-local and requires that single-instance topology.
Before adding cluster workers, replicas, or multiple API hosts, implement and
validate a shared rate-limit store. See
`docs/auth-rate-limiting-v1.md` for protected endpoints, proxy assumptions,
configuration, and failure behavior.

### Dev

    npm run pm2:dev
    npm run check:deploy:dev

Dev backend:

    http://127.0.0.1:6002/api/health

### Staging

Local staging-like PM2 process:

    npm run pm2:staging
    npm run check:deploy:staging

Staging backend:

    http://127.0.0.1:6003/api/health

The canonical deployed staging service is managed in the existing Render
dashboard; this repository intentionally has no Render manifest. Configure its
non-secret HTTPS API origin as `STAGING_API_URL` in the operator shell or CI
environment. Do not put an invented or secret-bearing URL in this repository.

Before deploying, create a permission-restricted temporary environment file from
the actual Render settings and validate it only in a secure operator session.
Never print, attach, or retain that file as evidence:

    STAGING_ENV_FILE=/secure/path/staging.env npm run check:staging-readiness

The deployed contract requires `APP_ENV=staging`, `NODE_ENV=staging`,
`APP_NAME=pawnloop-api`, `TRUST_PROXY=1`, invite-only registration and auth rate
limits enabled, test-mode Stripe credentials and all seller/buyer subscription
Price IDs, both webhook signing secrets, SMTP sender/host configuration,
explicitly disabled schedulers with explicit interval/batch settings, and HTTPS
frontend/web/CORS origins. It also requires the non-secret
`STAGING_DATABASE_HOST` value to be the exact hostname from `DATABASE_URL`;
schemes, credentials, ports, paths, queries, fragments, placeholders, localhost,
and loopback hosts are rejected. Origin values must use browser `Origin` format:
scheme, hostname, and optional non-default port only, with no credentials, path,
trailing slash, query, or fragment. Render supplies `PORT` dynamically; any valid
TCP port passes deployed validation and `PAWN_PORT` is optional (but validated if
present). For the legacy local PM2 contract only, use
`STAGING_VALIDATION_MODE=local`; it permits HTTP/localhost and requires both
`PORT=6003` and `PAWN_PORT=6003`.

Render health check path:

    /api/ready

Liveness path:

    /api/health

After Render reports a successful deploy, run the read-only smoke check:

    STAGING_API_URL=https://<canonical-render-api-origin> npm run check:staging-smoke

`STAGING_API_URL` must be a credential-free HTTPS origin with no path, query, or
fragment. A single trailing slash is accepted and normalized before requests.

The smoke check calls only `GET /api/health` and `GET /api/ready`, uses bounded
timeouts, and verifies HTTP 200, the fixed non-overridable
`pawnloop-api`/`staging` identity, database
readiness, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and the
absence of `X-Powered-By`.

### Staging deployment evidence and verification

For every staging deployment, record in the launch evidence ticket:

1. The Git commit SHA selected in Render and the Render deploy ID/time. The
   public health payload does not currently expose a commit, so the Render deploy
   record is the authoritative deployed-commit evidence.
2. The readiness validation and synthetic test command names, timestamps, and
   exit codes. Capture output only after reviewing it for secrets.
3. The `staging-database` workflow `status` run URL showing `prisma migrate
   status` succeeded against the approved staging database. Do not infer
   migration state from API readiness and do not run migrations as part of a
   smoke check.
4. The post-deploy smoke command, timestamp, exit code, and Render health status.

If verification fails, stop traffic promotion. In Render, redeploy the last
known-good deploy/commit, retain the same staging environment settings, wait for
`/api/ready` to return 200, then repeat the smoke check. Database migrations are
forward-only: first determine whether the prior application is compatible with
the applied schema. Do not restore or reverse a staging database without a
separately reviewed recovery plan and backup evidence.

Secret-redaction rules: never paste `.env` files, Render secret values, database
URLs, JWT/auth/encryption secrets, SMTP credentials, Stripe keys, webhook
secrets, invite tokens, or authorization headers into logs, tickets, screenshots,
or chat. Record variable names and pass/fail state only. Redact URL userinfo and
query strings, review screenshots before attachment, and delete temporary secret
files through the approved secure process.

The GitHub `staging` environment must set the non-secret
`STAGING_DATABASE_HOST` variable to the exact Neon staging hostname and keep the
separate Neon connection URL in the existing `DATABASE_URL` secret. The database
workflow compares hostnames without printing credentials or the URL.

### Production

Production releases are manual promotions of a staging-certified immutable SHA;
they are not automatic deployments of the moving `main` branch. `main` is the
development integration branch and staging is the release-candidate environment.
The API and frontend must be deployed from the same certified SHA, with a pause
and separately recorded approval before every external production mutation.
Follow `docs/production-release-control-v1.md` for the authoritative sequence,
required GitHub checks, provider settings, rollback evidence, and last-known-good
SHA requirements. Production must never automatically deploy every `main`
commit. Repository work alone does not change Render or Cloudflare settings.

### Render pre-deploy migration command

The repository-owned Render pre-deploy command is:

    npm run render:predeploy

It delegates to the backend's exact production migration command, `prisma
migrate deploy`. The command applies already-reviewed migration files and does
not create migrations, reset a database, seed data, or use `prisma migrate dev`.
The contract is enforced by:

    npm run test:render-predeploy-contract

Adding this command and its tests does not configure Render and does not
authorize or perform a migration. Setting or changing a Render Pre-Deploy
Command is a provider change requiring separate authorization. Any execution
with a production `DATABASE_URL` is database access and a production mutation;
it must follow the containment, approval, exact-SHA, evidence, and reconciliation
requirements in `docs/production-release-control-v1.md`. Do not run the command
locally merely to verify this repository contract; run the contract test above.

Do not deploy production until production env, a fresh manifest-validated database backup, Stripe webhook, and rollback are verified. Follow `docs/production-backup-recovery-runbook-v1.md`; backup and restore commands require explicit environment, approved hostname, and database selections.

Production process startup and `check:prod-preflight` use the same backend
deployed-environment validator. Validation occurs before the HTTP server listens.
The contract requires:

- `APP_ENV=production`, `NODE_ENV=production`, `APP_NAME=pawnloop-api`, and an
  exact full lowercase 40-character Git SHA as the effective non-secret revision;
- canonical HTTPS `API_ORIGIN`, frontend/web origins, and exact HTTP/Socket.IO
  CORS allowlists;
- PostgreSQL `DATABASE_URL` whose hostname exactly matches the non-secret
  hostname-only `PRODUCTION_DATABASE_HOST`, and whose database name is not a
  local, development, test, or staging name;
- strong JWT and integration-credential encryption secrets;
- live-mode platform Stripe keys and platform webhook signing secret, plus the
  separate Connect webhook signing secret whenever `STRIPE_CONNECT_ENABLED=true`;
- complete explicit Resend or SMTP configuration;
- `TRUST_PROXY=1`, explicit invite-only/public registration mode, enabled and
  fully configured authentication rate limiting, and an explicit MFA mode;
- explicit boolean scheduler flags, interval/batch settings, readiness timeout,
  and `SCHEDULER_OWNER`.

`SCHEDULER_OWNER=disabled` requires both API scheduler flags to be false.
`api-single-instance` permits enabled jobs only while exactly one API process owns
them. `dedicated-worker` requires both API flags false. This contract does not
make multi-instance scheduling safe: multiple instances still require a dedicated
worker or a reviewed distributed lease.

Buyer subscription Price IDs are intentionally not part of this shared production
startup contract while Buyer Subscription Management V1 converges separately.
Its final deployment contract must be integrated as an independently reviewed
feature gate; do not infer subscription readiness from backend startup success.

Before deployment, record variable-name pass/fail state only, approved database
hostname, revision, Stripe mode, Connect enabled state, email provider, MFA mode,
invite mode, rate-limit enabled state, scheduler owner/flags, Render instance
count, Render deploy ID, and health/readiness results. Never record environment
values, connection strings, credentials, tokens, signing secrets, or passwords.

Production backend variable classification:

| Classification | Variables |
|---|---|
| Required in staging and production | `APP_NAME`, `APP_ENV`, `NODE_ENV`, `APP_VERSION`, `PORT`, `API_ORIGIN`, `FRONTEND_URL`, `WEB_URL`, `CORS_ORIGIN`, `CORS_ORIGINS`, `DATABASE_URL`, `JWT_SECRET`, `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_ENABLED`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `TRUST_PROXY`, `INVITE_ONLY_REGISTRATION_ENABLED`, all five `AUTH_RATE_LIMIT_*` values, `MFA_MODE`, both scheduler booleans, both scheduler interval/batch pairs, `MARKETPLACE_RESERVATION_TTL_MINUTES`, `SCHEDULER_OWNER`, and `READINESS_TIMEOUT_MS` |
| Production-only | `PRODUCTION_DATABASE_HOST`; live-mode Stripe keys |
| Staging-only | `STAGING_DATABASE_HOST`; test-mode Stripe keys; existing staging subscription Price-ID integration checks |
| Conditionally required | `STRIPE_CONNECT_WEBHOOK_SECRET` when Connect is enabled; `RESEND_API_KEY` and timeout for Resend; SMTP host/port/secure/user/password/timeouts for SMTP; `MFA_ENCRYPTION_KEY` when MFA is optional or required |
| Optional with safe defaults | request body limits, webhook body limit, JWT/token TTLs, email-action TTLs, Stripe currency, payout minimum, AI helper settings, `HOST`, `PAWN_PORT`, frontend static-serving settings; these do not bypass the deployed contract |
| Prohibited in deployed validation | unsafe validation/database escape hatches and local staging validation mode; production also rejects local/loopback hosts, non-HTTPS origins, non-live Stripe mode, and local/test/staging/development database names |

Secret values include database connection strings, JWT/auth secrets, encryption
keys, Stripe secret/signing keys, provider credentials, tokens, and passwords.
Origins, approved database hostnames, revision, modes, booleans, numeric limits,
and scheduler ownership are non-secret, but evidence should still contain only
the minimum operational metadata listed above.

    npm run pm2:prod
    npm run check:deploy:prod

Production backend:

    http://127.0.0.1:6001/api/health

## Required Pre-Deploy Checks

GitHub branch protection for `main` must require these exact checks:

- Web and API Validation
- Mobile TypeScript Validation
- Backend Automated Tests
- Seller Subscription Browser Tests

All four results must belong to the certified immutable release SHA. Production
approval and provider revision evidence remain required after CI succeeds.

    git status --short
    git log --oneline --decorate -12
    npm run check:prod-readiness

Expected:

    working tree clean
    production readiness guard passed

## Environment Files

Real env files must never be committed.

Tracked examples only:

    apps/api/backend/.env.example
    apps/web/.env.example

Required backend envs are documented in:

    apps/api/backend/.env.example

Required frontend envs are documented in:

    apps/web/.env.example

### Frontend deployment environment contract

Deployed web builds must set a complete, matching target contract. Production
uses `VITE_DEPLOY_ENV=production` with `VITE_API_ORIGIN` and `VITE_SOCKET_URL`
set to `https://api.pawnloop.com`. Preview and staging use their matching mode
with both origins set to `https://pawnshop-staging-api.onrender.com`. Every
deployed build must use `VITE_API_BASE=/api` and
`VITE_SOCKET_PATH=/socket.io`; conflicting aliases, cross-environment targets,
and malformed paths fail the build. Preview and staging builds display a visible
staging-data indicator; production does not.

There is no implicit deployment fallback. `npm --prefix apps/web run build`
requires the complete explicit contract in local shells, generic CI, Cloudflare
Pages (`CF_PAGES`), and every other build environment. Missing variables fail in
the build wrapper before TypeScript or Vite starts.

Validate a complete environment row with
`node scripts/check-deployment-environment.mjs`. Run the offline contract suite
with `node --test apps/web/test/environment-contract.test.mjs
apps/web/test/environment-contract-consumption.test.mjs
apps/web/test/environment-indicator.runtime.test.mjs
scripts/test-deployment-environment-cli.mjs`.

Cloudflare Preview and Production variables must be configured in their
respective provider environments after review. Keep the backend's exact deployed
CORS allowlist and startup validation in place; this frontend contract does not
enable wildcard preview origins or change the dedicated authenticated staging
frontend target.

## Stripe Webhook

Local API route:

    POST /api/webhooks/stripe

Stripe events needed:

    payment_intent.succeeded
    payment_intent.payment_failed
    checkout.session.completed
    customer.subscription.created
    customer.subscription.updated
    customer.subscription.deleted

Connected-account bank payout reconciliation uses a separate webhook scope:

    POST /api/webhooks/stripe/connect

Configure that endpoint for events on connected accounts and set its signing
secret as `STRIPE_CONNECT_WEBHOOK_SECRET`. Subscribe it to:

    payout.created
    payout.updated
    payout.paid
    payout.failed

Do not reuse or expose either webhook signing secret.

## Current Verified Marketplace Payment Flow

    Owner creates item
    Owner creates auction
    Buyer places bid
    Owner ends auction
    Settlement is created as PENDING
    Buyer sees settlement/win
    Stripe PaymentIntent is created
    Signed Stripe webhook is accepted
    Settlement transitions to CHARGED

## Rollback

Do not use a local checkout or a stale hard-coded commit as a production rollback.
Every release record must identify a reviewed last-known-good immutable SHA and
provider deploy IDs before the first production mutation. Follow
`docs/launch-operations/rollback-runbook.md` and
`docs/production-release-control-v1.md`; verify schema compatibility, obtain the
rollback approval, use the provider's manual rollback control, and gate recovery
on `GET /api/ready`.
### Buyer shop map browser key

Set `VITE_GOOGLE_MAPS_BROWSER_API_KEY` in the frontend build environment only. In Cloudflare Pages, add it under **Workers & Pages → pawnloop-frontend → Settings → Variables and Secrets** for both Preview and Production. For a frontend hosted on Render, add it to the frontend Web Service under **Environment** so it is present during the Vite build. Do not add it to the backend service and do not substitute the server-only `GOOGLE_GEOCODING_API_KEY`.

Restrict this browser key in Google Cloud to the **Maps JavaScript API** and these website referrers (plus the production PawnLoop origin when enabled):

- `https://staging.pawnloop-frontend.pages.dev/*`
- `https://pawnloop-staging-web-alex3217.onrender.com/*`
- `https://pawnshop-staging-web.onrender.com/*`

The item API currently exposes legacy inventory and shop coordinates, but it does not expose a configurable pickup-method collection or accept a fulfillment method on `POST /offers`. `MarketplaceListing` supports only the `pickupAvailable` and `shippingAvailable` booleans, and the legacy offer model has no selected-method field. Buyer offer pickup selection therefore requires schema fields for configured shop/listing methods and the selected offer method, corresponding item/offer API serialization and validation, and owner configuration controls. Until that contract exists, the item detail keeps the existing “Confirm pickup with the shop” guidance and does not promise or synthesize delivery methods.

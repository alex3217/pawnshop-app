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

Do not deploy production until production env, a fresh manifest-validated database backup, Stripe webhook, and rollback are verified. Follow `docs/production-backup-recovery-runbook-v1.md`; backup and restore commands require explicit environment, approved hostname, and database selections.

    npm run pm2:prod
    npm run check:deploy:prod

Production backend:

    http://127.0.0.1:6001/api/health

## Required Pre-Deploy Checks

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

Rollback code:

    git log --oneline --decorate -12
    git checkout <last-good-commit>
    npm run build:web
    npm run check:prod-readiness
    npm run pm2:prod
    npm run check:deploy:prod

Last known safe checkpoint before deployment runbook work:

    9ad86d0 Add PM2 deployment runbook config

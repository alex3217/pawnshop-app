# PawnShop App Deployment Runbook

## Current Verified Commands

Run before deployment:

    npm run build:web
    npm run check:dev-safe
    npm run check:app-flow
    npm run check:app-flow-full
    npm run check:payment-webhook
    npm run check:prod-readiness

## PM2 Processes

### Dev

    npm run pm2:dev
    npm run check:deploy:dev

Dev backend:

    http://127.0.0.1:6002/api/health

### Staging

    npm run pm2:staging
    npm run check:deploy:staging

Staging backend:

    http://127.0.0.1:6003/api/health

### Production

Do not deploy production until production env, database backup, Stripe webhook, and rollback are verified.

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

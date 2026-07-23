# PawnShop Production Deployment Checklist

## Infrastructure
- [ ] Production PostgreSQL database created
- [ ] Production API hosting created
- [ ] Production frontend hosting created
- [ ] Production Redis created, if required
- [ ] Production object storage created
- [ ] Production email provider configured

## Security and configuration
- [ ] Production DATABASE_URL configured
- [ ] Strong JWT_SECRET configured
- [ ] Stripe live keys configured
- [ ] Stripe webhook secret configured
- [ ] CORS_ORIGINS configured
- [ ] FRONTEND_URL configured
- [ ] Production admin account created
- [ ] Development accounts excluded from production

## Database
- [ ] Production migrations deployed
- [ ] Required catalogs seeded
- [ ] Initial production backup created
- [ ] Backup restore procedure tested

## Domain
- [ ] Domain connected
- [ ] API subdomain connected
- [ ] HTTPS active
- [ ] DNS verified

## Verification
- [ ] API health endpoint passes
- [ ] API readiness endpoint passes
- [ ] Registration works
- [ ] Buyer login works
- [ ] Owner registration works
- [ ] Shop onboarding works
- [ ] Item creation works
- [ ] Marketplace listing works
- [ ] Auction flow works
- [ ] Stripe test transaction works
- [ ] Stripe webhook works
- [ ] Email delivery works
- [ ] Uploads work
- [ ] Monitoring receives errors

## Launch
- [ ] Terms and Privacy pages published
- [ ] Support email active
- [ ] First shops invited
- [ ] Soft launch completed
- [ ] Public launch approved

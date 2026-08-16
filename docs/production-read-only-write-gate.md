# Production public-preview write gate

Production business writes fail closed unless `PRODUCTION_WRITES_ENABLED` is
exactly the case-sensitive string `true`. Missing, empty, malformed, or any
other value keeps production in read-only mode. `APP_ENV` is authoritative when
present; otherwise `NODE_ENV` is used. Development, test, and staging are not
gated.

Read-only responses use HTTP 503, code `PUBLIC_PREVIEW_READ_ONLY`,
`Cache-Control: no-store`, and `Retry-After: 300`. The five-minute retry value
discourages automated write retries while remaining short enough for an
operator-controlled rollout. Responses disclose no environment values.

## Exact authentication mutation allowlist

- `POST /auth/login`
- `POST /api/auth/login`
- `POST /auth/mfa/challenge`
- `POST /api/auth/mfa/challenge`
- `POST /auth/refresh`
- `POST /api/auth/refresh`

Logout is client-side token/session removal and needs no server mutation. Email
verification, password recovery, MFA enrollment, registration, and privileged
user creation are intentionally blocked because they mutate account data and
are not required to authenticate an already configured user.

## Exact provider webhook allowlist

- `POST /webhooks/stripe`
- `POST /api/webhooks/stripe`
- `POST /webhooks/stripe/connect`
- `POST /api/webhooks/stripe/connect`

These routes are mounted before the gate so their existing raw-body parsing,
required `Stripe-Signature` header, Stripe cryptographic verification, event
idempotency, and handler authorization remain intact. No webhook prefix is
allowed by the gate. `/integrations/webhooks/:id` is blocked because it is not
cryptographically verified.

`GET`, `HEAD`, and `OPTIONS` remain available, including `/api/health`,
`/api/ready`, and the public `/api/capabilities` response. Every other `POST`,
`PUT`, `PATCH`, or `DELETE` is rejected before general body parsing and routing.

Keep Render maintenance mode enabled until the deployed revision, capability
response, blocked-write matrix, allowed authentication flows, and signed
Stripe webhook probes have all passed post-deployment verification.

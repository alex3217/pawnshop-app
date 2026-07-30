# Authentication Rate Limiting V1

This control closes the public-authentication portion of the rate-limiting P0
identified in `public-launch-readiness-audit-v1.md`. It does not cover the
separate transaction-sensitive-route finding.

## Protected endpoints

Only these public `POST` endpoints, including their `/api` aliases, are covered:

- `/auth/register`
- `/auth/login`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/resend-verification`
- `/auth/verify-email`

Authenticated application routes, health/readiness routes, Stripe routes and
webhooks, other webhooks, and static assets are not affected.

Every protected endpoint has a pre-body IP limit. Registration, recovery,
delivery, verification, and reset use the lower sensitive-IP threshold. Login
uses the general IP threshold. After successful body parsing, email-based
requests pass through two distinct HMAC-SHA-256 layers: an identifier-only
limit that follows the normalized identifier across changing client IPs, then
a lower combined IP/identifier limit that contains targeted abuse without
making the identifier-only threshold an easy account-denial mechanism.
Verification and reset attempts use a token-derived HMAC layer.

Every HMAC input includes the endpoint policy and layer as domain separation.
Only the digest is stored. Passwords, raw email addresses, invite tokens,
verification tokens, and reset tokens are never rate-limit keys, logs, or
response metadata.

IPv6 addresses use the `express-rate-limit` library's `/56` subnet key
convention. This prevents trivial rotation within a typical client IPv6
allocation.

## Defaults and environment controls

Rate limiting is enabled by default and is not inferred from `NODE_ENV`.

| Variable | Default | Meaning |
|---|---:|---|
| `AUTH_RATE_LIMIT_ENABLED` | `true` | Explicitly enables or disables this control |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` | Fixed-window duration (15 minutes) |
| `AUTH_RATE_LIMIT_IP_MAX` | `30` | Login requests per client IP and window |
| `AUTH_RATE_LIMIT_SENSITIVE_IP_MAX` | `10` | Requests per client IP, endpoint, and window for the other protected endpoints |
| `AUTH_RATE_LIMIT_IDENTIFIER_MAX` | `20` | Requests per normalized email or action-token digest, endpoint, and window |
| `AUTH_RATE_LIMIT_COMBINED_MAX` | `5` | Requests per combined IP/normalized-email digest, endpoint, and window |

Boolean values must be `true`, `false`, `1`, or `0`. Numeric values must be
positive safe integers; zero, negative, fractional, NaN-like, or unsafe values
stop application creation with a clear error. When enabled, the existing
JWT/auth secret is also required as the keyed-digest secret. No new secret is
introduced. The identifier threshold must be greater than the combined
threshold.

Tune only after reviewing legitimate traffic and 429 frequency. Increase one
threshold at a time, retain a finite window, exercise the focused tests, and
record the reason and rollback value. Disabling the control is an emergency
rollback only and is not a public-production-safe steady state.

## Responses and failure policy

Requests within a limit preserve the controller's existing response contract.
Responses include `RateLimit-Limit`, `RateLimit-Remaining`,
`RateLimit-Reset`, and `RateLimit-Policy`. An exceeded limit returns HTTP 429
with `Retry-After` and a generic response that contains no account identifier.
All windows expire automatically, so this control cannot permanently lock an
account.

IP limiting occurs before JSON parsing, so malformed request bodies still
consume the applicable IP allowance. A rejected registration never reaches the
registration transaction and therefore cannot create a user or redeem an
invite.

The store failure policy is fail closed for protected authentication traffic:
HTTP 503 is returned and the controller is not called. The log entry contains
only request ID, policy/layer, and error type. It contains no subject, key,
credentials, token, or store credential.

## Proxy and deployment assumptions

`TRUST_PROXY` is explicitly `0` (no proxy) or `1` (exactly one controlled
reverse-proxy hop) and defaults to `0`. Production no longer gains implicit
proxy trust from `NODE_ENV`. Set it to `1` only after verifying that clients
cannot connect directly to the API and that the sole edge proxy overwrites the
forwarding header. Arbitrary `X-Forwarded-For` input is ignored when the value
is `0`; enabling proxy trust without that network boundary can let a client
spoof its resolved address.

Repository deployment evidence defines one PM2 process for each environment
and no active Redis/shared-store implementation. V1 therefore uses a
process-local in-memory store and is production-appropriate only while exactly
one API process/instance receives public authentication traffic. Restarting
that process resets counters. Do not add PM2 cluster workers, replicas, or
multiple API hosts until a reviewed shared store is implemented and its
failure behavior is tested. `REDIS_URL` being present does not provide
distributed enforcement.

External proxy settings, instance count, and production environment values
must still be independently verified before launch; this document does not
claim that configuration is complete.

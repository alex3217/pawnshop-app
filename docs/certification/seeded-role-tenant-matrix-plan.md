# Seeded Role and Tenant Matrix Certification

## Objective

Prove authentication, role authorization, resource ownership, staff
permissions, and tenant isolation against a disposable PostgreSQL database
using persisted actors and real HTTP routes.

## Safety

- Require the disposable-database safety guard before seed or cleanup.
- Never contact staging or production.
- Do not expose passwords, JWTs, cookies, database URLs, or private IDs.
- Do not rename or modify existing migrations.
- Do not add certification-only production endpoints unless no existing route
  can prove a required boundary.

## Deterministic actors

- Buyer A
- Buyer B
- Disabled Buyer
- Approved Owner A and Shop A
- Approved Owner B and Shop B
- Pending Owner
- Active Staff A assigned only to Shop A
- Inactive Staff assigned to Shop A
- Administrator
- Super Administrator

## Required resources

- Buyer A-owned resource
- Buyer B-owned resource
- Shop A-scoped resource
- Shop B-scoped resource
- Active Shop A staff membership with an assigned permission
- Inactive Shop A staff membership

## Required HTTP matrix

| Scenario | Expected |
|---|---|
| Buyer A accesses Buyer A resource | Allowed |
| Buyer A accesses Buyer B resource | Denied |
| Buyer B accesses Buyer A resource | Denied |
| Owner A accesses Shop A | Allowed |
| Owner A accesses Shop B | Denied |
| Owner B accesses Shop B | Allowed |
| Owner B accesses Shop A | Denied |
| Active Staff A uses assigned Shop A permission | Allowed |
| Active Staff A accesses Shop B | Denied |
| Inactive staff accesses Shop A | Denied |
| Disabled user authenticates or accesses protected route | Denied |
| Pending owner accesses owner business route | Denied |
| Administrator accesses supported admin route | Allowed |
| Super Administrator accesses supported platform route | Allowed |

## Implementation

- Add an idempotent, disposable-only certification seed.
- Use persisted database actors and resources.
- Exercise real authentication and authorization middleware through HTTP.
- Add `npm run test:role-tenant-certification`.
- Run tests serially.
- Assert status codes and stable error codes where available.
- Add redacted results to:
  `docs/certification/role-tenant-certification-results.md`.
- Inspect Playwright and document whether browser role-routing certification is
  executable or blocked.

## Regression gates

- Focused role-and-tenant certification
- Complete integration suite
- Backend core suite
- Database safety suite
- Migration-prefix audit
- `git diff --check`

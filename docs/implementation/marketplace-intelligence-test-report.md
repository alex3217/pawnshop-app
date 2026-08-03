# Marketplace Intelligence V1 test report

Validation date: 2026-08-01.

## Results

| Validation | Result | Exact outcome |
|---|---|---|
| New intelligence tests | Pass | 10 tests passed, 0 failed (`marketplaceIntelligence.service.test.js`) |
| Intelligence + relevant regressions | Pass | 55 tests passed, 0 failed: intelligence math/filtering/privacy/completed sales, local price comparison, Owner Growth, Marketing/Customer Engagement, buyer entitlements and buyer subscription lifecycle |
| HTTP contract/admin authorization | Pass | 32 tests passed, 0 failed after adding new endpoint checks; unauthenticated=401 and consumer=403 |
| Backend core suite | Pass | 200 tests passed, 0 failed; includes Prisma generate, routes/controllers, payment, Stripe, finance, authorization and core regressions |
| Frontend production build | Pass | TypeScript project build and Vite production bundle completed successfully; 281 modules transformed |
| Frontend lint | Pass | `eslint .` exited 0 with no findings |
| Prisma validate | Pass | `prisma/schema.prisma` is valid |
| Prisma generate | Pass | Prisma Client v6.19.3 generated during backend core suite |
| Prisma format | Not run | Schema did not change; formatting it was unnecessary and could create unrelated churn |
| Migrations | Not run | No schema/migration exists for V1 and applying migrations was prohibited |
| `git diff --check` | Pass | Exited 0 with no whitespace errors |

## Coverage added

- Mean, odd/even median and integer-cent rounding.
- Percent change, category/region/comparable normalization and bounded date windows.
- Central sample thresholds and confidence levels.
- Price-position boundaries and demand scoring.
- Comparable eligibility, category/title mismatch, deleted and inactive exclusion.
- Completed transaction source, status filtering and duplicate transaction-id prevention.
- Public projection allowlist and absence of seller/buyer private identity.
- Versioned Platform Health component maximums, score bounds and disclaimer.
- New Super Admin endpoint unauthenticated and wrong-role authorization.

## Existing regression coverage run

- Existing item local-price comparison: pass.
- Owner Growth and centralized seller entitlement: pass.
- Marketing Assets and Customer Engagement: pass.
- Buyer entitlement/core-commerce preservation: pass.
- Buyer subscription lifecycle: pass.
- Full configured backend core suite: pass.

## Environment note

The first combined contract run inside the restricted sandbox reported 29 failures because Supertest could not bind `0.0.0.0` (`listen EPERM`); the 57 non-listening tests passed in that run. This was an execution-environment restriction, not an assertion failure. The contract suite was rerun with permission to bind a temporary local test port and passed, and the later full core suite passed under the same permission.

## Not run

- Database integration suite: it applies migrations to a designated test database, conflicting with the instruction not to apply migrations.
- Browser end-to-end suite: not required by the repository V1 prompt and depends on running services/fixtures.
- Live production-data sampling: no database mutation or production inspection was performed.

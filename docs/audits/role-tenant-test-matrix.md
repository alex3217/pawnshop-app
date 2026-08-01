# Role and Tenant Test Matrix

## Decision: PARTIAL

The approved local-socket `npm run test:core` run passed 200/200. It includes real Express contract requests and mocked persistence/service boundaries, but not the specification's fully seeded, database-backed identity matrix.

| Actor/scenario | Status | Evidence |
|---|---|---|
| Public -> protected buyer/owner/admin routes | PASS | 401 contracts in core suite |
| Buyer -> owner-only route | PASS | 403 contract |
| Owner A -> Owner B shop | PASS | shop-access and onboarding denial tests |
| Staff A -> Shop B | PASS | cross-shop membership denial unit test |
| Staff lacking permission -> mutation | PASS | granular permission denial |
| Inactive staff membership | PASS | inactive membership grants no access |
| Deleted shop | PASS | 404 contract tests |
| Admin compatibility | PARTIAL | route and service contract coverage; no seeded full browser run |
| Super Admin compatibility | PARTIAL | platform access/401/403 contracts; no seeded full browser run |
| Disabled user/token invalidation | PARTIAL | code/test coverage exists outside the 200-test core selection; database-backed execution not certified |
| Owner approval enforcement | PASS (contract) | middleware failure/route launch contract tests |
| Buyer A -> Buyer B records | BLOCKED | required authenticated database-backed HTTP matrix not safely runnable |

## Missing certification fixture

Public visitor, Buyer A/B, owner applicant, approved Owner A/B, Staff A/B, Admin, and Super Admin must be seeded in a disposable database. Every critical read and mutation must capture the actual HTTP status/body for own-user, cross-user, own-shop, cross-shop, inactive membership, disabled user, deleted shop, owner-pending, admin, and Super Admin cases. Until then, role isolation is not launch-certified.


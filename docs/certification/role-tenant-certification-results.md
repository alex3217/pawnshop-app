# Role and Tenant Certification Results

Certification date: 2026-08-01 (America/Chicago)  
Overall result: **BLOCKED**

The required database-backed HTTP/browser matrix could not be executed because the configured test database failed the repository safety assertion. No role fixtures were seeded.

| Required proof | Result | Basis |
|---|---|---|
| Buyer A own-user access | BLOCKED | No seeded disposable database |
| Buyer A to Buyer B denial | BLOCKED | No seeded disposable database |
| Owner A own-shop access | BLOCKED | No seeded disposable database |
| Owner A to Owner B shop denial | BLOCKED | No seeded disposable database |
| Staff A own-shop access | BLOCKED | No seeded disposable database |
| Staff A to Shop B denial | BLOCKED | No seeded disposable database |
| Inactive membership denial | BLOCKED | No seeded HTTP/browser actor |
| Disabled-user denial | BLOCKED | No seeded HTTP/browser actor |
| Pending-owner denial | BLOCKED | No seeded HTTP/browser actor |
| Admin compatibility | BLOCKED | No seeded HTTP/browser actor |
| Super Admin compatibility | BLOCKED | No seeded HTTP/browser actor |

Supporting non-certification evidence: `npm --prefix apps/api/backend run test:core` passed 200/200. It includes mocked/unit/contract coverage for own/cross-shop access, inactive membership, buyer ownership, owner approval, Admin, and Super Admin behavior. This does not replace authenticated requests against seeded, persisted actors and tenants.

Certification requires retained request/response evidence for Buyer A/B, Owner A/B, Staff A/B, Admin, and Super Admin on an accepted disposable database.

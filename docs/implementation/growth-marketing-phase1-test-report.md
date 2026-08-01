# Growth Marketing Phase 1 Test Report

Date: 2026-08-01

No migration was applied and no database was reset.

## Added tests

`apps/api/backend/test/shopMarketing.controller.test.js` covers:

- Marketing permissions are assignable.
- Unknown/external destination input is rejected.
- Owner cross-shop update isolation.
- Staff read permission and cross-shop isolation.
- Specific-item ownership and public availability validation.
- Internal-only public redirect behavior.
- Disabled campaign and inactive shop handling.
- Privacy-conscious scan fields and absence of stored IP data.

## Validation outcomes

- `npx prisma format`: passed; schema formatted.
- `npx prisma validate`: passed; “The schema at prisma/schema.prisma is valid”.
- `npx prisma generate`: passed; Prisma Client 6.19.3 generated.
- `node --test --test-concurrency=1 test/growthCenter.controller.test.js test/shopMarketing.controller.test.js`: passed, 14 tests, 0 failed.
- `npm run test:core` inside the restricted sandbox: failed because Supertest could not bind a local port (`listen EPERM: operation not permitted 0.0.0.0`); this was an execution-environment restriction, not an assertion failure.
- `npm run test:core` with approved local-port access: passed, 199 tests, 0 failed.
- `npm run build` in `apps/web`: passed; TypeScript project build and Vite production build completed.
- `npm run lint` in `apps/web`: passed with no findings.

Final formatting, targeted tests, frontend checks, `git diff --check`, and status are recorded in the completion response after the final validation run.

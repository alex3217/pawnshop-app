# Marketing Assets & Customer Engagement V1 — Test Report

Validation date: 2026-08-01. No migration was applied.

| Validation | Outcome |
|---|---|
| `npm install pdf-lib@^1.17.1` (backend) | Pass after approved network access; 5 packages added, 264 audited, 0 vulnerabilities. Lockfile updated. |
| `npx prisma format` | Pass; schema formatted. |
| `npx prisma validate` | Pass; schema valid. |
| `npm run prisma:generate` | Pass; Prisma Client 6.19.3 generated. |
| Backend app module import | Pass; `app-import-ok`. |
| Targeted marketing/customer suite | Pass: 7/7. Covers centralized template plans, correct internal destinations, follow idempotency/default-off consent/pause/unfollow/inactive shops, referral self/duplicate behavior, shop authorization, public-item validation contract, PDF headers/filename path, aggregate privacy, SUPER_ADMIN authorization, and audited disable contract. |
| Existing Marketing Center + Owner Growth + buyer entitlement + seller entitlement + shop access with targeted suite | Pass: 50/50. The pre-existing specific-item campaign test was repaired to mock its existing entitlement dependencies explicitly. |
| Backend core suite, first sandbox run | Environment-blocked: local Supertest listeners received `listen EPERM`; failures were infrastructure-related, not assertion failures. |
| Backend core suite, approved local-port rerun | Pass: 199/199. |
| Frontend build | Pass; TypeScript project build and Vite production bundle completed. |
| Frontend lint | Pass; ESLint returned zero errors. |
| `git diff --check` | Pass; no whitespace errors. |

Integration tests that deploy migrations were not run because the request explicitly prohibits applying migrations. No database reset, migration deploy/dev command, live message send, or browser E2E against a mutated database was performed.

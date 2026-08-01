Work in the PawnLoop repository.

Read:

docs/product/pawnloop-growth-marketing-gap-audit-v1.md

The repository already contains:

apps/api/backend/prisma/migrations/20260730010000_master_pawnshop_growth_center_v1/

Do not build a second Growth Center.

Your assignment is to audit the existing implementation against the
specification and then complete only the safe, clearly missing Phase 1
foundation.

Start by inspecting:

1. The migration named master_pawnshop_growth_center_v1
2. Prisma models and enums introduced by that migration
3. Related backend controllers, services, routes, middleware, validators,
   and tests
4. Super Admin Growth Center pages, services, routes, navigation, and UI
5. Existing Shop public storefront routes and slug handling
6. Existing QR, referral, campaign, analytics, and marketing code
7. Owner navigation and owner staff permissions
8. Existing audit logging
9. Existing notification consent and saved-search functionality

Create this report before changing application behavior:

docs/implementation/growth-marketing-existing-state-audit.md

The report must contain a requirement matrix with:

- Requirement
- Existing implementation
- Relevant files
- Complete
- Partial
- Missing
- Defect or risk
- Recommended action

After the audit, implement only missing Phase 1 items that can be safely
completed without creating duplicate architecture.

Priority order:

1. Fix broken or unreachable existing Growth Center navigation/routes.
2. Complete Super Admin authorization and prospect tenant/privacy safety.
3. Complete missing prospect activity, pipeline, or follow-up operations.
4. Add Owner Marketing Center foundation if it does not exist.
5. Add stable shop-specific QR redirects.
6. Ensure default QR codes lead directly to the correct shop storefront.
7. Add safe campaign CRUD and activation controls.
8. Add SVG QR output.
9. Add PNG output only if safely supported by existing dependencies.
10. Add basic privacy-conscious scan analytics.
11. Add owner and Super Admin pages using existing design patterns.
12. Add permission and cross-shop isolation tests.
13. Add public redirect security tests.
14. Document remaining Phase 2–4 work.

Rules:

- Reuse existing models, enums, services, and routes.
- Do not reset any database.
- Do not apply migrations to staging or production.
- Do not commit or push.
- Do not modify environment files.
- Do not include secrets.
- Do not remove existing functionality.
- Do not create open redirects.
- Do not expose prospect data publicly.
- Do not let one shop access another shop's campaigns or analytics.
- Do not claim tests passed unless they were actually run.
- Avoid unrelated refactors.
- Preserve Node ESM and existing project conventions.

Required validation where applicable:

- Prisma format
- Prisma validate
- Prisma generate
- Backend targeted tests
- Authorization tests
- Cross-shop isolation tests
- Public redirect tests
- Frontend TypeScript
- Frontend build
- Frontend lint
- git diff --check

Create:

docs/implementation/growth-marketing-phase1-summary.md
docs/implementation/growth-marketing-phase1-test-report.md

At completion report:

1. What already existed
2. What was incomplete
3. What you changed
4. Models and migrations affected
5. APIs affected
6. Frontend pages and routes affected
7. Authorization behavior
8. Tests added
9. Exact command outcomes
10. Remaining work
11. Risks and manual steps
12. git status
13. Suggested commit message

Do not commit or push.

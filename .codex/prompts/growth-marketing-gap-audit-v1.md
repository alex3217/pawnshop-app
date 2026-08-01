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

ADDITIONAL REQUIRED AUDIT AND IMPLEMENTATION SCOPE

Read the newly added section:

"Owner Marketing Center, Business Growth, and Seller Plan Entitlements"

in:

docs/product/pawnloop-growth-marketing-gap-audit-v1.md

Audit the current seller-plan implementation before changing plan names,
prices, limits, commissions, Stripe identifiers, or subscription behavior.

Determine:

1. Current internal plan codes
2. Current customer-facing plan names
3. Current Stripe product and price mapping
4. Current listing, location, and staff limits
5. Current commission rates
6. Current feature gates
7. Current Super Admin seller-plan controls
8. Current Owner subscription and usage displays
9. Current subscription webhook dependencies
10. Risks of renaming PREMIUM to PLUS

Use the safest compatibility approach.

Prefer preserving PREMIUM as an internal billing code and displaying Plus
to customers unless a complete internal rename is proven safe and covered
by migration, compatibility handling, and tests.

Add the following to the existing-state audit matrix:

- Marketing Center owner navigation
- Business Growth owner navigation
- Seller plan display names
- Central entitlement architecture
- Free entitlements
- Pro entitlements
- Plus entitlements
- Ultra entitlements
- Backend feature enforcement
- Owner plan-usage reporting
- Upgrade prompts
- Automatic marketing setup
- Marketing setup checklist
- Stripe backward compatibility
- Existing subscriber protection

Phase 1 should establish safe architecture and navigation.

Do not attempt every advanced Plus and Ultra feature in one change.
Mark unimplemented advanced tools accurately in the roadmap.

Do not change live Stripe pricing or production configuration.

BUYER EXPERIENCE AND PLAN ENTITLEMENT SCOPE

Read the complete section:

"Buyer Experience Platform and Buyer Plan Entitlements"

inside:

docs/product/pawnloop-growth-marketing-gap-audit-v1.md

Before modifying buyer behavior, audit all current buyer functionality.

At minimum inspect:

1. Buyer routes and navigation
2. Buyer Dashboard and Buyer Workspace
3. Marketplace search and filters
4. Watchlist
5. Saved searches
6. Favorite shops
7. Offers
8. Auctions and bidding
9. Orders and fulfillment
10. Messages
11. Reviews
12. Buyer item submissions
13. Sell and pawn workflows
14. Price comparison
15. Alerts and notifications
16. Buyer subscriptions
17. Buyer plan configuration
18. Super Admin buyer-plan controls
19. Stripe buyer subscription products and prices
20. Buyer plan webhook processing
21. Referral functionality
22. Loyalty or credits
23. AI buyer functionality
24. Collection or wish-list functionality
25. Existing role and authorization architecture

Add a buyer requirement matrix to:

docs/implementation/growth-marketing-existing-state-audit.md

The matrix must include:

- Requirement
- Existing implementation
- Relevant files
- Complete
- Partial
- Missing
- Defect or risk
- Recommended action
- Recommended plan entitlement

Do not duplicate existing features.

BUYER PHASE 1 PRIORITIES

Implement only safely missing Phase 1 foundations:

1. Centralized buyer entitlement configuration
2. Safe plan display-name compatibility
3. Backend buyer entitlement enforcement
4. Buyer subscription usage API
5. Buyer subscription usage UI
6. Buyer navigation cleanup
7. Buyer Workspace foundation
8. Buyer Success Center foundation
9. Wish Lists foundation only if no suitable system exists
10. Follow Shop completion only if incomplete
11. Smart alert completion only if incomplete
12. Plan-aware saved-search limits
13. Plan-aware wish-list limits
14. Plan-aware comparison limits where applicable
15. Clear upgrade messages
16. Tests for Free, Pro, Plus, and Ultra entitlements
17. Tests proving Free users retain core commerce
18. Tests proving frontend gating is not the only enforcement
19. Tests for cross-user data isolation
20. Documentation of all deferred Phase 2–4 capabilities

PLAN SAFETY

Audit existing internal buyer plan codes before changing names.

Do not:

- Delete existing plan records
- Rename stored plan codes without compatibility handling
- Change live Stripe product IDs
- Change live Stripe price IDs
- Change production prices
- Cancel subscriptions
- Downgrade existing buyers
- break webhook processing
- create a second buyer-plan system
- implement scattered frontend-only checks
- block core purchasing for Free users

Prefer a display-name mapping if an internal code is already established.

CENTRAL ENTITLEMENTS

Use or extend one central backend source of truth.

The design should support:

- Saved-search limit
- Wish-list limit
- Favorites limit
- Comparison limit
- Alert level
- Notification priority
- AI access and monthly usage
- Price history
- Advanced search
- Workspace access
- Workspace customization
- Collection Manager
- Collection-item limit
- Market intelligence
- Concierge access
- Loyalty
- Referral rewards
- Early inventory alerts
- Exclusive deal level
- Support level

Do not implement every advanced feature merely because an entitlement
key exists.

The entitlement architecture may describe future capabilities while
accurately marking them unavailable until implemented.

BUYER WORKSPACE

Reuse existing buyer dashboard/workspace pages where present.

Do not create another dashboard if an existing Buyer Workspace can be
extended.

Phase 1 should provide a coherent foundation containing relevant
existing widgets and clean loading, empty, error, populated, and
unauthorized states.

BUYER SUCCESS CENTER

Create or extend a guided buyer-success experience covering existing,
real actions only.

Potential Phase 1 actions:

- Complete profile
- Verify account
- Follow shop
- Save search
- Create wish list
- Enable alert
- Add address
- Add payment method
- Complete first eligible purchase
- Leave eligible review

Do not display completion for unsupported actions.

VALIDATION

Add or update tests for:

- Free core marketplace access
- Free saved-search limits
- Pro saved-search access
- Plus collection entitlement
- Ultra concierge entitlement representation
- Buyer entitlement API
- Buyer usage API
- Cross-user isolation
- Wish-list ownership
- Upgrade messaging
- Existing subscription compatibility
- Existing checkout and offer behavior
- Existing auctions and order tracking

Run:

- Prisma format, validate, and generate if schema changes
- Targeted backend tests
- Core backend tests
- Frontend TypeScript build
- Frontend production build
- Frontend lint
- git diff --check

Do not commit or push.

Update:

docs/implementation/growth-marketing-phase1-summary.md
docs/implementation/growth-marketing-phase1-test-report.md

Also create:

docs/implementation/buyer-experience-plan-audit.md
docs/implementation/buyer-experience-phase1-summary.md
docs/implementation/buyer-experience-phase1-test-report.md

At completion, report:

1. Existing buyer features reused
2. Existing buyer plan structure
3. Compatibility decisions
4. Files changed
5. Models and migrations
6. API changes
7. Frontend pages and routes
8. Entitlement behavior
9. Tests and exact outcomes
10. Deferred Buyer Phase 2–4 work
11. Risks
12. Git status
13. Suggested commit message

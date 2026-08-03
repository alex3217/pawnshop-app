Work in the PawnLoop repository on:

feature/marketing-assets-customer-engagement-v1

Read:

docs/product/marketing-assets-customer-engagement-v1.md

Existing committed foundations include:

- Owner Marketing Center
- Stable shop-specific QR campaigns
- QR SVG and PNG downloads
- Shop slug storefront URLs
- Marketing scan analytics
- Owner Business Growth
- Seller entitlement service
- Buyer entitlement service
- Buyer Workspace
- Super Admin Platform Success

Do not create duplicate systems.

PHASE OBJECTIVE

Implement the safest complete V1 foundation for:

1. Printable Marketing Kit
2. Follow Shop
3. Shop-level alert preferences
4. Customer Growth dashboard
5. Referral attribution foundation
6. Super Admin Marketing Administration

AUDIT FIRST

Inspect:

- Prisma schema
- Existing watchlist/favorites/follow functionality
- Notification model and delivery services
- Email and SMS consent architecture
- Saved searches
- Shop storefront
- Shop Marketing campaigns
- QR redirects and analytics
- Existing referral fields or services
- Existing PDF or document generation dependencies
- Existing upload/file storage
- Seller entitlement service
- Buyer entitlement service
- Shop access permissions
- Super Admin audit logging
- Public item visibility
- Frontend Marketing Center
- Buyer Workspace
- Platform Success

Create:

docs/implementation/marketing-assets-customer-engagement-audit.md

Include:

- Requirement
- Existing implementation
- Relevant files
- Complete
- Partial
- Missing
- Risk
- Implementation decision

IMPLEMENTATION PRIORITIES

A. PRINTABLE ASSET SERVICE

Implement a secure reusable service for generating print-ready assets.

Required V1 templates:

- STOREFRONT_POSTER
- WINDOW_24_7_POSTER
- COUNTER_SIGN
- RECEIPT_INSERT
- PRODUCT_DISPLAY_CARD
- NEW_ARRIVALS_FLYER
- AUCTION_FLYER
- SELL_OR_PAWN_FLYER
- REVIEW_REQUEST_CARD
- REFERRAL_CARD

Start with templates that can be safely backed by existing data.

Use an existing maintained PDF dependency when available.

If adding a dependency:

- Use a maintained package
- Keep dependency scope minimal
- Update lockfile
- Do not use browser automation merely to render a PDF unless the project
  already uses it safely

Do not allow arbitrary HTML templates.

B. ASSET AUTHORIZATION

Use existing shop authorization.

Add explicit permission only if necessary, such as:

- marketing-assets:read
- marketing-assets:write

Owners retain access.

Staff access must be explicit and shop-scoped.

C. MARKETING ASSET API

Implement APIs for:

- List templates available to the shop and plan
- Preview or metadata
- Download PDF
- Generate product display card
- Record safe download metadata if justified

All outputs must use safe internal data.

D. FOLLOW SHOP

Audit for existing favorite-shop support.

Reuse it if semantically suitable.

Otherwise add the smallest safe Prisma model and nondestructive migration.

Implement:

- Follow shop
- Unfollow shop
- Follow status
- Followed shops list
- Preference updates
- Pause/resume

Follow must be idempotent.

E. ALERT PREFERENCES

Support:

- New arrivals
- Deals
- Auctions
- General shop announcements

Default marketing preferences must not be silently enabled without
explicit user action.

Preserve transactional notifications.

Use in-app notification delivery first unless channel-specific consent
and unsubscribe are already fully supported.

F. EVENT INTEGRATION

Safely connect real events where architecture permits:

- New public item
- Price drop
- Public auction
- Approved shop announcement

Prevent duplicate sends.

If full event delivery is too large for V1, implement the preference and
event foundation accurately and document unavailable delivery behavior.

G. CUSTOMER GROWTH

Implement a shop-scoped aggregate service and owner UI.

Use aggregate counts only.

Include:

- Followers
- Alert preferences
- QR scans
- Campaigns
- Messages/offers where authoritative
- Referral visits/conversions where implemented
- Deterministic recommendations

H. REFERRALS

Audit existing referral identifiers first.

Implement only a safe auditable attribution foundation.

Do not issue rewards.

Support:

- Stable code
- Internal link
- Attribution event
- Self-referral prevention
- Duplicate-conversion protection
- Owner aggregate dashboard
- Super Admin aggregate dashboard

I. SUPER ADMIN MARKETING ADMINISTRATION

Add:

- /super-admin/marketing-administration

Include:

- Marketing adoption
- Campaign search/filter
- Template availability
- Follower aggregates
- Referral aggregates
- Shops without setup
- Campaign disable control

Campaign disabling must:

- Require SUPER_ADMIN
- Be audited
- Preserve owner data
- Record reason
- Avoid arbitrary destination modification

J. PLAN ENTITLEMENTS

Use existing seller and buyer entitlement services.

Do not create scattered plan-code checks.

Do not change:

- Stored plan codes
- Stripe identifiers
- Configured prices

K. FRONTEND

Owner:

- Expand Marketing Center or add focused subroutes
- Printable Materials
- Customer Growth
- Referrals

Buyer:

- Follow button on public shop
- Alert preferences
- Followed shops in Buyer Workspace

Super Admin:

- Marketing Administration

Required states:

- Loading
- Empty
- Error
- Populated
- Unauthorized
- Plan-limited
- No-shop

L. TESTS

Add targeted coverage for:

- Asset authorization
- Cross-shop isolation
- Product card public-item validation
- PDF headers and filename
- Seller plan template access
- Follow idempotency
- Follow ownership
- Inactive-shop rejection
- Preference consent
- Unfollow/pause
- Aggregate privacy
- Referral self-attribution
- Referral duplicate conversion
- Super Admin authorization
- Audited campaign disabling
- Existing Marketing Center regression
- Owner Growth regression
- Buyer entitlement regression

VALIDATION

Run:

- Prisma format, validate, generate if schema changes
- Targeted marketing asset tests
- Follow/preferences tests
- Referral tests
- Super Admin marketing tests
- Existing Marketing Center tests
- Existing Owner Growth tests
- Existing Buyer entitlement tests
- Backend core suite
- Frontend build
- Frontend lint
- git diff --check

Do not:

- Commit or push
- Apply migrations
- Reset databases
- Change Stripe values
- Change live prices
- Modify environment files
- Send real bulk messages
- Issue referral money or credits
- Create arbitrary external redirects
- Expose buyer contact information to owners

DOCUMENTATION

Create:

docs/implementation/marketing-assets-customer-engagement-summary.md
docs/implementation/marketing-assets-customer-engagement-test-report.md

Update existing phase summaries where appropriate.

FINAL REPORT

Report:

1. Architecture reused
2. Audit findings
3. Files modified
4. Files added
5. Models and migration
6. APIs
7. Frontend routes
8. Printable templates delivered
9. Follow Shop behavior
10. Alert behavior
11. Referral behavior
12. Super Admin controls
13. Authorization and privacy
14. Tests
15. Exact validation outcomes
16. Deferred features
17. Risks
18. Git status
19. Suggested commit message

Do not commit or push.

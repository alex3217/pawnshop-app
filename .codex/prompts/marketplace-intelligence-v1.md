Work in the PawnLoop repository on:

feature/marketplace-intelligence-v1

Read:

docs/product/marketplace-intelligence-v1.md

Existing committed foundations include:

- Marketplace listings and transactions
- Auctions and offers
- Buyer Workspace
- Saved searches and watchlist
- Owner Business Growth
- Shop Health
- Marketing Center
- Customer Engagement
- Seller and buyer entitlements
- Super Admin Platform Success
- Marketing Administration

Do not create duplicate systems.

OBJECTIVE

Implement the safest complete Marketplace Intelligence V1 foundation:

1. Buyer listing intelligence
2. Similar listings and comparable completed sales
3. Price-history audit and honest unavailable behavior
4. Owner inventory and demand intelligence
5. Category performance
6. Super Admin Marketplace Intelligence
7. Deterministic Platform Health Score
8. Future AI extension points

AUDIT FIRST

Inspect:

- Prisma schema
- Item and marketplace-listing models
- MarketplaceTransaction and payment states
- Settlement and payout models
- Listing visibility and status rules
- Auction models
- Offer models
- Saved searches
- Watchlists
- Existing local price comparison
- Search tracking
- Listing views or analytics
- Buyer item submissions
- Shop location fields
- Business Growth service
- Platform Success service
- Seller entitlement service
- Buyer entitlement service
- Admin navigation and dashboards
- Existing tests and fixtures

Create:

docs/implementation/marketplace-intelligence-audit.md

Include:

- Requirement
- Existing source
- Relevant files
- Complete
- Partial
- Missing
- Data risk
- Privacy risk
- Implementation decision

RULES

- Use deterministic analytics only.
- Do not add generative AI calls.
- Do not invent search history, views, price history, or completed sales.
- Use integer cents for monetary calculations.
- Prevent duplicate transaction counting.
- Return sample size, confidence, freshness, and limitations.
- Keep owner intelligence shop-scoped.
- Keep Super Admin intelligence server-authorized.
- Return only public data from public or buyer-facing endpoints.
- Reuse centralized buyer and seller entitlements.
- Preserve Stripe IDs, prices, and subscriptions.
- Do not apply migrations.
- Do not reset databases.
- Do not commit or push.

SHARED UTILITIES

Create centralized tested utilities for:

- Mean
- Median
- Percent change
- Sample thresholds
- Confidence
- Demand score
- Price-position label
- Date windows
- Comparable normalization
- Category normalization
- Region normalization

BUYER INTELLIGENCE

Return where supported:

- Listing price
- Comparable active listings
- Comparable completed sales
- Average sale price
- Median sale price
- Low and high range
- Sample size
- Confidence
- Price-position label
- Demand indicator
- Similar listings
- Data limitations

If authoritative price history is missing, return:

- available: false
- reason

Do not fabricate history.

SIMILAR LISTINGS

Use structured fields first:

- Category
- Brand
- Model
- Condition
- Price proximity
- State or location where available

Exclude deleted, hidden, sold, suspended, and unauthorized listings.

OWNER INTELLIGENCE

Extend or reuse Business Growth with:

- Inventory age
- Average days to sale
- Fast-moving categories
- Slow-moving categories
- Category sell-through
- Completed-sale averages
- Demand indicators
- Supply gaps
- Pricing summaries
- Inventory opportunities

Return aggregate data only.

SUPER ADMIN INTELLIGENCE

Add:

- /super-admin/marketplace-intelligence

Include:

- Marketplace overview
- Category performance
- Geographic aggregates
- Supply-demand gaps
- Pricing summaries
- Platform Health Score
- Operational action queue

Do not expose buyer identities or Growth Center contacts.

PLATFORM HEALTH

Implement a deterministic, versioned calculation returning:

- Score
- Maximum
- Version
- Components
- Evidence
- Recommended actions
- Data limitations

SEARCH AND DEMAND

If search events do not exist:

- Document the limitation.
- Use saved searches, watchlists, offers, completed sales, and buyer item
  submissions.
- Do not create a new model unless clearly required and separately reviewed.

ENTITLEMENTS

Free buyers must retain:

- Listing access
- Basic comparable summary
- Core marketplace purchasing, offers, and auctions

Paid tiers may unlock additional analytics depth only when implemented.

Seller plans may control analytics depth through the existing entitlement
service.

FRONTEND

Buyer:

- Add Marketplace Intelligence to Item Detail
- Similar listings
- Insufficient-data state
- Clear disclaimer

Owner:

- Extend Business Growth with inventory, category, demand, and opportunity
  intelligence

Super Admin:

- Add Marketplace Intelligence page and navigation
- Platform Health
- Category and geography sections
- Action queue

Required states:

- Loading
- Empty
- Error
- Insufficient data
- Populated
- Unauthorized
- Plan limited

TESTS

Add tests for:

- Mean and median
- Integer-cent precision
- Comparable filtering
- Completed-sale source
- Duplicate transaction prevention
- Sample thresholds
- Confidence
- Price-position labels
- Demand scoring
- Public-data safety
- Cross-shop isolation
- Platform Health
- Admin authorization
- Existing Marketing regression
- Existing Owner Growth regression
- Existing Customer Engagement regression
- Existing Buyer entitlement regression

VALIDATION

Run:

- Prisma format, validate, and generate if schema changes
- New intelligence tests
- Relevant controller and route tests
- Owner Growth tests
- Customer Engagement tests
- Buyer entitlement tests
- Backend core suite
- Frontend build
- Frontend lint
- git diff --check

Create:

docs/implementation/marketplace-intelligence-summary.md
docs/implementation/marketplace-intelligence-test-report.md

FINAL REPORT

Report:

1. Architecture reused
2. Audit findings
3. Authoritative data sources
4. Comparable rules
5. Confidence thresholds
6. Files changed
7. Models and migration
8. APIs
9. Frontend routes and pages
10. Buyer intelligence
11. Owner intelligence
12. Super Admin intelligence
13. Platform Health calculation
14. Entitlements
15. Privacy and authorization
16. Tests
17. Exact validation results
18. Deferred AI work
19. Risks
20. Git status
21. Suggested commit message

Do not commit or push.

# PawnLoop Marketplace Intelligence V1

## Purpose

PawnLoop must transform existing marketplace activity into accurate,
explainable, privacy-conscious intelligence for buyers, pawnshop owners,
and Super Admin.

Marketplace Intelligence V1 must use deterministic calculations and
authoritative project data.

Do not present speculative AI-generated claims as marketplace facts.

This phase builds on the existing:

- Marketplace listings
- Marketplace transactions
- Auctions
- Offers
- Saved searches
- Watchlists
- Buyer Workspace
- Owner Business Growth
- Shop Health
- Marketing analytics
- Customer engagement
- Seller and buyer entitlements
- Super Admin Platform Success

Do not create duplicate marketplace, analytics, pricing, search,
transaction, entitlement, or dashboard systems.

## Data Principles

Audit and identify the authoritative sources for:

- Active listings
- Completed sales
- Listing prices
- Sale prices
- Category
- Brand
- Model
- Condition
- Location
- Shop
- Listing-created date
- Sale-completed date
- Search activity
- Saved searches
- Watchlists
- Offers
- Auctions
- Marketing scans
- Buyer item submissions

Do not combine financial records in a way that double-counts revenue.

Every intelligence response should include where appropriate:

- Calculation period
- Sample size
- Data source
- Confidence level
- Data freshness
- Region
- Category or product scope
- Explanation
- Limitations

Use centralized minimum sample thresholds.

Recommended confidence behavior:

- Fewer than 3 completed comparable sales: insufficient data
- 3 to 9: low confidence
- 10 to 29: moderate confidence
- 30 or more: higher confidence

Do not expose buyer identities, private shop financial records, Growth
Center contacts, competitor-confidential performance, or individual
search histories.

## Buyer Intelligence

On an eligible listing, provide where supported:

- Current listing price
- Comparable completed-sale average
- Comparable completed-sale median
- Lowest comparable sale
- Highest comparable sale
- Comparable active-listing count
- Comparable completed-sale count
- Price-position indicator
- Data freshness
- Confidence
- Similar listings
- Local availability
- Demand indicator
- Data limitations

Use deterministic labels such as:

- Below comparable range
- Near comparable average
- Above comparable range
- Insufficient comparable data

Do not call an item a guaranteed bargain or investment.

Audit whether authoritative price history already exists.

If it does not exist, return an unavailable state with a reason.
Do not fabricate historical prices.

Similar listings should prioritize structured data:

- Category
- Brand
- Model
- Condition
- Price range
- Location or state
- Listing type
- Availability

Exclude deleted, hidden, sold, suspended, and unauthorized listings.

Demand indicators may use:

- Saved-search matches
- Watchlist activity
- Offers
- Completed sales
- Buyer item submissions
- Search events where authoritative
- Inventory availability

Return deterministic demand labels:

- Low
- Moderate
- High
- Insufficient data

## Owner Intelligence

Extend Owner Business Growth with:

- Active inventory
- Inventory age
- Recently added inventory
- Recently sold inventory
- Stale inventory
- Listings without photos
- Listings with weak descriptions
- Fast-moving categories
- Slow-moving categories
- Inventory turnover
- Average days to sale
- Category sell-through
- Price reductions
- Offer activity
- Auction performance
- Demand indicators
- Supply gaps
- Pricing-position summaries
- Inventory opportunities

Each category should support where data exists:

- Active listings
- Completed sales
- Gross sales
- Average sale price
- Median sale price
- Average days to sale
- Offers
- Sell-through rate
- Inventory age
- Demand indicator

Recommendations must include:

- Reason
- Supporting metrics
- Confidence
- Suggested action
- Applicable route

Do not expose individual buyer search details.

## Seller Plan Access

Free:

- Basic inventory age
- Basic category counts
- Basic recent sales
- Limited demand summary

Pro:

- Category performance
- Inventory turnover
- Basic pricing comparisons
- Demand indicators
- Recently sold comparable summaries

Plus:

- Advanced category analytics
- Regional pricing
- Advanced demand intelligence
- Inventory opportunity cards
- Advanced historical comparisons
- Anonymous benchmarking eligibility

Ultra:

- Cross-location intelligence
- Corporate category analytics
- Regional comparison
- Advanced exports
- API eligibility
- Forecasting eligibility

Preserve existing internal plan codes, Stripe identifiers, prices, and
subscription records.

## Super Admin Marketplace Intelligence

Add a Super Admin Marketplace Intelligence area supporting:

- Marketplace overview
- Categories
- Geography
- Pricing
- Demand
- Inventory
- Buyer activity
- Seller activity
- Platform Health
- Operational action queue

Use authoritative aggregates such as:

- Active listings
- Completed sales
- Gross merchandise value
- Average order value
- Active buyers
- Active shops
- New buyers
- New shops
- Saved searches
- Watchlist activity
- Offers
- Auctions
- Marketing scans
- Shop follows
- Referrals
- Inventory turnover

Category intelligence should include where supported:

- Active inventory
- Completed sales
- Average sale price
- Median sale price
- Sell-through
- Average days to sale
- Demand indicators
- Supply-demand gaps
- Regional differences

Geographic intelligence may aggregate by:

- State
- City
- Postal region
- Configurable radius where coordinates exist

Do not expose individual customer locations.

## Platform Health Score

Create a deterministic score from 0 to 100.

Potential dimensions:

- Marketplace supply
- Marketplace demand
- Transaction activity
- Shop activation
- Buyer engagement
- Marketing adoption
- Fulfillment health
- Subscription health
- Data quality

Return:

- Score
- Maximum
- Version
- Components
- Evidence
- Recommended actions
- Data limitations

Do not claim the score predicts company value or financial solvency.

## Search and Demand Audit

Audit whether the application records:

- Search terms
- Search filters
- Category searches
- Brand searches
- Saved-search creation
- Saved-search matches
- Listing views
- Shop views
- Item comparisons

If search events do not exist:

- Document the limitation.
- Use saved searches, watchlists, offers, completed sales, and buyer item
  submissions as available demand signals.
- Do not invent historical demand.

If a new event model is justified, it must be privacy-conscious,
rate-limited, retained for a defined period, and added through a separate
reviewed migration.

## Shared Intelligence Services

Prefer centralized reusable services for:

- Mean
- Median
- Percent change
- Sample thresholds
- Confidence levels
- Demand scoring
- Price-position labels
- Comparable matching
- Category normalization
- Region normalization
- Date windows
- Platform Health calculation

Avoid calculating the same metric differently across buyer, owner, and
Super Admin pages.

## APIs

Follow existing route conventions.

Potential public or buyer endpoints:

- GET /api/items/:itemId/intelligence
- GET /api/items/:itemId/similar
- GET /api/items/:itemId/price-history
- GET /api/items/:itemId/comparables

Potential owner endpoints:

- GET /api/shops/:shopId/intelligence
- GET /api/shops/:shopId/intelligence/inventory
- GET /api/shops/:shopId/intelligence/demand
- GET /api/shops/:shopId/intelligence/categories

Potential Super Admin endpoints:

- GET /api/super-admin/marketplace-intelligence
- GET /api/super-admin/marketplace-intelligence/categories
- GET /api/super-admin/marketplace-intelligence/geography
- GET /api/super-admin/marketplace-intelligence/platform-health

Avoid unnecessary route fragmentation.

## Future AI Extension Points

V1 must not require generative AI.

Prepare extension points for:

- AI Shopping Assistant
- AI Business Coach
- AI Marketing Studio
- AI Pricing Assistant
- AI Inventory Assistant
- AI Demand Forecasting

Future AI must consume deterministic intelligence results rather than
querying raw production tables directly.

## Security and Integrity

- Public intelligence may use only public listing data.
- Owner intelligence must be shop-scoped.
- Cross-shop access must be denied.
- Super Admin intelligence must be authorized server-side.
- No private buyer identity in owner reports.
- No private shop financial detail in public comparables.
- Validate date ranges and result limits.
- Rate-limit public intelligence endpoints.
- Preserve backend entitlement enforcement.
- Do not change Stripe configuration or plan pricing.

## Required Tests

Cover:

1. Mean and median calculations
2. Integer-cent precision
3. Comparable filtering
4. Deleted and inactive listing exclusion
5. Completed-sale source correctness
6. Duplicate transaction prevention
7. Sample thresholds
8. Confidence levels
9. Price-position labels
10. Demand scoring
11. Buyer public-data safety
12. Owner shop scoping
13. Cross-shop denial
14. Staff permission enforcement
15. Category metrics
16. Platform Health totals
17. Platform Health versioning
18. Super Admin authorization
19. Geographic aggregate privacy
20. Free buyer core-commerce preservation
21. Centralized seller and buyer plan gating
22. Existing Marketing tests
23. Existing Owner Growth tests
24. Existing Customer Engagement tests
25. Existing Buyer entitlement tests
26. Core backend suite

## Definition of Done

- Existing data architecture is audited first.
- No duplicate systems are created.
- One authoritative calculation exists per metric.
- No historical data is invented.
- No generative AI dependency is introduced.
- Comparable rules are documented.
- Confidence and sample size are visible.
- Owner results are shop-scoped.
- Super Admin results are authorized.
- Buyer results expose public data only.
- Plan enforcement is server-side.
- Loading, empty, error, insufficient-data, and populated states exist.
- Tests pass.
- Frontend build passes.
- Lint passes.
- Prisma validates if schema changes.
- No Stripe identifiers or prices change.
- Documentation is complete.

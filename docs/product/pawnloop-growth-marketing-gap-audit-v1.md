# PawnLoop Growth and Owner Marketing Gap Audit V1

## Objective

Audit the existing PawnLoop implementation and complete the missing
foundation for:

1. Super Admin pawnshop discovery, outreach, recruitment, onboarding,
   activation, and retention.
2. Owner marketing tools that direct customers to the owner's specific
   PawnLoop storefront, products, categories, inventory, auctions,
   promotions, and customer-intake pages.

The repository already contains a migration named:

20260730010000_master_pawnshop_growth_center_v1

Do not create a duplicate Growth Center. Inspect and reuse the existing
models, APIs, pages, routes, services, permissions, tests, and migrations.

## Super Admin Growth Center Requirements

Audit support for:

- Master pawnshop prospect directory
- Registered and prospective pawnshops
- Contact information
- Addresses and number of locations
- Acquisition source
- Assignment
- Priority
- Tags and notes
- Outreach pipeline
- Pipeline transition history
- Calls, emails, meetings, demos, and notes
- Follow-up tasks
- Overdue and upcoming tasks
- Prospect detail page
- Duplicate detection
- Prospect-to-Shop linking
- Registration invitations
- Claim This Shop workflow
- CSV import
- Growth dashboard
- Conversion analytics
- Geographic expansion data
- Role authorization
- Audit logging

Expected pipeline stages should support the business lifecycle from:

NEW
through:
CONTACTED
INTERESTED
DEMO_SCHEDULED
REGISTRATION_STARTED
ONBOARDING
APPROVED
LIVE
ACTIVE_SUBSCRIBER

and terminal or exception states such as:

INACTIVE
NOT_INTERESTED
DO_NOT_CONTACT

Reuse existing enum names when they already represent these concepts.

## Owner Marketing Center Requirements

Every approved shop should have marketing tools that send customers
directly to that specific shop on PawnLoop.

The default shop QR code must resolve to the shop storefront, such as:

/shops/{shopSlug}

It must not merely open the PawnLoop home page.

Audit support for:

- Permanent shop QR code
- Stable redirect token or short code
- Shop storefront QR destination
- Shop inventory
- New arrivals
- Auctions
- Deals
- Specific items
- Categories
- Sell-an-item intake
- Pawn inquiry
- Follow shop
- Review request
- Customer registration
- Buyer referral
- Pawnshop referral
- Dynamic destinations
- Campaign activation and deactivation
- QR preview
- PNG download
- SVG download
- Print-ready PDF foundation
- Short links
- Campaign names
- Placement labels
- Scan analytics
- Conversion analytics
- Tenant isolation
- Staff permissions
- Multi-location compatibility

## Printable Marketing Materials

Plan and identify current support for:

- Front-door sign
- Window sign
- Counter sign
- Receipt insert
- Business-card insert
- Product display card
- New-arrivals flyer
- Auction flyer
- Sell-or-pawn flyer
- Review card
- Referral card
- "Store closed? Shop online 24/7" sign

Materials should include:

- Shop name
- Shop logo
- Shop URL
- Personalized QR code
- Short link
- Call to action
- PawnLoop branding

## Digital Marketing Tools

Plan and identify current support for:

- Facebook content
- Instagram content
- Instagram Stories
- X content
- Google Business Profile content
- Email content
- SMS drafts
- Website banners
- Email signatures
- Link-in-bio links
- Promote This Item
- AI-generated marketing copy foundation
- Campaign calendar
- TV display mode
- Window display mode
- NFC compatibility

Do not claim external publishing integrations exist unless they are
actually implemented.

## Customer Retention

QR landing pages should support existing applicable customer actions:

- Follow shop
- Save shop
- New-arrival alerts
- Price-drop alerts
- Auction alerts
- Saved searches
- Messages
- Offers
- Purchases
- Sell-or-pawn inquiries
- Sharing
- Customer registration

All marketing subscriptions must be opt-in and respect unsubscribe
preferences.

## Public Shop Storefront

Audit whether the mobile storefront includes:

- Shop identity
- Logo and cover image
- Verified status
- Address and directions
- Hours
- Contact information
- Inventory
- New arrivals
- Featured products
- Auctions
- Deals
- Pickup and shipping
- Reviews
- Shop policies
- Follow or save actions
- Sell-or-pawn inquiry
- Share action
- Registration call to action

A QR visitor must not need to search for the shop again.

## Security Requirements

- Never expose private prospect data publicly.
- Keep owner data scoped to authorized shops.
- Enforce cross-shop tenant isolation.
- Do not create arbitrary external redirects.
- Validate destinations server-side.
- Use only public active resources for public QR redirects.
- Handle disabled campaigns.
- Handle inactive shops.
- Handle sold, hidden, or deleted items.
- Rate-limit public redirect analytics.
- Avoid storing raw IP addresses unless already required by an approved
  project architecture.
- Preserve audit history.
- Secure ownership claims.
- Respect communication consent.
- Reuse existing authentication, permissions, and audit architecture.

## Delivery Phases

### Phase 1

- Audit current implementation
- Inventory existing Growth Center code
- Inventory existing QR and marketing code
- Identify missing requirements
- Fix incomplete navigation and routes
- Complete foundational authorization
- Complete stable shop QR redirect
- Complete default shop QR
- Complete campaign CRUD
- Complete basic analytics
- Add missing tests
- Produce implementation roadmap

### Phase 2

- CSV imports
- Duplicate management
- Claim This Shop
- Prospect-to-Shop conversion
- Registration invitations
- Onboarding linkage

### Phase 3

- Printable marketing kit
- Product and category cards
- Referral attribution
- Digital marketing templates
- Super Admin marketing administration

### Phase 4

- Customer retention automation
- TV and window mode
- NFC
- AI Marketing Studio
- AI Business Coach
- Shop Health Score
- Demand analytics
- Advanced attribution

## Definition of Done

- Existing implementation is audited before schema changes.
- No duplicate models or routes are created.
- Prisma validation and generation pass.
- New migrations are nondestructive.
- Authorization tests pass.
- Cross-shop isolation tests pass.
- Frontend build passes.
- Relevant backend tests pass.
- Empty, loading, error, and populated states exist.
- No hard-coded production metrics remain.
- No secrets are committed.
- No unrelated refactoring is performed.
- Exact validation results are documented.

---

# Owner Marketing Center, Business Growth, and Seller Plan Entitlements

## Owner Navigation

PawnLoop must provide two separate owner sections.

### Marketing Center

Marketing Center helps owners attract customers, send customers directly
to their specific PawnLoop storefront and products, create marketing
materials, measure results, and retain customers.

Recommended navigation:

- Overview
- QR Codes
- Campaigns
- Printable Materials
- Social Media
- Customer Growth
- Referrals
- Marketing Analytics
- Digital Displays
- AI Marketing Studio

### Business Growth

Business Growth helps owners improve their business operations,
inventory decisions, customer retention, revenue, and profitability.

Recommended navigation:

- Growth Overview
- Shop Health Score
- AI Business Coach
- Revenue Analytics
- Inventory Insights
- Customer Insights
- Local Demand
- Anonymous Benchmarking
- Goals
- Growth Opportunities

Marketing Center and Business Growth must remain distinct concepts.

## Seller Plan Naming

Target customer-facing plan names:

- Free
- Pro
- Plus
- Ultra

The current application may use PREMIUM as an internal plan code.

Before renaming any internal enum, database value, Stripe product,
Stripe price, subscription record, configuration key, API response,
test fixture, or analytics dimension, audit all references.

Safe compatibility approach:

- Preserve PREMIUM internally where required.
- Display the customer-facing plan name as Plus.
- Perform an internal code rename only through a separately reviewed
  compatibility migration.

Do not break existing subscriptions or Stripe webhook processing.

## Free Plan

Target price:

- $0 per month

Recommended entitlements:

- 25 active listings
- One location
- One owner or staff account
- Public shop storefront
- Basic shop profile
- Fixed-price listings
- Basic offers
- Local pickup
- Standard messaging
- Basic orders
- Basic reviews
- Permanent shop QR code
- Shop-specific storefront destination
- PNG and SVG QR download
- Front-door sign
- Counter sign
- Copyable storefront link
- Basic scan count
- Buyer referral link
- Pawnshop referral link
- Basic owner dashboard
- Basic listing views
- Basic sales totals
- Basic Shop Health Score
- Limited growth recommendations
- No auctions
- No featured listings
- No advanced analytics
- No automated campaigns
- No AI Marketing Studio
- No multi-location management
- Target commission: 12 percent

## Pro Plan

Target price:

- $49 per month

Recommended entitlements:

- 100 active listings
- One location
- Three staff accounts
- Fixed-price listings
- Offers
- Auctions
- Featured listings
- Pickup and shipping
- Inventory tools
- Customer messaging
- Basic staff permissions
- All Free marketing features
- Ten active QR campaigns
- Product QR codes
- Category QR codes
- Auction QR codes
- New-arrivals QR code
- Sell-or-pawn QR code
- Short links
- Basic campaign analytics
- Additional printable templates
- Social copy templates
- Customer follow tools
- New-arrival alerts
- Referral attribution
- Shop Health Score
- Revenue trends
- Inventory performance
- Listing-quality recommendations
- Customer engagement metrics
- Basic local-demand insights
- Monthly growth report
- Target commission: 9 percent

## Plus Plan

Target price:

- $149 per month

Recommended entitlements:

- Unlimited active listings
- Five locations
- Fifteen staff accounts
- Advanced staff permissions
- Auctions
- Featured inventory
- Multi-location inventory
- Inventory transfers
- Advanced fulfillment
- Advanced shop profile
- Customer relationship-management foundation
- All Pro marketing features
- Unlimited QR campaigns
- Dynamic QR destinations
- Full printable marketing kit
- Custom campaign branding
- Social campaign builder
- Marketing calendar
- Advanced campaign analytics
- Conversion tracking
- Referral dashboards
- Customer segmentation
- Email campaign drafts
- SMS campaign drafts
- TV display mode
- Window display mode
- Promote This Item
- AI-generated marketing copy
- AI flyer and caption assistance
- Multi-location campaigns
- Advanced revenue analytics
- Inventory turnover
- Category profitability
- Customer retention analytics
- Repeat-customer analytics
- Local-demand heat maps
- Anonymous benchmarking
- AI Business Coach
- Inventory recommendations
- Pricing recommendations
- Monthly goals
- Growth opportunities
- Location comparison
- Priority support
- Guided onboarding
- Marketing setup assistance
- Target commission: 6 percent

## Ultra Plan

Target price:

- $299 per month

Recommended entitlements:

- Unlimited listings
- Unlimited locations
- Unlimited staff
- Enterprise permissions
- Corporate and location-level roles
- Central inventory management
- Cross-location inventory transfers
- Enterprise reporting
- Custom approval workflows
- Bulk listing and management tools
- API and integration foundation
- Advanced audit history
- All Plus marketing features
- Corporate campaign management
- Selected-location and all-location campaigns
- Location-specific branding
- Advanced conversion and revenue attribution
- Custom print templates
- Scheduled digital displays
- Advanced referral programs
- AI campaign recommendations
- Automated campaign suggestions
- Advanced customer segments
- Campaign comparison
- Future NFC support
- Executive business-intelligence dashboard
- Enterprise Shop Health reporting
- Cross-location benchmarking
- Location profitability
- Staff performance analytics
- Advanced demand forecasting
- Inventory allocation recommendations
- Enterprise AI Business Coach
- Exportable executive reports
- Custom KPI tracking
- Priority enterprise support
- Dedicated onboarding assistance
- Business review sessions
- Early access to selected features
- Target commission: 4 percent

## Central Entitlement Architecture

Plan behavior must be controlled through centralized entitlements rather
than scattered string comparisons.

The implementation should support configuration concepts such as:

- Maximum active listings
- Maximum locations
- Maximum staff
- Auction access
- Featured-listing access
- QR campaign limit
- Dynamic QR access
- Printable template level
- Marketing analytics level
- Business analytics level
- AI Marketing Studio access
- AI Business Coach access
- Digital-display access
- Multi-location campaign access
- Referral analytics access
- Benchmarking access
- API access
- Support level
- Commission basis points

The backend must remain the source of truth.

Frontend plan gating is for user experience only and must not replace
backend enforcement.

## Owner Plan Usage

The owner subscription page should show current usage and limits:

- Active listings
- Locations
- Staff
- Active QR campaigns
- AI generations where applicable
- Digital displays where applicable
- Current commission rate

When a limit is reached, display a value-based upgrade explanation rather
than a generic access-denied message.

## Automatic Marketing Setup

When a shop becomes approved or live, prepare the foundation for
automatically creating:

- Shop storefront URL
- Permanent shop QR code
- Front-door sign
- Counter sign
- Receipt insert
- Social announcement draft
- Email-signature link
- Buyer referral link
- Pawnshop referral link

Automatic creation must be idempotent and must not create duplicate
campaigns or referral identities.

## Marketing Setup Checklist

Provide a checklist with actions such as:

- Publish storefront
- Add shop logo
- Verify shop hours
- Create permanent QR code
- Download front-door sign
- Download counter sign
- Add QR code to receipts
- Create first campaign
- Invite customers to follow the shop

## Implementation Safety

Before making changes, audit:

- Existing seller plan codes
- Seller-plan configuration
- Prisma enums and stored values
- Stripe products and prices
- Subscription webhooks
- Seller subscription APIs
- Super Admin plan management
- Owner subscription pages
- Tests and fixtures
- Commission calculations
- Listing limits
- Location limits
- Staff limits

Do not:

- Cancel existing subscriptions
- silently replace Stripe price identifiers
- downgrade customers
- delete PREMIUM records
- change live prices without configuration
- depend only on frontend gating
- create duplicate plan systems

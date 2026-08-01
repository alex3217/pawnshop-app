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

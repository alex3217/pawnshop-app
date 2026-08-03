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

---

# Buyer Experience Platform and Buyer Plan Entitlements

## Purpose

PawnLoop must provide buyers with a complete shopping, discovery,
tracking, collection, loyalty, and customer-success platform.

The buyer experience must improve marketplace activity without placing
essential purchase functionality behind a paid subscription.

Core marketplace actions must remain available to Free users.

Paid plans should primarily monetize:

- Convenience
- Advanced alerts
- AI assistance
- Collection tools
- Analytics
- Market intelligence
- Priority experiences
- Concierge services

Before implementing anything, audit all existing buyer pages, services,
routes, subscriptions, plans, saved searches, watchlists, auctions,
offers, messages, orders, alerts, reviews, referrals, rewards, and
checkout functionality.

Do not create duplicate systems.

## Buyer Navigation

Recommended buyer navigation:

- Buyer Dashboard
- Marketplace
- Nearby Shops
- Saved Searches
- Watchlist
- Wish Lists
- Collections
- Compare
- Auctions
- Offers
- Orders
- Messages
- Trade-In Center
- Sell or Pawn
- Buyer Workspace
- Buyer Success Center
- Rewards
- Referrals
- Buyer Subscription
- Profile
- Settings
- Safety Center

The final navigation should reuse existing routes and consolidate
duplicate experiences.

## Buyer Dashboard

The Buyer Dashboard should provide:

- Recently viewed items
- Recommended items
- Nearby shops
- New arrivals
- Auctions ending soon
- Price drops
- Active offers
- Active bids
- Auction wins
- Orders
- Messages
- Saved-search matches
- Favorite shops
- Watchlist activity
- Rewards summary
- Buyer-plan usage
- Suggested next actions

Metrics must come from real APIs rather than permanently hard-coded data.

## Buyer Workspace

The Buyer Workspace should provide configurable widgets.

Potential widgets:

- Watchlist
- Saved searches
- Favorite shops
- Auctions
- Orders
- Messages
- Offers
- Price alerts
- Wish lists
- Nearby inventory
- Recently viewed items
- AI recommendations
- Rewards
- Collection values
- Trade-in requests
- Sell or pawn submissions

V1 may provide a fixed layout with a clean extension path.
Advanced plan tiers may unlock customization.

## Smart Search

Audit and plan support for:

- Keyword search
- Category
- Brand
- Price range
- Condition
- Radius
- Pickup today
- Shipping available
- Verified shops
- Auctions only
- Buy Now only
- Offers accepted
- Financing where actually supported
- Voice search
- Image search
- Barcode search
- AI natural-language search

Do not show unsupported filters.

## Saved Searches and Smart Alerts

Support:

- Saved search name
- Query
- Category
- Brand
- Price range
- Radius
- Condition
- Pickup and shipping preferences
- Notification preferences
- Active or paused status
- Match history
- Last notification date

Alerts may include:

- New matching listing
- Price drop
- Back in stock
- Auction starting
- Auction ending
- Similar item
- Favorite-shop arrival
- Offer response
- Counteroffer
- Order update
- Shipping update

All promotional alerts must be opt-in and support unsubscribe or pause.

## Wish Lists

Wish lists should be separate from saved searches.

Support:

- Multiple lists based on plan
- List name
- Description
- Privacy
- Share link
- Items
- Notes
- Desired price
- Desired condition
- Gift occasion
- Created and updated dates

Examples:

- Birthday
- Christmas
- Dream Garage
- Jewelry
- Power Tools
- Collectibles

## Collections

Collections allow buyers to organize items they own, purchased items,
and items they are tracking.

Potential fields:

- Collection
- Owned item
- Marketplace item relationship
- User-created item
- Purchase price
- Purchase date
- Current estimated value
- Serial number
- Warranty date
- Receipt or document reference
- Notes
- Photos
- Insurance-export inclusion

Sensitive item categories must follow applicable policy and privacy
requirements.

## Follow Shops

Buyers should be able to:

- Follow shops
- Save favorite shops
- Receive new-arrival alerts
- Receive auction alerts
- Receive deal alerts
- Receive shop announcements
- Unfollow or mute a shop
- Manage notification preferences

## Compare Items

Comparison should support:

- Price
- Condition
- Photos
- Brand
- Model
- Shop
- Distance
- Shipping
- Pickup
- Warranty where available
- Reviews
- Offers accepted
- Auction status
- Availability

Comparison limits may vary by buyer plan.

## Price Intelligence

Audit and plan support for:

- Listing price history
- Price-drop history
- Similar-item pricing
- Local price comparisons
- Marketplace average where data is sufficient
- High and low ranges
- Pricing confidence
- Data freshness
- Transparent methodology

Do not present estimates as guaranteed values.

## AI Shopping Assistant

Potential capabilities:

- Natural-language item search
- Item recommendations
- Comparison summaries
- Price explanations
- Similar item suggestions
- Saved-search creation
- Shopping-list assistance
- Deal identification
- Collection suggestions

AI responses must distinguish marketplace facts from estimates or
recommendations.

AI usage should support:

- Plan limits
- Cost controls
- Logging
- Moderation
- Error handling
- Clear fallback behavior

## Trade-In Center

Buyers should be able to:

- Upload item photos
- Describe an item
- Select category
- Add condition
- Add brand and model
- Provide serial number where appropriate
- Request offers from eligible shops
- Track shop responses
- Accept or decline an offer
- Schedule an appointment or handoff
- Maintain offer history

Reuse existing buyer item submission and sell/pawn architecture.

Do not create a duplicate submission system.

## Sell or Pawn Center

Support:

- Sell request
- Pawn inquiry
- Photos
- AI-assisted description
- Estimated range where appropriate
- Shop selection
- Nearby participating shops
- Offer tracking
- Appointment scheduling
- Status history
- Messaging
- Withdrawal

## Appointments

Potential appointment types:

- Item appraisal
- Pawn consultation
- Trade-in inspection
- Pickup
- Order collection
- Jewelry consultation
- Other shop-defined appointment

Reuse existing scheduling architecture where present.

## Messaging Hub

The buyer messaging experience should consolidate:

- Shop conversations
- Listing conversations
- Offer conversations
- Order conversations
- Auction conversations
- Trade-in conversations
- Sell/pawn submissions
- Support conversations

It should support unread counts, search, attachments where approved,
blocking, and reporting.

## Buyer Wallet

Audit and plan support for:

- Secure payment methods
- Billing addresses
- Shipping addresses
- Store credit
- Gift cards
- Referral credits
- Rewards
- Receipts
- Refund status

Do not duplicate Stripe payment-method handling.

## Loyalty and Rewards

Potential earning actions:

- Purchases
- Qualified referrals
- Reviews
- Profile completion
- Following shops
- Promotional actions approved by PawnLoop

Potential rewards:

- Marketplace credits
- Shipping benefits
- Exclusive promotions
- Early access
- Shop-specific rewards

Reward accounting must be auditable.
Do not issue financial value without explicit policy configuration.

## Buyer Referrals

Support:

- Buyer referral code
- Referral link
- Invite history
- Signup attribution
- Qualified purchase attribution
- Reward status
- Fraud controls
- Audit history

## Buyer Reviews and Reputation

Buyers should be able to:

- Review completed purchases
- Review shops where eligible
- Upload approved photos
- Edit within policy limits
- Report problems
- View moderation status

Prevent reviews from users without an eligible transaction where
transaction verification is required.

## Buyer Safety Center

Include:

- Verified-shop explanation
- Purchase protection information
- Fraud prevention
- Safe pickup guidance
- Reporting
- Dispute guidance
- Privacy controls
- Security settings
- Account verification status
- Blocked users or shops where supported

## Shopping Trips

Future support may include:

- Save multiple shop destinations
- Plan a shopping route
- View shop hours
- Track desired items by shop
- Share a trip
- Add appointment times

## Local Events

Potential event types:

- Shop sales
- Auctions
- Buying events
- Jewelry events
- Community events
- Appraisal days
- Store anniversaries

Events must be tied to legitimate shops and moderated where necessary.

## Buyer Success Center

The Buyer Success Center should guide customers toward useful platform
features.

Potential checklist:

- Complete profile
- Verify email
- Add shipping address
- Add payment method
- Follow a shop
- Save a search
- Create a wish list
- Enable alerts
- Complete first purchase
- Leave first eligible review
- Invite a friend

It may show:

- Profile completion
- Saved searches
- Wish lists
- Shops followed
- Alerts enabled
- Orders completed
- Rewards earned
- Money saved where defensible
- Suggested next action

Do not use manipulative engagement scoring.

## Accessibility and Localization

Audit and plan support for:

- Keyboard navigation
- Screen readers
- High contrast
- Large text
- Reduced motion
- Clear focus states
- Language-ready strings
- Mobile-first layout
- Accessible errors
- Accessible forms

## Mobile Experience

Potential support:

- Push notifications
- Camera search
- QR scanner
- Location-aware discovery
- Mobile receipts
- Wallet-compatible order passes
- Offline receipt access

Do not claim native-app functionality unless it exists.

---

# Buyer Subscription Plans

## Plan Naming

Target customer-facing buyer plans:

- Free
- Pro
- Plus
- Ultra

Before changing any plan code, audit:

- Existing buyer plan enums
- Database values
- Buyer subscription records
- Stripe products
- Stripe prices
- Webhooks
- API responses
- Super Admin buyer-plan controls
- Owner or buyer plan pages
- Tests
- Fixtures
- Entitlement checks

Preserve backward compatibility.

If an existing internal code differs from the target display name,
prefer a customer-facing label mapping rather than immediately changing
stored billing codes.

## Universal Free Buyer Capabilities

These features must remain available without a paid subscription:

- Browse public marketplace inventory
- View product details
- View public shop profiles
- Buy eligible items
- Make offers where supported
- Bid in auctions where supported
- Message shops where supported
- Track orders
- View receipts
- Track shipping
- Track pickup
- Manage account
- Manage security
- Report fraud or safety concerns
- Leave eligible reviews
- Basic notifications
- Basic accessibility
- Basic mobile web access

Paid plans must not block essential marketplace commerce.

## Free Buyer Plan

Target price:

- $0 per month

Recommended entitlements:

- Browse all public listings
- Basic marketplace search
- Basic filters
- Buy Now
- Offers
- Auctions
- Shop messaging
- Shop profiles
- Reviews
- Favorite items
- Favorite shops
- One wish list
- Ten saved searches
- Basic alerts
- Purchase history
- Order tracking
- Pickup and shipping tracking
- QR product scanning
- Basic buyer profile
- Recently viewed items
- Basic watchlist
- Basic dashboard
- Basic Buyer Success checklist
- Basic AI-assisted search with a conservative usage allowance, only if
  an actual AI provider is connected safely

## Pro Buyer Plan

Target price:

- $9.99 per month

Recommended entitlements:

- Everything in Free
- Unlimited saved searches
- Unlimited wish lists
- Unlimited favorites
- Basic AI Shopping Assistant
- Price history
- Similar-item recommendations
- New-arrival alerts
- Category alerts
- Brand alerts
- Radius alerts
- Faster notification processing
- Advanced marketplace filters
- Saved filter presets
- Customizable Buyer Workspace
- Basic spending insights
- Basic shopping statistics
- Loyalty points
- Referral rewards
- Limited exclusive promotions
- Larger comparison limit

## Plus Buyer Plan

Target price:

- $19.99 per month

Recommended entitlements:

- Everything in Pro
- Advanced AI Shopping Assistant
- AI comparison summaries
- AI value explanations
- Advanced price intelligence
- Exclusive member deals
- Priority deal alerts
- Early notification for eligible inventory
- Early auction notifications where fair and legally appropriate
- Priority offer notifications
- Bulk watchlists
- Collection Manager
- Owned-item tracking
- Receipt storage foundation
- Warranty tracking
- Serial-number tracking
- Collection-value estimates
- Purchase analytics
- Spending categories
- Price trend analysis
- Trade-In Center management
- Sell-to-shop management
- Pawn estimate history
- Advanced Buyer Workspace widgets
- Basic market intelligence
- Exportable collection summary

## Ultra Buyer Plan

Target price:

- $39.99 per month

Recommended entitlements:

- Everything in Plus
- Concierge search requests
- Personal shopping-assistant workflow
- Hard-to-find item assistance
- VIP promotion eligibility
- Highest eligible notification priority
- Advanced market intelligence
- Regional price trends
- Regional demand trends
- Advanced historical pricing
- Advanced collection analytics
- Insurance-ready collection export
- Collection inventory reports
- Value-change tracking
- Advanced purchase analytics
- Advanced Buyer Workspace
- Priority support
- Early access to selected buyer features

Do not promise human concierge staffing unless the operational process
exists.

## Buyer Plan Usage Dashboard

The Buyer Subscription page should show real usage, such as:

- Saved searches used and limit
- Wish lists used and limit
- Comparison-list usage
- AI requests used and allowance
- Collection items used and limit
- Active alerts
- Referral rewards
- Loyalty points
- Current billing period
- Renewal date
- Current plan
- Upgrade options

## Upgrade Messages

Upgrade prompts should explain value.

Examples:

"You have reached the Free plan limit of 10 saved searches. Upgrade to
Pro for unlimited saved searches, price history, advanced alerts, and
the AI Shopping Assistant."

"Collection Manager is included with Plus and Ultra."

Do not use misleading urgency or false scarcity.

## Central Buyer Entitlement Architecture

Buyer plan behavior must be controlled by a centralized backend
entitlement system.

Potential entitlement keys:

- savedSearchLimit
- wishListLimit
- favoriteLimit
- comparisonLimit
- alertLevel
- notificationPriority
- aiShoppingEnabled
- aiShoppingMonthlyLimit
- priceHistoryEnabled
- advancedSearchEnabled
- workspaceLevel
- workspaceCustomizationEnabled
- collectionManagerEnabled
- collectionItemLimit
- marketIntelligenceLevel
- conciergeEnabled
- loyaltyEnabled
- referralRewardsEnabled
- earlyInventoryAlertsEnabled
- exclusiveDealsLevel
- supportLevel

The backend must be the source of truth.

Frontend gating improves user experience but must not replace backend
enforcement.

## Fairness and Marketplace Integrity

Paid buyer plans must not:

- Prevent Free users from buying
- Hide ordinary public listings from Free users
- unfairly invalidate existing bids or offers
- allow paid users to bypass auction rules
- guarantee inventory reservations without shop agreement
- misrepresent pricing estimates
- bypass fraud controls
- bypass identity or payment verification
- gain access to private shop information

Any early-access feature must be carefully designed to preserve
marketplace fairness and applicable legal obligations.

## Implementation Phases

### Buyer Phase 1

- Audit existing buyer functionality
- Audit existing buyer plans
- Produce requirement matrix
- Central buyer entitlement architecture
- Buyer Subscription usage display
- Buyer navigation cleanup
- Buyer Workspace foundation
- Buyer Success Center foundation
- Wish List foundation if missing
- Follow Shop audit and completion
- Smart alert audit
- Plan-aware backend enforcement
- Authorization and tenant tests

### Buyer Phase 2

- Collections
- Price history
- Compare improvements
- Loyalty
- Referrals
- Trade-In Center consolidation
- Sell/Pawn Center consolidation
- Advanced alerts
- Spending insights

### Buyer Phase 3

- AI Shopping Assistant
- AI comparison summaries
- Market intelligence
- Collection valuation
- Insurance exports
- Advanced Buyer Workspace

### Buyer Phase 4

- Concierge workflows
- Shopping trips
- Local events
- Native mobile enhancements
- Advanced regional demand
- Advanced personalization

# PawnLoop Owner Growth and Platform Success V1

## Purpose

PawnLoop must help pawnshop owners improve their storefront, inventory,
marketing adoption, customer engagement, and business performance.

PawnLoop must also give Super Admin an operational view of which shops
need onboarding help, which shops are inactive, which shops are using
marketing tools, and which actions should be taken next.

This phase builds on the already implemented:

- Super Admin Growth Center
- Owner Marketing Center
- Shop-specific QR campaigns
- Marketing scan analytics
- Seller subscriptions and seller plan configuration
- Owner dashboard
- Inventory
- Locations
- Staff
- Orders
- Offers
- Auctions
- Reviews
- Buyer activity
- Buyer Workspace and entitlements

Do not create duplicate dashboards, analytics systems, subscription
systems, or shop-access systems.

---

# Part A — Owner Business Growth Center

## A1. Owner Navigation

Add or complete:

- Business Growth
  - Growth Overview
  - Shop Health
  - Inventory Insights
  - Customer Insights
  - Revenue Analytics
  - Marketing Performance
  - Growth Opportunities
  - Goals
  - Business Coach

The initial release may use one consolidated page with sections and
clean extension points rather than many shallow routes.

Marketing Center and Business Growth must remain separate:

- Marketing Center helps attract and retain customers.
- Business Growth helps improve operations and profitability.

## A2. Growth Overview

The Growth Overview should use real data and include, where currently
available:

- Active listings
- Listing limit
- Available inventory
- Sold inventory
- Inventory added recently
- Items missing photos
- Items missing useful descriptions
- Stale listings
- Orders
- Completed sales
- Active offers
- Auctions
- Reviews
- Average rating
- Marketing campaigns
- Active QR campaigns
- QR scans
- Staff usage
- Locations
- Seller plan
- Current commission rate
- Onboarding completion
- Marketing setup completion

Do not permanently hard-code production metrics.

## A3. Shop Health Score

Create a transparent, deterministic Shop Health Score from 0 to 100.

Initial score dimensions may include:

- Storefront completeness
- Logo presence
- Address completeness
- Hours completeness
- Contact information
- Active inventory
- Listing-photo completeness
- Listing-description completeness
- Listing freshness
- Customer-response readiness
- Order or fulfillment health where available
- Review profile
- Marketing setup
- QR campaign activation
- Subscription standing
- Onboarding completion

Requirements:

- Score components must be visible.
- Owners must be told how to improve each component.
- Missing data must not be treated as misconduct.
- Do not represent the score as a credit, compliance, or financial-risk score.
- Do not use hidden manipulative scoring.
- Score changes should be explainable.

Example:

Shop Health: 72 / 100

- Storefront: 18 / 20
- Inventory quality: 20 / 30
- Customer readiness: 14 / 20
- Marketing setup: 10 / 15
- Operations: 10 / 15

Recommended action:

"Add additional photos to 12 listings to improve inventory quality."

## A4. Marketing Setup Checklist

The checklist should use real shop state.

Potential actions:

- Publish shop storefront
- Add shop logo
- Add cover image where supported
- Verify address
- Add store hours
- Add phone or contact method
- Create permanent QR campaign
- Download storefront QR
- Create first marketing campaign
- Add a placement label
- Activate a campaign
- Add QR code to front door
- Add QR code to counter
- Add QR code to receipts
- Promote first item
- Invite customers to follow shop

Only mark an action complete when supported by actual state.

Printable materials that are not yet implemented must not be shown as
completed.

## A5. Inventory Insights

Initial inventory insights may include:

- Active listings
- Sold listings
- Stale listings
- Listings without photos
- Listings with only one photo
- Listings with short descriptions
- Listings missing brand or model where applicable
- Listings missing condition
- Listings missing category
- Listings with no recent views where analytics exists
- High-view low-conversion listings where defensible
- Inventory by category
- Inventory age
- Recently added inventory
- Listings nearing plan limit

Recommendations must be based on real fields and clearly explain their
logic.

## A6. Customer Insights

Use existing real data where available:

- Shop followers
- Favorite or saved-shop activity
- Messages
- Offers
- Repeat buyers
- Reviews
- Average rating
- Saved-search matches
- Buyer-item submissions
- Sell or pawn inquiries
- QR-originated visits
- Marketing conversions where implemented

Do not invent customer segmentation.

## A7. Revenue Analytics

Reuse existing settlement, order, revenue, commission, and payout
systems.

Potential metrics:

- Gross marketplace sales
- Completed transaction value
- Refunds
- Disputes
- Platform fees
- Net seller proceeds
- Pending payouts
- Completed payouts
- Sales by category
- Sales by location
- Recent sales trend
- Average order value

All calculations must use one authoritative revenue source and avoid
double counting.

## A8. Growth Opportunities

Create deterministic opportunity cards.

Examples:

- Add photos to incomplete listings.
- Create a permanent shop QR code.
- Activate a marketing campaign.
- Add inventory in an underrepresented category.
- Respond to pending offers.
- Complete Stripe onboarding.
- Add store hours.
- Resolve stale listings.
- Add staff where plan capacity permits.
- Upgrade plan when the shop is genuinely near a limit.

Each card must include:

- Reason
- Suggested action
- Destination route
- Priority
- Whether it is complete
- Supporting metric where appropriate

## A9. Goals

V1 may support simple owner-defined goals:

- Monthly sales target
- Active-listing target
- New-inventory target
- QR scan target
- Review target
- Campaign target

If persistent goal storage would require a new model, audit first and
create only the smallest safe model.

Goals must not be presented as guaranteed business outcomes.

## A10. Business Coach Foundation

V1 Business Coach should be deterministic and rule-based unless an
approved AI provider is already safely connected.

It may produce statements such as:

- "Twelve active listings have only one photo."
- "Your shop has no active marketing campaign."
- "You are using 92 of 100 Pro listings."
- "Five offers require attention."
- "Your storefront is missing business hours."

Do not label simple rules as generative AI.

Prepare clean extension points for future AI Business Coach capabilities:

- Weekly summaries
- Inventory recommendations
- Pricing recommendations
- Demand insights
- Campaign recommendations
- Benchmarking interpretation

---

# Part B — Seller Plan Entitlements

## B1. Compatibility

Audit and preserve existing seller-plan codes, Stripe identifiers,
subscription records, prices, webhooks, and commission calculations.

Target customer-facing names:

- Free
- Pro
- Plus
- Ultra

If the internal code remains PREMIUM, display it as Plus rather than
performing an unsafe stored-value rename.

Do not:

- Replace Stripe IDs
- Change production pricing
- Cancel subscriptions
- Downgrade existing sellers
- Rewrite stored plan codes without migration compatibility
- Create a second seller-plan system

## B2. Central Seller Entitlements

Use or extend one backend source of truth.

Support entitlement concepts such as:

- maxActiveListings
- maxLocations
- maxStaff
- auctionsEnabled
- featuredListingsEnabled
- analyticsLevel
- marketingCenterEnabled
- qrCampaignLimit
- dynamicQrEnabled
- printableMarketingLevel
- marketingAnalyticsLevel
- businessGrowthLevel
- shopHealthEnabled
- businessCoachLevel
- digitalDisplaysEnabled
- multiLocationCampaignsEnabled
- referralAnalyticsEnabled
- benchmarkingEnabled
- apiAccessEnabled
- supportLevel
- commissionBps

Only enforce capabilities that currently exist.

Future entitlements must separately report implementation status.

## B3. Recommended Seller Plan Display

### Free

- 25 active listings
- One location
- One owner/staff account
- Public storefront
- Permanent storefront QR
- Basic scan count
- Basic dashboard
- Basic Shop Health
- Limited growth recommendations
- No auctions
- No featured listings
- Basic analytics
- Target commission: 12 percent

### Pro

- 100 active listings
- One location
- Three staff
- Auctions
- Featured listings
- Up to 10 active QR campaigns
- Product and category QR eligibility
- Basic campaign analytics
- Shop Health
- Inventory insights
- Customer engagement summary
- Monthly growth summary
- Target commission: 9 percent

### Plus

- Unlimited active listings
- Up to five locations
- Up to 15 staff
- Unlimited QR campaigns
- Dynamic QR eligibility
- Advanced marketing analytics
- Advanced Business Growth
- AI Business Coach eligibility
- Multi-location campaign eligibility
- Customer insights
- Advanced revenue analytics
- Anonymous benchmarking eligibility
- Priority support
- Target commission: 6 percent

### Ultra

- Unlimited listings
- Unlimited locations
- Unlimited staff
- Enterprise permissions
- Corporate reporting
- Cross-location analytics
- Enterprise Shop Health
- Advanced demand forecasting eligibility
- Executive dashboard
- API eligibility
- Priority enterprise support
- Target commission: 4 percent

Do not change existing configured prices in this phase.

## B4. Owner Usage API and UI

Show:

- Current internal plan
- Customer-facing plan name
- Subscription status
- Billing period
- Active listings used and limit
- Locations used and limit
- Staff used and limit
- QR campaigns used and limit
- Current commission
- Available marketing level
- Available business-growth level
- Implemented vs planned features

## B5. Enforcement

Backend enforcement should cover real implemented limits:

- Listings
- Locations
- Staff
- Active QR campaigns
- Auctions where currently enforced
- Featured listings where currently enforced

Frontend must provide upgrade guidance but may not replace backend
authorization.

---

# Part C — Super Admin Platform Success Center

## C1. Purpose

Create a Super Admin operational dashboard focused on marketplace health
and action queues.

Recommended navigation:

- Platform Success
  - Overview
  - Shop Success
  - Buyer Success
  - Marketing Adoption
  - Onboarding Risks
  - Subscription Health
  - Action Queue

V1 may use one consolidated page.

## C2. Platform Success Metrics

Use real data to show:

- Total shops
- Approved shops
- Live shops
- Shops with active inventory
- Shops with zero active inventory
- Shops without a logo
- Shops without complete hours
- Shops without active QR campaigns
- Shops with no marketing scans
- Shops with incomplete onboarding
- Shops with incomplete Stripe onboarding
- Shops near plan limits
- Shops with overdue offers or operational tasks where available
- Active buyers
- Buyers with saved searches
- Buyers with watchlist items
- Buyer subscription mix
- Seller subscription mix
- Recent marketplace transactions
- Recent platform revenue where authoritative

## C3. Operational Action Queues

Create actionable queues such as:

- Shops needing onboarding help
- Shops with no inventory
- Shops without marketing setup
- Shops with inactive campaigns
- Shops with no recent activity
- Shops with incomplete payment setup
- Shops near listing limits
- Shops with low Shop Health
- Buyers with payment or account setup issues where appropriate
- Growth leads requiring follow-up

Each result should link to the relevant existing administrative page.

## C4. Shop Success Detail

Super Admin should be able to see, subject to authorization:

- Shop identity
- Subscription
- Onboarding state
- Inventory count
- Shop Health components
- Marketing setup state
- QR campaigns
- QR scans
- Recent sales summary
- Open operational issues
- Recommended platform action

Do not expose unrelated sensitive data.

## C5. Marketing Adoption

Show:

- Shops with permanent QR campaigns
- Shops with additional campaigns
- Active campaigns
- Inactive campaigns
- Scans by date range
- Shops with no scans
- Top campaign destination types
- Marketing Center adoption by seller plan

## C6. Subscription Health

Show:

- Seller plans by tier
- Buyer plans by tier
- Active
- Trialing
- Past due
- Canceled
- At-risk status only where based on explicit rules
- Shops near plan limits
- Shops using very little of their paid plan

Do not infer churn using opaque models in V1.

## C7. Audit and Permissions

Platform Success must require SUPER_ADMIN or the exact existing
authorized administrative policy.

Administrative actions must use existing audit logging.

Do not expose private Growth Center contact data through general success
metrics.

---

# Part D — APIs

Audit existing analytics and admin endpoints first.

Prefer extending existing services.

Potential API structure:

Owner:

- GET /api/shops/:shopId/business-growth/overview
- GET /api/shops/:shopId/business-growth/health
- GET /api/shops/:shopId/business-growth/opportunities
- GET /api/shops/:shopId/plan-usage

Super Admin:

- GET /api/super-admin/platform-success/overview
- GET /api/super-admin/platform-success/shops
- GET /api/super-admin/platform-success/marketing
- GET /api/super-admin/platform-success/subscriptions

Exact route names must follow existing project conventions.

---

# Part E — Security

- All owner data must be shop-scoped.
- Staff access must use existing shop permissions.
- One shop may never access another shop's growth data.
- Platform Success must be server-authorized.
- Avoid exposing customer personal information in aggregates.
- Use privacy-conscious analytics.
- Do not store unnecessary derived personal data.
- Revenue must use authoritative sources.
- All plan enforcement must occur server-side.
- Do not create open redirects.
- Do not alter Stripe configuration.

---

# Part F — Tests

Required coverage:

- Owner can access own growth overview.
- Owner cannot access another shop.
- Authorized staff access follows explicit permissions.
- Unauthorized staff is denied.
- Shop Health calculation is deterministic.
- Shop Health components sum correctly.
- Missing optional data does not crash scoring.
- Growth opportunities link to valid routes.
- Seller plan display compatibility.
- Seller plan limits are enforced server-side.
- QR campaign limits are enforced where enabled.
- Free core seller access remains intact.
- Platform Success requires proper admin authorization.
- Platform Success aggregates do not expose private lead data.
- Revenue metrics avoid duplicate counting.
- Empty states work.
- Existing Marketing Center remains functional.
- Existing Buyer Phase 1 functionality remains functional.

---

# Part G — Definition of Done

- Existing architecture audited first.
- No duplicate dashboard systems.
- No duplicate plan system.
- No Stripe identifier or price changes.
- No migration applied without review.
- Backend authorization tested.
- Cross-shop isolation tested.
- Frontend routes reachable.
- Loading, empty, error, and populated states implemented.
- Shop Health is explainable.
- Metrics use real APIs.
- Build passes.
- Lint passes.
- Relevant tests pass.
- Core regression suite passes.
- Documentation updated.
- Git diff reviewed.

# PawnLoop Marketing Assets and Customer Engagement V1

## Purpose

PawnLoop must give every approved pawnshop practical marketing resources
that direct customers to the shop's specific PawnLoop storefront,
inventory, products, auctions, deals, and customer-intake experiences.

PawnLoop must also let customers follow shops and opt into relevant shop
updates while maintaining clear consent, pause, unsubscribe, privacy,
and notification-preference controls.

This phase builds on the existing:

- Owner Marketing Center
- Stable shop QR campaigns
- Shop slugs and storefront URLs
- SVG and PNG QR downloads
- Marketing campaign scan analytics
- Owner Business Growth
- Seller entitlements
- Buyer Workspace
- Buyer notification architecture
- Super Admin Platform Success

Do not create duplicate campaign, notification, subscription, shop,
buyer, permission, analytics, or referral systems.

---

# Part A — Printable Marketing Kit

## A1. Owner Marketing Assets

Add a Marketing Assets area under Owner Marketing Center.

Recommended owner navigation:

- Marketing Center
  - Overview
  - QR Codes
  - Campaigns
  - Printable Materials
  - Customer Growth
  - Referrals
  - Analytics

V1 may keep these as sections of the existing Marketing Center if
separate pages would produce shallow or duplicated functionality.

## A2. Required Templates

Create print-ready templates for:

1. Front-door poster
2. Window poster
3. "Store closed? Shop online 24/7" poster
4. Counter sign
5. Receipt insert
6. Business-card insert
7. Product display card
8. New-arrivals flyer
9. Auction flyer
10. Sell-or-pawn flyer
11. Review-request card
12. Referral card

Templates must support relevant shop information:

- Shop name
- Shop logo where available
- Shop address where appropriate
- Shop phone where appropriate
- Shop-specific PawnLoop URL
- Stable QR campaign
- Short link
- Call to action
- PawnLoop attribution
- Optional campaign placement label

## A3. Download Formats

Required V1 output:

- Print-ready PDF
- PNG preview where practical
- Existing SVG QR integration

PDF requirements:

- Standard page sizes
- Adequate margins
- Clear QR quiet zone
- High contrast
- Scannable print resolution
- No clipped text
- Safe filename
- Shop-scoped authorization
- No remote arbitrary image loading
- No arbitrary HTML or script injection

Preferred page sizes:

- US Letter
- Half-letter where appropriate
- 4x6 card where appropriate
- Business-card insert where practical

## A4. Template Data

Templates should render only data that currently exists.

Do not claim support for:

- Discounts that do not exist
- Financing that is not configured
- Store hours if missing
- Reviews if no authoritative review source exists
- Shipping if the shop does not support it
- Auctions if the shop cannot create auctions
- External social links that are not configured

## A5. Product Display Cards

Product cards should support:

- Public item title
- Public price
- Primary public image where safely available
- Item reference
- Shop name
- Item-specific QR campaign
- "Scan for details, photos, availability, and offers"

Requirements:

- Item must belong to the selected shop.
- Item must be public and available.
- Sold, deleted, hidden, or suspended items must not generate misleading
  live marketing cards.
- Existing campaign fallback rules must remain safe.

## A6. Marketing Asset Records

Audit whether persistent download records are needed.

If a new model is justified, keep it small and auditable:

- id
- shopId
- campaignId
- templateType
- format
- createdByUserId
- createdAt
- metadata with no unnecessary personal data

Do not store full generated PDF binary data in PostgreSQL.

Generated assets may be created on demand unless existing file-storage
architecture provides a safer reusable pattern.

---

# Part B — Follow Shop

## B1. Buyer Capability

Authenticated buyers should be able to:

- Follow a public active shop
- Unfollow a shop
- View followed shops
- See whether they follow a shop
- Manage notification preferences per followed shop
- Pause shop notifications without unfollowing
- View followed-shop activity in Buyer Workspace

Follow Shop must be separate from staff membership, shop ownership,
saved searches, and Growth Center leads.

## B2. Follow Shop Data

Audit existing favorite-shop or saved-shop support first.

Reuse it if suitable.

If no appropriate model exists, create a minimal relation supporting:

- userId
- shopId
- status
- newArrivalNotifications
- dealNotifications
- auctionNotifications
- generalShopNotifications
- pausedAt
- createdAt
- updatedAt
- unsubscribedAt where appropriate

Requirements:

- Unique buyer/shop relationship
- Cross-user isolation
- Soft unsubscribe or auditable state where appropriate
- Public active shops only
- No owner access to individual private buyer details beyond permitted
  aggregate counts

## B3. Public Storefront Actions

The public shop page should show:

- Follow Shop
- Following state
- Manage alerts
- Unfollow

Unauthenticated visitors may be asked to sign in or register, then return
to the shop page.

Do not silently subscribe visitors.

---

# Part C — Shop Alert Preferences

## C1. Alert Types

V1 shop-level preferences:

- New arrivals
- Deals or price reductions
- Auctions
- General shop announcements

Only alert types backed by real events should be marked available.

## C2. Consent

Requirements:

- Explicit opt-in
- Clear preference controls
- Pause
- Unsubscribe
- No preselected marketing consent
- No subscription through QR scan alone
- No email or SMS enrollment without appropriate channel consent
- Preserve existing transactional notifications
- Marketing unsubscribe must not disable order, payment, security, or
  account notifications

## C3. Delivery Foundation

V1 may create in-app notification events using the existing notification
architecture.

Email and SMS delivery must only be enabled if:

- Existing provider integration exists
- Channel consent is recorded
- Unsubscribe behavior exists
- Provider errors are handled
- Rate limiting exists
- Tests exist

Do not create uncontrolled bulk messaging.

## C4. Event Sources

Potential supported events:

- New public item created
- Public item price reduced
- Public auction created
- Auction approaching end
- Shop campaign announcement created through an approved workflow

Prevent duplicate notifications for repeated updates.

---

# Part D — Customer Growth Dashboard

## D1. Owner View

Add a Customer Growth section using privacy-conscious aggregate data.

Potential metrics:

- Total followers
- New followers in selected period
- Unfollows in selected period
- Followers with new-arrival alerts
- Followers with deal alerts
- Followers with auction alerts
- QR scans
- Campaign visits
- Follow conversions attributable to campaigns where defensible
- Saved-search matches involving shop inventory where available
- Messages
- Offers
- Buyer item submissions
- Repeat buyers where authoritative
- Notification events sent
- Notification engagement where supported

Do not expose individual buyer contact details.

## D2. Filters

Support where safe:

- Date range
- Shop
- Campaign
- Alert type
- Location where the architecture supports it

## D3. Action Recommendations

Examples:

- Create an active campaign.
- Add new inventory to engage followers.
- Promote a new auction.
- Add a placement label to improve attribution.
- Download a front-door poster.
- Encourage buyers to follow the shop.

Recommendations must be deterministic and based on actual data.

---

# Part E — Referral Attribution Foundation

## E1. Referral Types

Support auditable attribution for:

- Buyer refers buyer
- Shop refers buyer
- Shop refers pawnshop
- Platform campaign refers buyer
- Platform campaign refers pawnshop

Do not issue financial rewards in V1.

## E2. Referral Identity

Each applicable account may have:

- Stable referral code
- Stable referral link
- Referral type
- Active status
- Created date

Requirements:

- Non-guessable or collision-resistant codes
- No arbitrary external redirects
- Safe internal destinations
- Abuse controls
- Attribution expiration policy
- Self-referral prevention
- Duplicate-conversion handling

## E3. Referral Events

Potential events:

- Link opened
- Registration started
- Registration completed
- Buyer became active
- Buyer completed qualifying transaction
- Pawnshop application started
- Pawnshop approved
- Shop became live

V1 may implement only events backed by current workflows.

## E4. Referral Dashboard

Owners may see aggregate referral activity:

- Links created
- Visits
- Registrations
- Qualified conversions
- Pending policy status
- Reward status displayed as unavailable unless reward rules exist

Super Admin may see platform-wide attribution and suspected abuse.

---

# Part F — Super Admin Marketing Administration

## F1. Navigation

Add:

- Marketing Administration
  - Overview
  - Campaigns
  - Templates
  - Customer Engagement
  - Referrals
  - Adoption
  - Safety

V1 may use one consolidated page.

## F2. Platform Marketing Metrics

Use real aggregate data:

- Shops with permanent QR campaigns
- Shops with active campaigns
- Shops with printable asset downloads
- Campaign count
- Active campaign count
- Total scans
- Scans by destination type
- Followed shops
- Followers
- Alert subscriptions by type
- Referral links
- Referral conversions
- Shops with no marketing setup
- Shops with inactive campaigns

## F3. Campaign Administration

Super Admin should be able to:

- Search campaigns
- Filter by shop
- Filter by destination
- Filter active/inactive
- View scan count
- View campaign placement
- Disable abusive or misleading campaigns
- Review audit history

Campaign disabling is a mutation and must be audited.

Do not allow Super Admin to silently alter an owner's destination without
a clear audited workflow.

## F4. Template Administration

V1 template administration may support:

- Enable or disable platform templates
- Template name
- Template type
- Supported format
- Minimum plan
- Active status
- Version
- Default call to action

Do not build arbitrary user-authored HTML templates in V1.

Templates should be code-owned or configuration-owned to reduce security
risk.

## F5. Safety

Support:

- Disable abusive campaign
- Disable unsafe referral code
- Review unusual scan or referral activity
- Preserve audit trail
- Avoid exposing private buyer data
- Avoid exposing Growth Center contact data

---

# Part G — Seller Plan Entitlements

Use the centralized seller entitlement service.

Recommended V1 access:

## Free

- Permanent storefront QR
- Basic storefront poster
- Counter sign
- Basic scan count
- Basic Follow Shop support
- One active default campaign
- Basic follower aggregate

## Pro

- Everything in Free
- Up to 10 active campaigns
- Product display cards
- New-arrivals flyer
- Auction flyer
- Sell-or-pawn flyer
- Basic Customer Growth metrics
- Referral attribution foundation
- Shop alerts

## Plus

Internal code may remain PREMIUM.

- Everything in Pro
- Unlimited campaigns
- Full printable template library
- Advanced Customer Growth filters
- Campaign attribution
- Referral dashboard
- Multi-location eligibility
- Advanced marketing analytics eligibility

## Ultra

- Everything in Plus
- Corporate campaign reporting
- Cross-location marketing analytics
- Custom template eligibility
- Enterprise referral reporting
- Advanced administration and API eligibility

Do not change existing configured prices or Stripe identifiers.

Backend must enforce plan access.

---

# Part H — Buyer Plan Entitlements

Core Follow Shop should remain available to Free buyers.

Recommended buyer access:

## Free

- Follow shops
- Basic new-arrival alerts
- Manage preferences
- Unfollow
- View followed shops

## Pro

- Advanced shop alerts
- Faster eligible alert processing
- More alert filtering
- Followed-shop workspace widgets

## Plus

- Advanced alert combinations
- Collection and followed-shop integrations when implemented
- Enhanced price and availability intelligence eligibility

## Ultra

- Advanced personalized alert eligibility
- Concierge integrations when implemented

Do not block Free users from following shops.

---

# Part I — APIs

Audit route conventions first.

Potential owner APIs:

- GET /api/shops/:shopId/marketing/assets/templates
- GET /api/shops/:shopId/marketing/assets/:templateType.pdf
- POST /api/shops/:shopId/marketing/assets/render
- GET /api/shops/:shopId/customer-growth
- GET /api/shops/:shopId/referrals

Potential buyer APIs:

- POST /api/shops/:shopId/follow
- DELETE /api/shops/:shopId/follow
- GET /api/shops/:shopId/follow-status
- PATCH /api/shops/:shopId/follow-preferences
- GET /api/followed-shops

Potential Super Admin APIs:

- GET /api/super-admin/marketing-administration
- GET /api/super-admin/marketing-campaigns
- PATCH /api/super-admin/marketing-campaigns/:campaignId/status

Exact paths must follow existing project patterns.

---

# Part J — Security

- All owner asset generation must be shop-scoped.
- Staff permissions must use existing shop-access rules.
- Public assets may include only public shop/item information.
- Buyer follow data must be user-scoped.
- Owners receive aggregates, not private follower identity.
- Super Admin access must be server-authorized.
- No arbitrary external redirects.
- No arbitrary HTML execution.
- Sanitize printable text.
- Restrict remote image loading.
- Rate-limit referral and public attribution endpoints.
- Protect against self-referral.
- Respect marketing consent and unsubscribe.
- Preserve transactional notifications.
- Audit administrative campaign disabling.

---

# Part K — Tests

Required coverage:

1. Owner can generate asset for own shop.
2. Owner cannot generate asset for another shop.
3. Staff asset access follows permissions.
4. Public item validation for product cards.
5. PDF response has correct type and safe filename.
6. QR remains linked to the correct shop or item.
7. Free seller template entitlement.
8. Pro/Plus/Ultra template entitlements.
9. Buyer can follow active shop.
10. Buyer cannot follow deleted or inactive shop.
11. Follow operation is idempotent.
12. Cross-user follow isolation.
13. Unfollow and pause behavior.
14. Alert preference consent defaults to off where appropriate.
15. Marketing unsubscribe preserves transactional notifications.
16. Owner follower metrics are aggregate-only.
17. Referral self-attribution is rejected.
18. Referral duplicate conversion is idempotent.
19. Super Admin marketing authorization.
20. Campaign disable action is audited.
21. Existing Marketing Center tests pass.
22. Existing Owner Growth tests pass.
23. Existing Buyer entitlement tests pass.
24. Existing core suite passes.

---

# Part L — Definition of Done

- Existing notification, marketing, shop, buyer, and referral architecture
  is audited first.
- No duplicate systems are created.
- Printable PDF assets are scannable and authorized.
- Follow Shop works end-to-end.
- Consent and unsubscribe rules are explicit.
- Owner metrics are aggregate-only.
- Referral foundation is auditable.
- Super Admin controls are authorized and audited.
- Plan enforcement is server-side.
- No Stripe identifiers or prices change.
- No financial rewards are issued.
- Loading, empty, error, and populated states exist.
- Tests pass.
- Build passes.
- Lint passes.
- Documentation is updated.
- Git diff is reviewed.

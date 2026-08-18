# Launch-Scope Decision Record

Status: **PENDING BUSINESS DECISION AND COUNSEL APPROVAL**

Counsel cannot approve an undefined product. Complete this record before requesting final document approval. Every enabled flow must have a corresponding document, operating procedure, test, owner, provider configuration, and evidence record.

## 1. Entity and public identity

- Contracting entity: `Bealtair LLC — OWNER SUPPLIED; PENDING COUNSEL CONFIRMATION`
- Assumed/brand name: `PawnLoop, operated by Bealtair LLC — OWNER APPROVED; ASSUMED-NAME REVIEW PENDING`
- Legal address: `OWNER SUPPLIED; RESTRICTED; PUBLICATION NOT AUTHORIZED`
- Legal notice email: `OWNER SUPPLIED; RESTRICTED; ROLE-BASED PUBLIC ADDRESS REQUIRED`
- Privacy request contact: `OWNER SUPPLIED; RESTRICTED; ROLE-BASED PUBLIC ADDRESS REQUIRED`
- Support contact: `OWNER SUPPLIED; RESTRICTED; ROLE-BASED PUBLIC ADDRESS REQUIRED`
- Public business phone: `713-299-8847 — OWNER AUTHORIZED FOR PUBLICATION`
- Service-of-process method: `PENDING REGISTERED-AGENT RECORD`
- Tax registrations/accounts: `OWNER REPORTS COMPLETE; ACCOUNT NUMBERS MUST REMAIN RESTRICTED; TAX REVIEW PENDING`
- Insurance carrier/policies/limits: `NO COVERAGE REPORTED; COUNSEL/RISK DECISION REQUIRED`

## 2. Geography and eligibility

| Decision | Proposed value | Counsel decision | Required evidence | Owner |
|---|---|---|---|---|
| Initial country | United States | PENDING COUNSEL REVIEW | Jurisdiction memo | Business/Legal |
| Initial state(s)/localities | Texas transactions; initial shops in the Houston area | PENDING COUNSEL REVIEW | Pawn/secondhand/auction matrix | Business/Legal |
| Customer residency restrictions | Nationwide browsing; Texas-only transactional beta | PENDING COUNSEL REVIEW | Geolocation/address enforcement test | Product/Legal |
| Shop licensing requirements | Verified Texas/local licensing and authority before entry | PENDING COUNSEL REVIEW | Verified license and authority record | Onboarding/Legal |
| Minimum customer age | 18 proposed | PENDING COUNSEL REVIEW | Age policy and enforcement test | Product/Legal |
| Cross-border/interstate behavior | International transactions and unapproved interstate regulated flows deferred | PENDING COUNSEL REVIEW | Approved boundaries | Product/Legal |

## 3. Product and transaction scope

Set each row to `ENABLED`, `READ-ONLY`, `CONTROLLED TEST ONLY`, or `DEFERRED`.

| Flow | Proposed status | Money movement? | Regulated/special concern | Required legal documents | Business owner | Counsel decision |
|---|---|---:|---|---|---|---|
| Public marketplace browsing | ENABLED | No | Privacy, advertising accuracy | Terms, Privacy | Product | PENDING |
| Buyer registration/accounts | ENABLED | No | Age, identity, privacy | Terms, Privacy | Product | PENDING |
| Pawn-shop application/onboarding | ENABLED | Possible | Licensing, authority, KYC | Shop agreement | Onboarding | PENDING |
| Fixed-price retail sales | CONTROLLED TEST ONLY | Yes | Payments, tax, refunds | Buyer and seller terms | Product/Finance | PENDING |
| Offers/negotiated sales | CONTROLLED TEST ONLY | Yes | Formation, cancellation | Marketplace terms | Product | PENDING |
| Auctions | CONTROLLED TEST ONLY | Yes | Bid enforceability, errors | Auction rules | Product | PENDING |
| Customer sell submissions | CONTROLLED TEST ONLY | Possible | Estimates versus binding offers | Sell submission terms | Product | PENDING |
| Customer pawn submissions | DEFERRED UNTIL TEXAS COUNSEL APPROVAL | Possible | Pawn/lending laws | Pawn submission and jurisdiction terms | Product/Legal | PENDING |
| Buyer subscriptions | CONTROLLED TEST ONLY | Yes | Auto-renewal | Subscription terms | Product/Finance | PENDING |
| Seller subscriptions | CONTROLLED TEST ONLY | Yes | Auto-renewal/commercial terms | Shop/subscription terms | Product/Finance | PENDING |
| Shop payouts/Stripe Connect | CONTROLLED TEST ONLY | Yes | KYC, reserves, reconciliation | Payment/payout disclosures | Finance | PENDING |
| Buyer/shop messaging | CONTROLLED TEST ONLY | No | Moderation, privacy | Messaging policy | Trust & Safety | PENDING |
| Image upload/OCR/AI descriptions | CONTROLLED TEST ONLY | No | IP, privacy, accuracy | Image/AI policy | Product/Privacy | PENDING |
| CSV inventory import | CONTROLLED TEST ONLY | No | Data ownership/security | Shop agreement, data policy | Product/Security | PENDING |
| Shop-to-shop/dealer transactions | DEFERRED UNLESS APPROVED | Yes | Commercial/dealer laws | Separate dealer terms | PENDING | PENDING |
| Layaway | DEFERRED UNLESS APPROVED | Yes | Installment/consumer law | Separate approved terms | PENDING | PENDING |
| Live video auctions | DEFERRED UNLESS APPROVED | Yes | Auction/content laws | Updated auction/content terms | PENDING | PENDING |

## 4. Merchandise scope

- Generally allowed categories: `Jewelry, precious metals, tools, consumer electronics, musical instruments, collectibles, non-weapon sporting goods and ordinary household merchandise — OWNER APPROVED; COUNSEL REVIEW PENDING`
- Prohibited categories: `Recalled or hazardous goods, stolen or suspected counterfeit goods, controlled substances, government IDs and goods exposing personal data — COUNSEL REVIEW PENDING`
- Restricted categories requiring special review: `High-value jewelry/luxury goods, serial-numbered electronics and vehicles — manual review proposed; COUNSEL REVIEW PENDING`
- Firearms/weapons/ammunition: `DEFERRED UNTIL EXPRESS COUNSEL, PROCESSOR AND OPERATING APPROVAL`
- Alcohol/tobacco/controlled substances: `DEFERRED UNTIL EXPRESS COUNSEL, PROCESSOR AND OPERATING APPROVAL`
- Hazardous/recalled goods: `DEFERRED UNLESS EXPRESSLY APPROVED`
- Government IDs, gift cards, financial instruments and personal data: `DEFERRED UNTIL EXPRESS COUNSEL, PROCESSOR AND OPERATING APPROVAL`
- Stolen/counterfeit/suspected goods response: see operating procedure; `PENDING COUNSEL REVIEW`
- Geographic/category enforcement mechanism and negative tests: `PENDING`

## 5. Money-flow and responsibility allocation

For each enabled money flow, identify:

- merchant/seller of record;
- payment processor and account type;
- party setting price and taxes;
- platform fee and commission;
- processor fees and allocation;
- authorization/capture timing;
- refund/return decision owner;
- chargeback evidence owner and loss allocation;
- payout timing, reserve and hold authority;
- abandoned/unclaimed funds treatment;
- reconciliation owner and frequency;
- information reporting/withholding owner; and
- exact terms/disclosures shown before authorization.

No money flow may be enabled with an unassigned responsibility.

Owner-accepted proposal for counsel and processor review:

- Seller/shop pays processing fees when permitted and clearly disclosed.
- The shop decides ordinary refunds under the approved platform policy; PawnLoop may intervene for fraud, legal obligations, policy violations or verified platform errors.
- The shop bears chargeback loss arising from merchandise, fulfillment, authorization or shop conduct; PawnLoop bears loss caused solely by a verified PawnLoop system error.
- New-shop payouts use a seven-day delay during the controlled beta. Reduction to T+2/T+3 requires accepted reconciliation and risk history.
- Holds/reserves must be risk-based, documented, time-bounded where practicable and consistent with the exact Stripe Connect configuration.
- Finance performs daily payment, fee, refund, dispute, transfer and payout reconciliation. Any unexplained variance triggers suspension and escalation.
- Exact loss liability remains pending confirmation of direct charges, destination charges or separate charges and transfers.

## 6. Controlled-beta caps and stop rules

| Control | Approved value | Owner | Evidence / enforcement | Stop threshold |
|---|---|---|---|---|
| Maximum participating shops | 5 | Business/Onboarding | Eligibility roster and enforcement | Any sixth shop without renewed approval |
| Maximum invited users | 250 | Business/Product | Invitation and active-user report | Any 251st invited user without renewed approval |
| Maximum completed transactions per day | 25 | Finance/Product | Daily transaction report | Any 26th transaction without renewed approval |
| Maximum transaction amount | $2,500 | Finance | Checkout/server-side enforcement | Any attempted higher transaction |
| Daily platform volume | $10,000 | Finance | Daily reconciliation | Any attempted volume above cap |
| Payout delay/hold | Seven-day new-shop delay during beta; risk-based documented holds | Finance | Stripe configuration and reconciliation | Unauthorized or unexplained release/hold |
| Refund/dispute threshold | Review at 3 disputes or 0.75% rolling 30 days; suspension review at 1% | Finance/Trust & Safety | Dispute dashboard and case records | Threshold or suspected coordinated fraud |
| Support coverage hours | 8:00 a.m.–7:00 p.m. Central, Monday–Sunday | Support | Published coverage and roster | Uncovered required shift |
| Incident/error threshold | Pause on critical security, safety, legal, payment, reconciliation or control-bypass event | Incident commander | Alert/case/decision record | Any listed critical event |
| Unexplained reconciliation variance | `0 unless expressly approved` | Finance | Daily reconciliation | Any unexplained variance |
| Beta observation period | 60 days | Business/Product | Start/end record and review | Expansion before accepted review |

## 7. Explicitly disabled or deferred behavior

Record every unavailable feature in public documentation, configuration, UI, API capability responses, support scripts, and test scope. Deferred features must fail closed and must not be marketed as available.

The accepted initial deferral list includes international transactions, unapproved interstate regulated flows, customer pawn transactions pending Texas counsel approval, shop-to-shop transactions, layaway, live-video auctions, firearms/weapons/ammunition, alcohol/tobacco, gift cards/financial instruments and other categories identified above.

## 8. Required approvals

- Executive/business owner: `DESIGNATED; IDENTITY RESTRICTED`
- Product owner: `DESIGNATED; IDENTITY RESTRICTED`
- Counsel: `PENDING`
- Privacy owner: `DESIGNATED; IDENTITY RESTRICTED`
- Security owner: `DESIGNATED; IDENTITY RESTRICTED`
- Finance/payments owner: `DESIGNATED; IDENTITY RESTRICTED`
- Support/operations owner: `DESIGNATED; IDENTITY RESTRICTED`
- Release owner: `DESIGNATED; IDENTITY RESTRICTED`
- Decision, conditions, evidence IDs and UTC: `PENDING`

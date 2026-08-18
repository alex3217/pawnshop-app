# Counsel Document Matrix

Status: **DRAFT — ALL APPROVALS PENDING UNLESS RECORDED WITH EXACT VERSIONED EVIDENCE**

For every row, counsel must identify the approved version, jurisdictions, enabled product scope, required changes, effective date, publication/assent locations, and evidence ID. Product and engineering must not infer approval from a draft page already existing in the application.

| ID | Document or decision artifact | Beta requirement | Primary owner | Required reviewer(s) | Current status | Exact version / SHA | Publication, assent, or operating point | Approval evidence ID |
|---|---|---:|---|---|---|---|---|---|
| LEG-001 | Legal entity and public identity record | Yes | Executive | Counsel, Finance | PENDING COUNSEL REVIEW | PENDING | Footer, invoices, notices, processor accounts | PENDING |
| LEG-002 | Terms of Service | Yes | Legal/Product | Counsel | PENDING COUNSEL REVIEW | PENDING | Registration, account settings, footer | PENDING |
| LEG-003 | Privacy Policy | Yes | Privacy/Product | Counsel, Security | PENDING COUNSEL REVIEW | PENDING | Registration, notices at collection, footer | PENDING |
| LEG-004 | Notice at collection and state privacy disclosures | Yes | Privacy | Counsel | PENDING COUNSEL REVIEW | PENDING | Each relevant collection point | PENDING |
| LEG-005 | Cookie, analytics, advertising, and Global Privacy Control policy | Scope-dependent | Privacy/Marketing | Counsel, Security | PENDING COUNSEL REVIEW | PENDING | Web consent/preferences | PENDING |
| LEG-006 | Pawn-shop/seller agreement | Yes | Business/Product | Counsel, Finance | PENDING COUNSEL REVIEW | PENDING | Shop application and activation | PENDING |
| LEG-007 | Buyer/marketplace transaction terms | Transactional beta | Product | Counsel, Finance | PENDING COUNSEL REVIEW | PENDING | Checkout, offers, settlement | PENDING |
| LEG-008 | Auction rules | If auctions enabled | Product | Counsel, Finance | PENDING COUNSEL REVIEW | PENDING | Auction creation, bidding, winning | PENDING |
| LEG-009 | Sell/pawn submission terms | If submissions enabled | Product | Counsel | PENDING COUNSEL REVIEW | PENDING | Submission and offer acceptance | PENDING |
| LEG-010 | Pawn/lending jurisdiction matrix | If pawn flows enabled | Legal/Compliance | Counsel | PENDING COUNSEL REVIEW | PENDING | Operational eligibility gate | PENDING |
| LEG-011 | Prohibited, restricted, stolen, counterfeit, and recalled item policy | Yes | Trust & Safety | Counsel, Operations | PENDING COUNSEL REVIEW | PENDING | Listing, intake, moderation | PENDING |
| LEG-012 | Refund, return, cancellation, dispute, chargeback, and risk-of-loss policy | Transactional beta | Finance/Support | Counsel, Payments | PENDING COUNSEL REVIEW | PENDING | Checkout and support | PENDING |
| LEG-013 | Seller subscription and automatic-renewal terms | If seller plans enabled | Product/Finance | Counsel | PENDING COUNSEL REVIEW | PENDING | Plan selection and confirmation | PENDING |
| LEG-014 | Buyer subscription and automatic-renewal terms | If buyer plans enabled | Product/Finance | Counsel | PENDING COUNSEL REVIEW | PENDING | Plan selection and confirmation | PENDING |
| LEG-015 | Payment authorization, processor, payout, and reserve disclosures | Transactional beta | Finance | Counsel, Payments | PENDING COUNSEL REVIEW | PENDING | Checkout, Connect, payout | PENDING |
| LEG-016 | Tax responsibility and marketplace-facilitator decision | Transactional beta | Finance | Tax counsel/accountant | PENDING COUNSEL REVIEW | PENDING | Agreements and reconciliation | PENDING |
| LEG-017 | Identity, age, authority, KYC/AML, OFAC, and sanctions responsibility matrix | Scope-dependent | Compliance | Counsel, Payments | PENDING COUNSEL REVIEW | PENDING | Onboarding and transaction gates | PENDING |
| LEG-018 | Data inventory, retention, deletion, legal hold, and backup schedule | Yes | Privacy/Security | Counsel | PENDING COUNSEL REVIEW | PENDING | Data lifecycle operations | PENDING |
| LEG-019 | Privacy-rights request and appeal procedure | Yes | Privacy/Support | Counsel, Security | PENDING COUNSEL REVIEW | PENDING | Public privacy contact and case system | PENDING |
| LEG-020 | Security incident and breach legal-response procedure | Yes | Security/Privacy | Counsel, Insurer | PENDING COUNSEL REVIEW | PENDING | Incident response | PENDING |
| LEG-021 | Vendor inventory, DPA, subprocessors, and international transfer record | Yes | Security/Privacy | Counsel, Finance | PENDING COUNSEL REVIEW | PENDING | Vendor governance | PENDING |
| LEG-022 | Image upload, OCR, geolocation, and AI-assisted content policy | If enabled | Product/Privacy | Counsel, Security | PENDING COUNSEL REVIEW | PENDING | Upload and generation workflows | PENDING |
| LEG-023 | Messaging, reporting, blocking, moderation, and appeals policy | If messaging enabled | Trust & Safety | Counsel, Support | PENDING COUNSEL REVIEW | PENDING | Messaging and moderation | PENDING |
| LEG-024 | DMCA, copyright, trademark, and repeat-infringer procedure | Yes for user content | Legal/Trust & Safety | Counsel | PENDING COUNSEL REVIEW | PENDING | Public reporting channel | PENDING |
| LEG-025 | Law-enforcement, subpoena, preservation, and emergency request procedure | Yes | Legal/Privacy | Counsel, Security | PENDING COUNSEL REVIEW | PENDING | Restricted legal intake | PENDING |
| LEG-026 | Accessibility statement and accommodation process | Yes | Accessibility/Support | Counsel, QA | PENDING COUNSEL REVIEW | PENDING | Footer and support | PENDING |
| LEG-027 | Electronic records, signatures, consent withdrawal, and record access | Scope-dependent | Product/Legal | Counsel | PENDING COUNSEL REVIEW | PENDING | Registration and binding transactions | PENDING |
| LEG-028 | Marketing communications consent and opt-out policy | If marketing enabled | Marketing/Privacy | Counsel | PENDING COUNSEL REVIEW | PENDING | Campaign enrollment and preferences | PENDING |
| LEG-029 | Beta participation, caps, suspension, offboarding, and confidentiality terms | Yes | Business/Operations | Counsel, Support | PENDING COUNSEL REVIEW | PENDING | Beta shop onboarding | PENDING |
| LEG-030 | Insurance, limitation of liability, warranty disclaimer, indemnity, dispute resolution, governing law, and venue decision | Yes | Executive/Legal | Counsel, Insurer | PENDING COUNSEL REVIEW | PENDING | Terms and commercial agreements | PENDING |

## Version-control requirements

For each approved document, record:

- canonical title and document ID;
- semantic version and repository commit SHA;
- counsel reviewer, scope and decision date;
- effective date and superseded version;
- approved jurisdictions, roles, categories and features;
- required contextual links and assent events;
- re-consent trigger and grace period;
- retention period for document and assent evidence;
- public URL or restricted operating location; and
- amendment owner and next review condition/date.

## Publication and assent verification

Before launch, QA must verify against the exact candidate:

- the correct document version is rendered at every required decision point;
- links are accessible before acceptance;
- acceptance is affirmative where required and cannot be preselected;
- document ID/version, actor, timestamp, jurisdiction/context and acceptance result are retained;
- refusal and withdrawal paths fail safely;
- re-consent occurs when the approved policy requires it;
- archived versions remain retrievable by authorized personnel; and
- screen-reader, keyboard, zoom, contrast and mobile behavior are acceptable.


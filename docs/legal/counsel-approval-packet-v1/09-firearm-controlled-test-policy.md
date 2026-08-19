# Firearm Controlled-Test Merchandise Policy

Status: **OWNER-APPROVED CONTROLLED-TEST PROPOSAL — COUNSEL, STRIPE, AND OPERATING APPROVALS PENDING — NOT ACTIVE**

This policy records the owner's proposed boundary for a future firearm controlled test. It does not authorize firearm listings, reservations, payments, transfers, deployment, configuration changes, or launch. Firearms are `CONTROLLED TEST ONLY`, not permanently prohibited. Activation requires written counsel approval, completed operating evidence, and every approval identified below.

## Scope boundary

- Initial firearm activity is limited to Texas.
- Participating sellers must be verified pawnshops holding a current Federal Firearms License of Type 01 or Type 02 and all required state/local authority.
- Firearm buyers must be at least 21 years old. This firearm-specific minimum applies even if another PawnLoop flow permits a younger user.
- Public browsing, reservation, and shop-contact features may be enabled only after counsel and operating approval.
- A reservation is not a sale, transfer approval, background-check result, or promise that the buyer may receive the firearm.
- Physical transfer must occur through the selling FFL or an approved receiving FFL.
- No firearm may be shipped directly to a consumer.
- Customer-to-customer firearm listings, reservations, sales, shipments, or transfers are prohibited.
- Ammunition, suppressors, NFA firearms, destructive devices, and other specially regulated weapons or items remain deferred and outside this controlled test.

## FFL responsibility and PawnLoop data boundary

The transferring FFL—not PawnLoop—is responsible for buyer identification, eligibility determination, ATF Form 4473, NICS or other required background-check process, acquisition/disposition records, waiting periods, transfer denial, and applicable federal, state, local, or law-enforcement reporting.

PawnLoop must not request, receive, upload, image, parse, store, transmit, or retain Form 4473 or NICS records, responses, transaction numbers, denial reasons, government-identification images, or equivalent background-check records. PawnLoop may retain only the minimum counsel-approved compliance attestations needed to show that:

- the participating shop's Type 01 or Type 02 FFL was verified and current at the relevant time;
- the buyer attested to being 21 or older;
- the transfer occurred through the identified selling or receiving FFL, or did not occur;
- the FFL attested that its required transfer process was completed before release; and
- the attestation actor, UTC timestamp, listing/reservation reference, policy version, and exception/suspension status are auditable.

The approved data schema, retention period, access roles, correction procedure, legal-hold treatment, and deletion process for these attestations remain pending counsel and privacy approval. Attestations must not encode Form 4473 answers, NICS details, protected-class information, or a reason for denial.

## Firearm payments

Stripe payment collection, PaymentIntents, Checkout, Stripe Connect charges/transfers, application/platform fees, refunds, and payouts for firearm transactions must remain disabled. They may be considered only after PawnLoop receives written Stripe approval that expressly covers PawnLoop, the applicable Stripe Connect architecture, each participating shop category, platform fees, and firearm transactions. Counsel and Finance must review the written approval and exact configuration before any payment test.

Until those approvals exist, PawnLoop must not imply that a firearm reservation is prepaid, paid, guaranteed, or financially binding. Any shop-side payment outside PawnLoop remains subject to counsel-approved disclosures and must not be represented as processed or protected by PawnLoop.

## Required activation approvals

- Written counsel approval for the exact Texas geography, Type 01/02 FFL eligibility, buyer age, browsing/reservation/contact flow, disclosures, transfer procedure, attestations, retention, incident handling, and deferred categories.
- Business/Product approval of the exact cohort, caps, feature flags, stop criteria, and public/support language.
- Compliance/Operations approval of FFL verification, listing review, transfer attestation, suspension, audit, and training procedures.
- Privacy/Security approval of data minimization, access, audit, retention, deletion, incident, and negative-test evidence.
- Written Stripe approval and Finance approval before any firearm payment capability is enabled.
- Release/QA approval that UI and API controls fail closed outside the approved cohort, geography, category, age, shop, transfer, and payment boundaries.

Any material change to geography, eligible FFL types, buyer age, transfer method, payment architecture, regulated-item scope, data collection, or provider terms requires renewed review and approval.

## Required public and contextual disclosures

Approved language must clearly state that browsing or reservation does not establish legal eligibility, complete a purchase, guarantee availability, or authorize transfer; transfer occurs only through an FFL; the FFL controls identification and required records/checks; direct-to-consumer shipping and customer-to-customer transactions are unavailable; and regulated subcategories and PawnLoop firearm payments are disabled.

## Counsel and Stripe approval checklist

- [ ] Counsel approves the exact Texas-only controlled-test scope and confirms firearms are controlled-test merchandise rather than permanently prohibited.
- [ ] Counsel approves Type 01/02 FFL eligibility, verification sources, reverification cadence, agreements, disclosures, buyer age 21+, and reservation/contact boundaries.
- [ ] Counsel approves FFL-only physical transfer, no direct-to-consumer shipping, no customer-to-customer transactions, and the complete deferred-category list.
- [ ] Counsel and Privacy approve the minimum transfer attestation fields, access roles, retention, deletion, correction, incident, preservation, and legal-hold rules.
- [ ] Counsel approves the listing review, transfer attestation, incident/suspension, appeal, reactivation, training, and public/support procedures.
- [ ] Written Stripe approval expressly identifies PawnLoop, the applicable Stripe Connect architecture, participating shop categories, platform/application fees, and firearm transactions.
- [ ] Finance and Counsel approve the exact written Stripe scope, account configuration, charge/transfer/refund/payout model, restrictions, monitoring, and renewal/review trigger.
- [ ] Security/QA evidence proves all firearm payment paths remain disabled until the preceding approvals are accepted.
- [ ] Approval evidence IDs, reviewers, authority, exact document/configuration versions, UTC dates, conditions, expiration, and next-review triggers are recorded in the evidence register and sign-off record.

Any unchecked item is blocking. General Stripe approval, a connected shop's own Stripe account, silence from Stripe, or counsel review of a different product scope is not approval for firearm payments or activation.

## Current disposition

`NO-GO / NOT ACTIVE`. No firearm capability may be enabled based on this document alone.

import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "July 28, 2026";

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-page__container">
        <header className="legal-page__header">
          <span className="legal-page__eyebrow">Legal</span>
          <h1>Privacy Policy</h1>
          <p>Effective date: {EFFECTIVE_DATE}</p>

          <div className="legal-page__notice" role="note">
            <strong>Draft for legal review:</strong> This policy must be reviewed
            and approved by a qualified attorney before PawnLoop launches
            publicly. Final company contact information and state-specific
            disclosures must also be added.
          </div>
        </header>

        <section aria-labelledby="privacy-introduction">
          <h2 id="privacy-introduction">1. Introduction</h2>
          <p>
            This Privacy Policy explains how PawnLoop collects, uses, stores,
            discloses, and protects personal information when you use its
            websites, applications, marketplace services, payment features,
            messaging tools, item-intake features, and related services.
          </p>
          <p>
            By using PawnLoop, you acknowledge the practices described in this
            policy. Your use of PawnLoop is also governed by our{" "}
            <Link to="/terms">Terms of Service</Link>.
          </p>
        </section>

        <section aria-labelledby="privacy-scope">
          <h2 id="privacy-scope">2. Scope</h2>
          <p>
            This policy applies to buyers, sellers, pawn shop owners and staff,
            dealers, visitors, and other users of PawnLoop.
          </p>
          <p>
            It does not govern independently operated websites, services, or
            businesses that may be linked to or integrated with PawnLoop.
            Participating shops may have separate legal obligations and privacy
            policies governing information they collect directly.
          </p>
        </section>

        <section aria-labelledby="privacy-information">
          <h2 id="privacy-information">3. Information we collect</h2>

          <h3>Account and contact information</h3>
          <p>This may include:</p>
          <ul>
            <li>Name, email address, telephone number, and mailing address.</li>
            <li>Username, password, account role, and communication preferences.</li>
            <li>Profile images and other account information you provide.</li>
          </ul>

          <h3>Identity and business-verification information</h3>
          <p>This may include:</p>
          <ul>
            <li>Date of birth, age confirmation, and identity-verification results.</li>
            <li>
              Government-issued identification when required for verification,
              regulated transactions, fraud prevention, or legal compliance.
            </li>
            <li>
              Business name, location, licenses, tax information, ownership
              information, staff roles, and shop contact information.
            </li>
            <li>
              Payment-account or payout-verification information collected by
              PawnLoop or its payment providers.
            </li>
          </ul>

          <h3>Listings and item-intake information</h3>
          <p>This may include:</p>
          <ul>
            <li>
              Item titles, descriptions, categories, prices, condition, history,
              and ownership information.
            </li>
            <li>Photographs, videos, receipts, documents, and appraisal details.</li>
            <li>
              Barcodes, UPCs, QR codes, serial numbers, model numbers, and
              identifying marks.
            </li>
            <li>
              Information extracted through optical character recognition,
              barcode scanning, or AI-assisted tools.
            </li>
            <li>
              Duplicate-item, ownership, authenticity, fraud, or stolen-item
              review results.
            </li>
          </ul>

          <h3>Transaction and payment information</h3>
          <p>This may include:</p>
          <ul>
            <li>
              Listings, bids, offers, purchases, pawn submissions, reservations,
              refunds, disputes, and transaction history.
            </li>
            <li>
              Billing, subscription, commission, fee, payout, and settlement
              records.
            </li>
            <li>
              Pickup, shipping, carrier, tracking, fulfillment, and delivery
              information.
            </li>
            <li>
              Payment status and limited payment-method details received from
              payment processors.
            </li>
          </ul>
          <p>
            PawnLoop may use third-party payment processors. PawnLoop generally
            does not receive or store complete payment-card numbers when those
            details are collected directly by a payment processor.
          </p>

          <h3>Communications and support information</h3>
          <p>This may include:</p>
          <ul>
            <li>Messages exchanged between marketplace participants.</li>
            <li>Support requests, reports, complaints, reviews, and survey responses.</li>
            <li>
              Records of communications with PawnLoop or participating shops.
            </li>
          </ul>

          <h3>Location information</h3>
          <p>
            PawnLoop may collect a location you enter, shop locations, shipping
            addresses, approximate location derived from an IP address, or
            device location when you give permission.
          </p>
          <p>
            Location information may be used to show nearby items, shops,
            services, pickup options, local price comparisons, and relevant
            marketplace results.
          </p>

          <h3>Device and usage information</h3>
          <p>This may include:</p>
          <ul>
            <li>IP address, browser type, device type, and operating system.</li>
            <li>Device identifiers, session identifiers, and authentication events.</li>
            <li>
              Pages viewed, searches, clicks, referring pages, feature usage, and
              access times.
            </li>
            <li>
              Crash reports, performance information, security logs, and
              diagnostic data.
            </li>
          </ul>

          <h3>Derived information</h3>
          <p>
            PawnLoop may generate inferences or recommendations from information
            it collects, such as estimated item values, suggested descriptions,
            search rankings, fraud indicators, saved-search matches, or
            marketplace recommendations.
          </p>
        </section>

        <section aria-labelledby="privacy-sources">
          <h2 id="privacy-sources">4. Sources of information</h2>
          <p>PawnLoop may collect information:</p>
          <ul>
            <li>Directly from you.</li>
            <li>Automatically from your browser or device.</li>
            <li>From buyers, sellers, shops, dealers, and authorized staff.</li>
            <li>
              From payment, identity-verification, shipping, mapping, storage,
              communication, analytics, and security providers.
            </li>
            <li>
              From public records, government sources, fraud-prevention sources,
              and legally available databases.
            </li>
            <li>
              From other people when they communicate with you, report activity,
              or participate in a transaction involving you.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-use">
          <h2 id="privacy-use">5. How we use information</h2>
          <p>PawnLoop may use personal information to:</p>
          <ul>
            <li>Create, maintain, verify, and secure accounts.</li>
            <li>Operate marketplace, auction, offer, pawn, and dealer features.</li>
            <li>Process payments, subscriptions, fees, refunds, and payouts.</li>
            <li>Support pickup, shipping, tracking, and fulfillment.</li>
            <li>Display nearby shops, items, prices, and marketplace activity.</li>
            <li>
              Provide scanning, OCR, price-comparison, appraisal-support, and
              AI-assisted description features.
            </li>
            <li>
              Detect fraud, account abuse, prohibited items, duplicate items,
              stolen property, and other safety concerns.
            </li>
            <li>
              Communicate about accounts, transactions, bids, offers, payments,
              security, support, and policy changes.
            </li>
            <li>Personalize content, notifications, and recommendations.</li>
            <li>Measure, maintain, troubleshoot, and improve the platform.</li>
            <li>Enforce agreements and protect PawnLoop, users, and the public.</li>
            <li>
              Comply with tax, licensing, reporting, recordkeeping, legal, and
              regulatory obligations.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-ai">
          <h2 id="privacy-ai">6. AI-assisted and automated features</h2>
          <p>
            PawnLoop may use automated tools to help generate item descriptions,
            estimate prices, extract information from images or documents,
            recommend listings, prioritize search results, detect suspicious
            activity, and assist with navigation or customer support.
          </p>
          <p>
            Automated results may be incomplete or inaccurate. Users must review
            generated item descriptions, prices, extracted fields, and other
            recommendations before relying on or publishing them.
          </p>
          <p>
            PawnLoop may require human review before taking certain actions,
            particularly when an automated result may affect account access,
            item approval, fraud review, or a regulated transaction.
          </p>
        </section>

        <section aria-labelledby="privacy-disclosure">
          <h2 id="privacy-disclosure">7. How we disclose information</h2>
          <p>PawnLoop may disclose information to:</p>

          <h3>Other marketplace participants</h3>
          <p>
            Information may be provided to buyers, sellers, shops, dealers, or
            staff when necessary to display a listing, exchange messages,
            evaluate an item, or complete a transaction.
          </p>

          <h3>Service providers</h3>
          <p>
            Information may be provided to companies that support payment
            processing, identity verification, cloud hosting, file storage,
            analytics, communications, fraud prevention, mapping, shipping,
            authentication, customer support, and platform operations.
          </p>

          <h3>Payment and fulfillment partners</h3>
          <p>
            Information may be disclosed to payment processors, financial
            institutions, shipping carriers, delivery providers, authentication
            services, and participating shops as needed to complete transactions.
          </p>

          <h3>Safety, legal, and regulatory recipients</h3>
          <p>
            PawnLoop may disclose information to law enforcement, regulators,
            courts, government agencies, rights holders, insurers, investigators,
            or other appropriate parties when reasonably necessary to:
          </p>
          <ul>
            <li>Comply with law, legal process, or regulatory requirements.</li>
            <li>Investigate suspected fraud, theft, or unlawful conduct.</li>
            <li>Protect the safety, property, or rights of PawnLoop or others.</li>
            <li>Enforce agreements or respond to disputes and legal claims.</li>
          </ul>

          <h3>Business transactions</h3>
          <p>
            Information may be disclosed as part of a merger, acquisition,
            financing, restructuring, sale of assets, bankruptcy, or similar
            business transaction, subject to applicable law.
          </p>

          <h3>With your direction or consent</h3>
          <p>
            PawnLoop may disclose information when you request, authorize, or
            consent to the disclosure.
          </p>
        </section>

        <section aria-labelledby="privacy-public">
          <h2 id="privacy-public">8. Public information</h2>
          <p>
            Listings, shop profiles, item photographs, descriptions, prices,
            ratings, reviews, and certain account or business information may be
            visible to the public or other PawnLoop users.
          </p>
          <p>
            Do not include private or sensitive information in public listings,
            photographs, usernames, profile information, or reviews. Public
            information may be copied or shared by others outside PawnLoop.
          </p>
        </section>

        <section aria-labelledby="privacy-cookies">
          <h2 id="privacy-cookies">9. Cookies, analytics, and advertising</h2>
          <p>
            PawnLoop may use cookies, local storage, pixels, software development
            kits, and similar technologies to maintain sessions, remember
            preferences, measure usage, prevent fraud, improve performance, and
            support analytics or advertising.
          </p>
          <p>
            Browser settings may allow you to block or delete certain
            technologies. Some platform features may not work properly if
            required cookies or storage are disabled.
          </p>
          <p>
            PawnLoop’s final advertising practices, cookie controls, consent
            requirements, and treatment of browser-based privacy signals must be
            documented before public launch.
          </p>
          <p>
            If PawnLoop sells or shares personal information as those terms are
            defined by applicable privacy law, PawnLoop will provide the notices
            and opt-out controls required by that law.
          </p>
        </section>

        <section aria-labelledby="privacy-retention">
          <h2 id="privacy-retention">10. Data retention</h2>
          <p>
            PawnLoop retains personal information for as long as reasonably
            necessary to provide services, maintain accounts, complete
            transactions, resolve disputes, prevent fraud, enforce agreements,
            and satisfy legal, tax, licensing, reporting, and recordkeeping
            obligations.
          </p>
          <p>
            Retention periods may vary based on the type of information, the
            relationship with the user, legal requirements, security concerns,
            and whether an account or transaction remains active.
          </p>
          <p>
            Some information may remain in backups or be retained when deletion
            is prohibited or an exception applies.
          </p>
        </section>

        <section aria-labelledby="privacy-security">
          <h2 id="privacy-security">11. Information security</h2>
          <p>
            PawnLoop uses administrative, technical, and organizational measures
            designed to protect personal information. However, no internet
            transmission, storage system, or security measure is completely
            secure.
          </p>
          <p>
            Users are responsible for protecting their passwords, devices, and
            account access. Contact PawnLoop promptly if you suspect unauthorized
            access or other security problems.
          </p>
        </section>

        <section aria-labelledby="privacy-choices">
          <h2 id="privacy-choices">12. Your choices</h2>
          <p>Depending on available features and applicable law, you may:</p>
          <ul>
            <li>Review or update certain account information.</li>
            <li>Change notification and communication preferences.</li>
            <li>Disable device-location access through device settings.</li>
            <li>Manage cookies through browser or platform controls.</li>
            <li>Close your account, subject to retention requirements.</li>
            <li>Request access, correction, deletion, or a copy of information.</li>
            <li>
              Opt out of certain advertising, sale, sharing, or profiling
              activities where applicable.
            </li>
            <li>Appeal certain privacy-request decisions where required by law.</li>
          </ul>
          <p>
            PawnLoop may need to verify your identity before fulfilling a request.
            Authorized agents may submit requests where permitted by law, subject
            to appropriate verification.
          </p>
          <p>
            PawnLoop will not unlawfully discriminate against you for exercising
            an applicable privacy right.
          </p>
        </section>

        <section aria-labelledby="privacy-state-rights">
          <h2 id="privacy-state-rights">13. U.S. state privacy rights</h2>
          <p>
            Residents of certain states may have rights to know or access personal
            information, correct inaccuracies, request deletion, obtain a portable
            copy, and opt out of certain sales, sharing, targeted advertising, or
            profiling.
          </p>
          <p>
            These rights are subject to legal definitions, exceptions, identity
            verification, and PawnLoop’s obligations to preserve transaction,
            safety, regulatory, and legal records.
          </p>
          <p>
            Before public launch, PawnLoop must finalize its privacy-request
            process, contact method, response procedures, appeal process, and all
            state-specific notices required for its actual operations.
          </p>
        </section>

        <section aria-labelledby="privacy-california">
          <h2 id="privacy-california">14. California privacy notice</h2>
          <p>
            California residents may have rights to request information about
            personal information collected, used, disclosed, sold, or shared;
            request deletion or correction; limit certain uses of sensitive
            personal information; and opt out of certain sales or sharing.
          </p>
          <p>
            The categories PawnLoop may collect include identifiers, customer
            records, commercial information, internet or electronic activity,
            geolocation information, photographs or other sensory information,
            professional or business information, sensitive personal information,
            and inferences.
          </p>
          <p>
            PawnLoop’s final California notice must accurately describe its
            practices during the preceding 12 months, applicable retention
            periods, categories of recipients, and whether any information is sold
            or shared. Legal counsel must complete this disclosure before public
            launch.
          </p>
        </section>

        <section aria-labelledby="privacy-children">
          <h2 id="privacy-children">15. Children’s privacy</h2>
          <p>
            PawnLoop is not intended for children under 13, and PawnLoop does not
            knowingly collect personal information from children under 13.
          </p>
          <p>
            Marketplace, payment, pawn, and other regulated features may require
            users to be at least 18 or meet a higher age requirement imposed by
            applicable law or a participating business.
          </p>
          <p>
            If PawnLoop learns that it collected personal information from a
            child in violation of applicable law, it will take reasonable steps to
            delete or otherwise address that information.
          </p>
        </section>

        <section aria-labelledby="privacy-international">
          <h2 id="privacy-international">16. International users</h2>
          <p>
            PawnLoop is presently designed for use in the United States. If you
            access PawnLoop from another country, your information may be
            transferred to and processed in the United States or other countries
            where PawnLoop’s service providers operate.
          </p>
          <p>
            International availability and any required cross-border transfer
            protections must be reviewed before PawnLoop offers services outside
            the United States.
          </p>
        </section>

        <section aria-labelledby="privacy-third-party">
          <h2 id="privacy-third-party">17. Third-party services and links</h2>
          <p>
            PawnLoop may contain links to or integrations with third-party
            websites and services. Those third parties control their own privacy
            practices, and their policies should be reviewed before submitting
            information to them.
          </p>
        </section>

        <section aria-labelledby="privacy-changes">
          <h2 id="privacy-changes">18. Changes to this policy</h2>
          <p>
            PawnLoop may update this policy as its services, technology, legal
            obligations, or business practices change. The updated effective date
            will appear at the top of this page.
          </p>
          <p>
            PawnLoop will provide additional notice or request consent when
            required by applicable law.
          </p>
        </section>

        <section aria-labelledby="privacy-contact">
          <h2 id="privacy-contact">19. Contact and privacy requests</h2>
          <p>
            Questions, complaints, and privacy requests may be submitted through
            the support or contact method displayed on PawnLoop.
          </p>
          <p>
            PawnLoop’s legal business name, mailing address, privacy email
            address, telephone number, and request-submission method must be added
            before public launch.
          </p>
        </section>

        <nav className="legal-page__navigation" aria-label="Legal pages">
          <Link to="/terms">Read the Terms of Service</Link>
          <Link to="/">Return to the homepage</Link>
        </nav>
      </div>
    </div>
  );
}

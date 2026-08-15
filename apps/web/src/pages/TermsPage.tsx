import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "July 28, 2026";

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-page__container">
        <header className="legal-page__header">
          <span className="legal-page__eyebrow">Legal</span>
          <h1>Terms of Service</h1>
          <p>Effective date: {EFFECTIVE_DATE}</p>

          <div className="legal-page__notice" role="note">
            <strong>Draft for legal review:</strong> These terms must be reviewed
            and approved by a qualified attorney before PawnLoop launches
            publicly.
          </div>
        </header>

        <section aria-labelledby="terms-introduction">
          <h2 id="terms-introduction">1. Acceptance of these terms</h2>
          <p>
            These Terms of Service govern your access to and use of PawnLoop,
            including its website, applications, marketplace tools, payment
            features, messaging features, and related services.
          </p>
          <p>
            By creating an account, listing an item, submitting an offer,
            completing a transaction, or otherwise using PawnLoop, you agree to
            these terms and our <Link to="/privacy">Privacy Policy</Link>. If you
            do not agree, do not use the platform.
          </p>
        </section>

        <section aria-labelledby="terms-platform-role">
          <h2 id="terms-platform-role">2. PawnLoop’s role</h2>
          <p>
            PawnLoop provides technology that helps buyers, sellers, pawn
            shops, dealers, and other eligible users discover items,
            communicate, compare prices, submit items for review, make offers,
            arrange transactions, and manage marketplace activity.
          </p>
          <p>
            Unless PawnLoop expressly identifies itself as the seller, buyer,
            lender, or pawnbroker in a transaction, PawnLoop is not a party to
            the transaction between users. Users remain responsible for
            evaluating each transaction and complying with applicable laws.
          </p>
        </section>

        <section aria-labelledby="terms-eligibility">
          <h2 id="terms-eligibility">3. Eligibility and accounts</h2>
          <p>
            You must be legally able to enter into a binding agreement and meet
            all age requirements that apply to the transaction you are
            attempting to complete.
          </p>
          <p>You agree to:</p>
          <ul>
            <li>Provide accurate, complete, and current information.</li>
            <li>Keep your login credentials secure.</li>
            <li>Use only accounts and payment methods you are authorized to use.</li>
            <li>
              Notify PawnLoop promptly if you suspect unauthorized account
              activity.
            </li>
            <li>
              Accept responsibility for activity performed through your
              account, except where prohibited by law.
            </li>
          </ul>
          <p>
            PawnLoop may require identity, business, ownership, age, location,
            or payment verification before allowing access to certain features.
          </p>
        </section>

        <section aria-labelledby="terms-marketplace">
          <h2 id="terms-marketplace">4. Marketplace transactions</h2>
          <p>PawnLoop may support transactions including:</p>
          <ul>
            <li>Customers selling or pawning items to participating shops.</li>
            <li>Customer-to-customer marketplace sales.</li>
            <li>Pawn-shop-to-customer retail sales.</li>
            <li>Dealer and pawn-shop inventory trading.</li>
            <li>Fixed-price listings, offers, auctions, pickup, and shipping.</li>
          </ul>
          <p>
            A listing, estimate, comparison, appraisal, offer, bid, or
            reservation does not guarantee that a transaction will be
            completed. Additional inspection, verification, legal compliance,
            payment authorization, or mutual acceptance may be required.
          </p>
        </section>

        <section aria-labelledby="terms-pawn-transactions">
          <h2 id="terms-pawn-transactions">5. Pawn and regulated transactions</h2>
          <p>
            Pawn transactions, lending activities, holding periods, interest,
            fees, reporting, identification, recordkeeping, and redemption
            rights may be regulated by federal, state, and local law.
            Participating pawn shops are independently responsible for their
            licenses, disclosures, transaction terms, and legal compliance.
          </p>
          <p>
            Information displayed through PawnLoop is not a loan approval,
            guaranteed appraisal, or promise that a shop will accept an item.
            Final pawn or purchase terms must be provided by the participating
            shop.
          </p>
        </section>

        <section aria-labelledby="terms-listings">
          <h2 id="terms-listings">6. Listings and item information</h2>
          <p>
            Users are responsible for the accuracy, legality, condition,
            authenticity, ownership, price, images, descriptions, serial
            numbers, and other information associated with their items.
          </p>
          <p>
            PawnLoop may provide barcode scanning, optical character
            recognition, price comparisons, or AI-assisted descriptions. These
            tools may produce incomplete or inaccurate results. You must review
            and correct generated information before publishing or relying on
            it.
          </p>
          <p>
            PawnLoop may edit formatting, request additional information,
            require manual review, reject a listing, or remove content that
            violates these terms or creates safety, legal, or fraud concerns.
          </p>
        </section>

        <section aria-labelledby="terms-prohibited-items">
          <h2 id="terms-prohibited-items">7. Prohibited conduct and items</h2>
          <p>You may not use PawnLoop to:</p>
          <ul>
            <li>List stolen, counterfeit, fraudulent, or unlawfully obtained items.</li>
            <li>Misrepresent an item’s identity, ownership, condition, or value.</li>
            <li>Evade legal reporting, identification, tax, or licensing requirements.</li>
            <li>
              Sell prohibited, recalled, dangerous, or regulated items without
              all required authorization.
            </li>
            <li>Manipulate bids, reviews, prices, ratings, or marketplace activity.</li>
            <li>Harass, threaten, discriminate against, or defraud another person.</li>
            <li>
              Introduce malware, scrape protected data, disrupt the platform,
              or attempt unauthorized access.
            </li>
            <li>Move a transaction off-platform to avoid applicable fees or safeguards.</li>
          </ul>
        </section>

        <section aria-labelledby="terms-payments">
          <h2 id="terms-payments">8. Payments, fees, subscriptions, and payouts</h2>
          <p>
            Payment processing may be provided by third-party payment
            processors. By using payment features, you also agree to the
            applicable processor’s terms and verification requirements.
          </p>
          <p>
            PawnLoop may charge transaction fees, commissions, subscription
            fees, promotional fees, shipping charges, authentication fees, or
            other amounts disclosed before purchase or enrollment.
          </p>
          <p>
            Subscription plans may renew automatically until canceled. The
            price, billing interval, trial period, included features, and
            cancellation rules will be disclosed during enrollment. Canceling
            a subscription does not automatically reverse charges already
            incurred.
          </p>
          <p>
            Payouts may be delayed or withheld when necessary to investigate
            fraud, disputes, refunds, chargebacks, legal requirements, account
            restrictions, or incomplete identity verification.
          </p>
        </section>

        <section aria-labelledby="terms-auctions">
          <h2 id="terms-auctions">9. Auctions, bids, offers, and reservations</h2>
          <p>
            Bids and accepted offers may create binding transaction
            obligations. You must not bid or submit an offer unless you intend
            and are able to complete the transaction.
          </p>
          <p>
            PawnLoop may cancel, reverse, pause, or investigate marketplace
            activity affected by technical errors, suspected manipulation,
            prohibited conduct, payment failure, or legal restrictions.
          </p>
        </section>

        <section aria-labelledby="terms-fulfillment">
          <h2 id="terms-fulfillment">10. Pickup, shipping, returns, and disputes</h2>
          <p>
            Buyers and sellers must follow the pickup, shipping, inspection,
            return, refund, and dispute terms disclosed for the transaction.
            Users are responsible for providing accurate delivery and contact
            information.
          </p>
          <p>
            Risk of loss and ownership transfer will be determined by the
            transaction terms and applicable law. PawnLoop may request
            photographs, receipts, tracking information, inspection results,
            or other evidence when reviewing a dispute.
          </p>
        </section>

        <section aria-labelledby="terms-user-content">
          <h2 id="terms-user-content">11. User content</h2>
          <p>
            You retain ownership of content you submit. You grant PawnLoop a
            non-exclusive, worldwide, royalty-free license to host, store,
            reproduce, display, format, and distribute that content as needed
            to operate, secure, promote, and improve the platform.
          </p>
          <p>
            You represent that you own or have permission to use the content
            you submit and that it does not violate another person’s rights.
          </p>
        </section>

        <section aria-labelledby="terms-reviews">
          <h2 id="terms-reviews">12. Ratings and reviews</h2>
          <p>
            Reviews must reflect genuine experiences and must not contain
            threats, harassment, confidential information, unlawful content,
            or misleading claims. PawnLoop may moderate or remove reviews that
            violate these terms.
          </p>
        </section>

        <section aria-labelledby="terms-intellectual-property">
          <h2 id="terms-intellectual-property">13. Intellectual property</h2>
          <p>
            PawnLoop’s software, branding, design, documentation, and original
            platform content are protected by intellectual-property laws. No
            rights are granted except the limited right to use the platform in
            accordance with these terms.
          </p>
        </section>

        <section aria-labelledby="terms-third-parties">
          <h2 id="terms-third-parties">14. Third-party services</h2>
          <p>
            PawnLoop may integrate with payment, mapping, shipping,
            authentication, analytics, storage, communication, or other
            third-party services. PawnLoop does not control and is not
            responsible for third-party services, policies, or availability.
          </p>
        </section>

        <section aria-labelledby="terms-availability">
          <h2 id="terms-availability">15. Platform availability</h2>
          <p>
            PawnLoop may update, suspend, restrict, or discontinue any part of
            the platform. PawnLoop does not guarantee uninterrupted or
            error-free access, or that every listing, message, estimate, price,
            or user-provided statement is accurate.
          </p>
        </section>

        <section aria-labelledby="terms-disclaimers">
          <h2 id="terms-disclaimers">16. Disclaimers</h2>
          <p>
            To the fullest extent permitted by law, PawnLoop is provided “as
            is” and “as available.” PawnLoop disclaims warranties not expressly
            stated in these terms, including implied warranties of
            merchantability, fitness for a particular purpose, title, and
            non-infringement.
          </p>
          <p>
            PawnLoop does not guarantee the identity of a user, ownership or
            authenticity of an item, completion of a transaction, or accuracy
            of an appraisal, comparison, recommendation, or generated
            description.
          </p>
        </section>

        <section aria-labelledby="terms-liability">
          <h2 id="terms-liability">17. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, PawnLoop and its owners,
            affiliates, employees, and service providers will not be liable for
            indirect, incidental, special, consequential, exemplary, or
            punitive damages arising from use of the platform.
          </p>
          <p>
            The final liability limits, exclusions, exceptions, and any maximum
            recovery amount must be reviewed and approved by legal counsel
            before public launch.
          </p>
        </section>

        <section aria-labelledby="terms-indemnification">
          <h2 id="terms-indemnification">18. Indemnification</h2>
          <p>
            To the extent permitted by law, you agree to defend, indemnify, and
            hold PawnLoop harmless from claims arising from your content,
            listings, transactions, violation of these terms, unlawful conduct,
            or infringement of another person’s rights.
          </p>
        </section>

        <section aria-labelledby="terms-enforcement">
          <h2 id="terms-enforcement">19. Suspension and termination</h2>
          <p>
            PawnLoop may limit, suspend, or terminate access when reasonably
            necessary to protect users, investigate suspected misconduct,
            comply with legal obligations, prevent fraud, collect amounts owed,
            or enforce these terms.
          </p>
          <p>
            Provisions that logically should continue after termination,
            including payment obligations, ownership, disclaimers, liability
            limits, and dispute terms, will survive.
          </p>
        </section>

        <section aria-labelledby="terms-law">
          <h2 id="terms-law">20. Governing law and disputes</h2>
          <p>
            The governing-law, venue, arbitration, class-action waiver, and
            dispute-resolution provisions have not yet been finalized. They
            must be completed by qualified legal counsel based on PawnLoop’s
            operating entity and jurisdictions before public launch.
          </p>
        </section>

        <section aria-labelledby="terms-changes">
          <h2 id="terms-changes">21. Changes to these terms</h2>
          <p>
            PawnLoop may update these terms as the platform, laws, or business
            practices change. The updated effective date will be displayed on
            this page. When required, PawnLoop will provide additional notice
            or request renewed consent.
          </p>
        </section>

        <section aria-labelledby="terms-contact">
          <h2 id="terms-contact">22. Contact</h2>
          <p>
            Questions about these terms may be submitted through the support or
            contact method displayed on PawnLoop. Formal legal contact details
            must be added before public launch.
          </p>
        </section>

        <nav className="legal-page__navigation" aria-label="Legal pages">
          <Link to="/privacy">Read the Privacy Policy</Link>
          <Link to="/">Return to the homepage</Link>
        </nav>
      </div>
    </div>
  );
}

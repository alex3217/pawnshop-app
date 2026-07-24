import { Link } from "react-router-dom";
import "./OwnerRegistrationPage.css";

const benefits = [
  {
    number: "01",
    title: "Online storefront",
    description:
      "Publish inventory and help customers discover your shop beyond its physical location.",
  },
  {
    number: "02",
    title: "Inventory management",
    description:
      "Create listings, update availability, organize inventory, and monitor marketplace activity.",
  },
  {
    number: "03",
    title: "Offers and auctions",
    description:
      "Accept customer offers, create auctions, and manage winning transactions in one workspace.",
  },
  {
    number: "04",
    title: "Customer item requests",
    description:
      "Review items customers want to sell or pawn before they arrive at your shop.",
  },
  {
    number: "05",
    title: "Payments and fulfillment",
    description:
      "Manage marketplace payments, pickup, shipping, tracking, and eligible seller payouts.",
  },
  {
    number: "06",
    title: "Business analytics",
    description:
      "Track listings, sales, customer activity, revenue, and shop performance.",
  },
];

const steps = [
  {
    number: 1,
    title: "Create your owner account",
    description: "Enter your contact information and create a secure login.",
  },
  {
    number: 2,
    title: "Enter your pawn shop information",
    description: "Add your business name, location, contact details, and operating hours.",
  },
  {
    number: 3,
    title: "Submit business and licensing details",
    description: "Provide the documentation required to review your business.",
  },
  {
    number: 4,
    title: "Complete business verification",
    description: "Confirm ownership and satisfy applicable marketplace requirements.",
  },
  {
    number: 5,
    title: "Choose a subscription plan",
    description: "Select the plan that best fits your shop and expected sales volume.",
  },
  {
    number: 6,
    title: "Configure payments and payouts",
    description: "Connect your payment account for eligible marketplace transactions.",
  },
  {
    number: 7,
    title: "Add inventory and invite staff",
    description: "Publish your first items and give employees role-based access.",
  },
  {
    number: 8,
    title: "Complete approval and publish your shop",
    description: "Finish the checklist and make your storefront available to customers.",
  },
];

const assurances = [
  {
    title: "Business verification",
    description:
      "Owner and business information is reviewed before a shop is approved.",
  },
  {
    title: "Secure account access",
    description:
      "Role-based access helps owners control what employees can view and manage.",
  },
  {
    title: "Guided setup",
    description:
      "A step-by-step checklist helps you complete registration and publish your shop.",
  },
];

const faqs = [
  {
    question: "How long does initial registration take?",
    answer:
      "Most owners should be able to complete the initial account and shop information in approximately 10 to 15 minutes. Verification can require additional time.",
  },
  {
    question: "What information should I have ready?",
    answer:
      "Have your shop contact information, business address, ownership details, licensing information, and payment or payout information available.",
  },
  {
    question: "Can employees help manage the shop?",
    answer:
      "Yes. After your owner account is approved, you can invite staff members and assign role-based permissions.",
  },
  {
    question: "Can I add inventory later?",
    answer:
      "Yes. You can complete the account setup first and add inventory through manual entry, supported scanning tools, or bulk-upload workflows.",
  },
];

export default function OwnerRegistrationPage() {
  return (
    <main className="owner-guide">
      <nav
        className="owner-guide__breadcrumb"
        aria-label="Owner registration navigation"
      >
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>For pawn shops</span>
      </nav>

      <section
        className="owner-guide__hero"
        aria-labelledby="owner-guide-title"
      >
        <div className="owner-guide__hero-copy">
          <p className="owner-guide__eyebrow">For pawn shop owners</p>

          <h1 id="owner-guide-title">Grow your pawn shop online</h1>

          <p className="owner-guide__intro">
            Build an online storefront, manage inventory, receive customer item
            submissions, create auctions, accept offers, and reach more buyers
            from one connected marketplace.
          </p>

          <div className="owner-guide__actions">
            <Link
              className="owner-guide__button owner-guide__button--primary"
              to="/register?role=owner"
            >
              Register your shop
            </Link>

            <a
              className="owner-guide__button owner-guide__button--secondary"
              href="#owner-registration-steps"
            >
              See how registration works
            </a>
          </div>

          <div className="owner-guide__registration-note">
            <strong>10–15 minutes</strong>
            <span>Estimated time to complete initial registration</span>
          </div>
        </div>

        <aside className="owner-guide__summary">
          <p className="owner-guide__summary-label">Included with your account</p>
          <h2>Owner account features</h2>

          <ul>
            <li>Online shop profile and storefront</li>
            <li>Inventory and listing management</li>
            <li>Customer sell and pawn submissions</li>
            <li>Offers, auctions, payments, and fulfillment</li>
            <li>Staff access and shop analytics</li>
            <li>Guided owner onboarding checklist</li>
          </ul>

          <Link className="owner-guide__summary-link" to="/register?role=owner">
            Start owner registration
            <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </section>

      <section
        className="owner-guide__section"
        aria-labelledby="owner-benefits-title"
      >
        <div className="owner-guide__section-heading">
          <p className="owner-guide__eyebrow">Business tools</p>
          <h2 id="owner-benefits-title">
            Everything you need to operate online
          </h2>
          <p>
            Manage customer activity, inventory, transactions, and daily shop
            operations through one owner workspace.
          </p>
        </div>

        <div className="owner-guide__benefits">
          {benefits.map((benefit) => (
            <article className="owner-guide__card" key={benefit.title}>
              <span className="owner-guide__card-number" aria-hidden="true">
                {benefit.number}
              </span>

              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="owner-guide__section"
        id="owner-registration-steps"
        aria-labelledby="owner-steps-title"
      >
        <div className="owner-guide__section-heading">
          <p className="owner-guide__eyebrow">Getting started</p>
          <h2 id="owner-steps-title">How owner registration works</h2>
          <p>
            Follow the guided checklist from account creation through shop
            approval and publication.
          </p>
        </div>

        <ol className="owner-guide__steps">
          {steps.map((step) => (
            <li className="owner-guide__step" key={step.number}>
              <span className="owner-guide__step-number">
                {step.number}
              </span>

              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="owner-guide__section"
        aria-labelledby="owner-trust-title"
      >
        <div className="owner-guide__section-heading">
          <p className="owner-guide__eyebrow">Built for trusted businesses</p>
          <h2 id="owner-trust-title">A guided and secure setup process</h2>
        </div>

        <div className="owner-guide__assurances">
          {assurances.map((assurance) => (
            <article key={assurance.title}>
              <span aria-hidden="true">✓</span>
              <div>
                <h3>{assurance.title}</h3>
                <p>{assurance.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="owner-guide__section"
        aria-labelledby="owner-faq-title"
      >
        <div className="owner-guide__section-heading">
          <p className="owner-guide__eyebrow">Frequently asked questions</p>
          <h2 id="owner-faq-title">Before you register</h2>
        </div>

        <div className="owner-guide__faqs">
          {faqs.map((faq) => (
            <details className="owner-guide__faq" key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="owner-guide__cta" aria-labelledby="owner-cta-title">
        <div>
          <p className="owner-guide__eyebrow">Ready to begin?</p>
          <h2 id="owner-cta-title">
            Bring your pawn shop to the marketplace
          </h2>
          <p>
            Create your owner account and follow the guided business setup
            process.
          </p>
        </div>

        <div className="owner-guide__cta-actions">
          <Link
            className="owner-guide__button owner-guide__button--primary"
            to="/register?role=owner"
          >
            Register your shop
          </Link>

          <Link
            className="owner-guide__button owner-guide__button--secondary"
            to="/shops"
          >
            Explore marketplace shops
          </Link>
        </div>
      </section>
    </main>
  );
}

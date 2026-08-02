import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import "../styles/buyer-account.css";

type HelpTopicProps = { title: string; children: ReactNode };
function HelpTopic({ title, children }: HelpTopicProps) {
  return <section className="list-card"><h2>{title}</h2>{children}</section>;
}

export default function BuyerHelpPage() {
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
    <header>
      <p className="section-eyebrow">SUPPORT</p>
      <h1>Buyer Help Center</h1>
      <p>Start with the transaction or shop involved so the right records and contact path stay together.</p>
    </header>
    <div className="grid gap-4 md:grid-cols-2">
      <HelpTopic title="Purchase help"><p>Review payment, fulfillment, pickup, delivery, and transaction status.</p><Link to="/marketplace/purchases">Open My Purchases</Link></HelpTopic>
      <HelpTopic title="Payments and billing"><p>Manage saved payment methods through Stripe or manage a paid buyer plan.</p><Link to="/account/payment-methods">Payment Methods</Link> · <Link to="/buyer/subscription">Buyer Subscription</Link></HelpTopic>
      <HelpTopic title="Refunds and disputes"><p>Open the affected purchase first. Never send card details through messages.</p><Link to="/marketplace/purchases">Find a transaction</Link></HelpTopic>
      <HelpTopic title="Contact a shop"><p>Use the shop storefront or related offer and transaction detail screen.</p><Link to="/shops">Find a shop</Link> · <Link to="/offers">Open Offers</Link></HelpTopic>
      <HelpTopic title="Account help"><p>Review account information or use the verified password-reset flow.</p><Link to="/buyer/settings">Account Settings</Link> · <Link to="/forgot-password">Reset password</Link></HelpTopic>
    </div>
    <p role="note">PawnLoop does not currently expose a persisted buyer support-ticket form, so this page does not claim that a ticket was submitted.</p>
  </main>;
}

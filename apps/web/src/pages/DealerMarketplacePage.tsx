import { Link } from "react-router-dom";

const workflow = [
  ["Payment secured", "The buying shop's Stripe payment has succeeded."],
  ["Fulfillment", "The selling shop ships with evidence or prepares verified pickup."],
  ["Inspection pending", "The buying shop receives an exact inspection deadline."],
  ["Release eligible", "Acceptance or deadline expiry, with no dispute, refund, return, or risk hold."],
  ["Transferred", "One idempotent transfer may be created only after financial reconciliation."],
];

export default function DealerMarketplacePage() {
  return (
    <main className="page-shell" aria-labelledby="dealer-title">
      <section className="page-card">
        <p className="eyebrow">Verified shops only</p>
        <h1 id="dealer-title">Dealer Marketplace</h1>
        <p>Buy and sell inventory shop-to-shop with Protected Dealer Payments. PawnLoop verifies payment and delays seller release through fulfillment, inspection, and dispute checks.</p>
        <div className="button-row">
          <Link className="btn btn-primary" to="/marketplace">Browse dealer inventory</Link>
          <Link className="btn btn-secondary" to="/marketplace/listings/new">List dealer inventory</Link>
          <Link className="btn btn-secondary" to="/marketplace/purchases">Dealer transactions</Link>
          <Link className="btn btn-secondary" to="/owner/finance">Dealer finance</Link>
        </div>
      </section>

      <section className="page-card" aria-labelledby="protected-payment-title">
        <h2 id="protected-payment-title">Protected Dealer Payment</h2>
        <ol>
          {workflow.map(([title, description]) => <li key={title}><strong>{title}</strong><p>{description}</p></li>)}
        </ol>
        <p>No seller transfer is eligible from browser state alone. An active dispute or return keeps release on hold; a failed transfer stays visible for finance review.</p>
      </section>

      <section className="page-card" aria-labelledby="inventory-title">
        <h2 id="inventory-title">Dealer inventory</h2>
        <p>No dealer listings are available yet. This empty state will be replaced by verified, plan-eligible shop inventory.</p>
        <p>Wanted Inventory is reserved for a later activation using the existing listing and messaging architecture.</p>
      </section>

      <section className="page-card" aria-labelledby="community-title">
        <h2 id="community-title">Community Marketplace</h2>
        <p><strong>Disabled.</strong> Separate verification, fraud, policy, and legal approval is required. Customer-to-customer purchase actions are not available.</p>
      </section>
    </main>
  );
}

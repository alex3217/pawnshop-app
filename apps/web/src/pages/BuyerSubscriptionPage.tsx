import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatBuyerLimit, getBuyerPlanCatalog, getBuyerPlanUsage, type BuyerPlanCatalogEntry, type BuyerPlanUsage } from "../services/buyerPlans";

const money = (cents: number) => cents === 0 ? "Free" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : "Not scheduled";

export default function BuyerSubscriptionPage() {
  const [usage, setUsage] = useState<BuyerPlanUsage | null>(null);
  const [plans, setPlans] = useState<BuyerPlanCatalogEntry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); Promise.all([getBuyerPlanUsage(controller.signal), getBuyerPlanCatalog(controller.signal)]).then(([nextUsage, catalog]) => { setUsage(nextUsage); setPlans(catalog.plans); }).catch((cause) => { if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load buyer subscription."); }); return () => controller.abort(); }, []);
  const usageCards = usage ? [["Saved searches", usage.usage.savedSearches], ["Watchlist items", usage.usage.watchlistItems], ["Default wish list", usage.usage.wishLists], ["Comparisons", usage.usage.comparisons]] as const : [];
  return <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 20px 60px" }}><header><p style={{ fontWeight: 800, color: "#0f766e" }}>BUYER PLAN</p><h1>Buyer Subscription</h1><p>Review your current plan and real usage. Purchasing remains available on Free.</p></header>
    {error ? <div className="error-text" role="alert">{error}</div> : null}{!usage && !error ? <p aria-live="polite">Loading buyer plan usage…</p> : null}
    {usage ? <><section className="list-card" style={{ marginTop: 18 }}><h2>{usage.subscription.displayName}</h2><p>Internal billing code: {usage.subscription.storedPlan} · Status: {usage.subscription.status}</p><p>Current period ends: {date(usage.subscription.currentPeriodEnd)}</p><p>Core browsing, Buy Now, offers, auctions, payment methods, and order tracking remain included.</p></section>
      <section style={{ marginTop: 20 }}><h2>Usage and limits</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>{usageCards.map(([label, value]) => <article className="list-card" key={label}><strong>{label}</strong><div style={{ fontSize: 26, fontWeight: 900 }}>{value.used} / {formatBuyerLimit(value.limit)}</div>{value.atLimit ? <p>You reached this plan limit. Review plans for more organization and discovery tools.</p> : null}</article>)}</div></section>
      <section style={{ marginTop: 20 }}><h2>Plans</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>{plans.map((plan) => <article className="list-card" key={plan.code}><h3>{plan.label}</h3><p><strong>{money(plan.monthlyPriceCents)}</strong>{plan.monthlyPriceCents ? " / month" : ""}</p><p>{formatBuyerLimit(plan.maxSavedSearches)} saved searches · {formatBuyerLimit(plan.maxWatchlistItems)} watchlist items</p><ul>{plan.features.slice(0, 4).map((feature) => <li key={feature}>{feature}</li>)}</ul>{plan.code === usage.subscription.effectivePlan ? <strong>Current plan</strong> : <Link className="button" to="/account/payment-methods">Review billing setup</Link>}</article>)}</div></section></> : null}
  </main>;
}

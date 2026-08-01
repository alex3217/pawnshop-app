import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getBuyerPlanUsage, type BuyerPlanUsage } from "../services/buyerPlans";

export default function BuyerSuccessCenterPage() {
  const [usage, setUsage] = useState<BuyerPlanUsage | null>(null); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); getBuyerPlanUsage(controller.signal).then(setUsage).catch((cause) => { if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load Buyer Success Center."); }); return () => controller.abort(); }, []);
  const actions = usage ? [{ label: "Save your first search", complete: usage.usage.savedSearches.used > 0, to: "/marketplace" }, { label: "Add an item to your default wish list", complete: usage.usage.watchlistItems.used > 0, to: "/marketplace" }, { label: "Add or review a payment method", complete: false, to: "/account/payment-methods" }, { label: "Explore nearby shops", complete: false, to: "/shops" }, { label: "Review your bids", complete: false, to: "/my-bids" }] : [];
  return <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}><header><p style={{ fontWeight: 800, color: "#0f766e" }}>GET MORE FROM PAWNLOOP</p><h1>Buyer Success Center</h1><p>Useful next steps based only on features that exist today.</p></header>{error ? <div role="alert" className="error-text">{error}</div> : null}{!usage && !error ? <p aria-live="polite">Loading success checklist…</p> : null}{usage ? <section className="list-card" style={{ marginTop: 18 }}><h2>Your next actions</h2>{actions.map((action) => <div key={action.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: "1px solid rgba(127,127,127,.25)" }}><span>{action.complete ? "✓" : "○"} {action.label}</span><Link to={action.to}>{action.complete ? "Review" : "Start"}</Link></div>)}</section> : null}</main>;
}

import { useEffect, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";
import { getAdminMarketplaceIntelligence, type AdminMarketplaceIntelligence } from "../services/marketplaceIntelligenceApi";

const label = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
const money = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);

export default function SuperAdminMarketplaceIntelligencePage() {
  const [data, setData] = useState<AdminMarketplaceIntelligence | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); getAdminMarketplaceIntelligence(controller.signal).then(setData).catch((cause) => { if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Marketplace Intelligence could not load."); }).finally(() => setLoading(false)); return () => controller.abort(); }, []);
  return <AdminPageShell title="Marketplace Intelligence" subtitle="Deterministic marketplace supply, demand, pricing, geography, and platform health.">
    {loading ? <p aria-live="polite">Loading Marketplace Intelligence…</p> : null}{error ? <div className="notice notice-error" role="alert">{error}</div> : null}
    {!loading && !error && !data ? <p>No marketplace intelligence is available.</p> : null}
    {data ? <div className="page-stack">
      <section><h2>Marketplace overview</h2><div className="kpi-grid">{Object.entries(data.overview).map(([key, value]) => <article className="kpi-card" key={key}><div className="kpi-value">{key.toLowerCase().includes("cents") ? money(value) : value ?? "—"}</div><div>{label(key)}</div></article>)}</div></section>
      <section className="page-card"><h2>Platform Health: {data.platformHealth.score} / {data.platformHealth.maximum}</h2><p>Version {data.platformHealth.version}. Operational evidence only; not a valuation or solvency prediction.</p>{data.platformHealth.components.map((row) => <p key={row.id}><strong>{row.label}: {row.score}/{row.maximum}</strong> — {row.evidence}</p>)}</section>
      <section className="page-card"><h2>Category performance</h2>{data.categories.length ? <div style={{ overflowX: "auto" }}><table className="admin-table"><thead><tr><th>Category</th><th>Supply</th><th>Sales</th><th>GMV</th><th>Median</th><th>Sell-through</th><th>Confidence</th><th>Demand</th></tr></thead><tbody>{data.categories.map((row) => <tr key={row.category}><td>{row.category}</td><td>{row.activeListings}</td><td>{row.completedSales}</td><td>{money(row.grossMerchandiseValueCents)}</td><td>{money(row.medianSalePriceCents)}</td><td>{row.sellThroughPercent}%</td><td>{row.confidence.level}</td><td>{row.demand.label}</td></tr>)}</tbody></table></div> : <p>Insufficient category data.</p>}</section>
      <section className="page-card"><h2>Geography</h2><p>Shop-state aggregates only; customer locations are excluded.</p>{data.geography.length ? data.geography.map((row) => <p key={row.region}><strong>{row.region}</strong>: {row.activeListings} active · {row.completedSales} completed</p>) : <p>No regional aggregates are available.</p>}</section>
      <section className="page-card"><h2>Supply-demand gaps</h2>{data.supplyDemandGaps.length ? data.supplyDemandGaps.map((row) => <p key={row.category}><strong>{row.category}</strong>: {row.reason}</p>) : <p>No V1 gap rule is currently triggered.</p>}</section>
      <section className="page-card"><h2>Pricing summary</h2><p>{data.pricing.sampleSize} completed sales · average {money(data.pricing.averageCompletedSaleCents)} · median {money(data.pricing.medianCompletedSaleCents)} · {data.pricing.confidence.level} confidence</p></section>
      <section className="page-card"><h2>Operational action queue</h2>{data.actionQueue.length ? data.actionQueue.map((row) => <p key={row.id}><strong>{row.priority}</strong>: {row.evidence} — {row.recommendedAction}</p>) : <p>No platform-health action is currently triggered.</p>}</section>
      <p>Privacy: aggregates only; no buyer identities, Growth Center contacts, or exact customer locations. {data.limitations.join(" ")}</p>
    </div> : null}
  </AdminPageShell>;
}

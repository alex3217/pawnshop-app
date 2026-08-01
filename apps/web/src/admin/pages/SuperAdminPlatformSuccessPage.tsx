import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import { getPlatformSuccess, type PlatformSuccess } from "../services/platformSuccessApi";

const label = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

export default function SuperAdminPlatformSuccessPage() {
  const [data, setData] = useState<PlatformSuccess | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); getPlatformSuccess(controller.signal).then(setData).catch((cause) => { if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load Platform Success."); }).finally(() => setLoading(false)); return () => controller.abort(); }, []);
  return <AdminPageShell title="Platform Success" subtitle="Operational marketplace health and deterministic action queues.">
    {loading ? <p aria-live="polite">Loading Platform Success…</p> : null}
    {error ? <div role="alert" className="notice notice-error">{error}</div> : null}
    {data ? <div className="page-stack">
      <section><h2>Overview</h2><div className="kpi-grid">{Object.entries(data.metrics).map(([key, value]) => <article className="kpi-card" key={key}><div className="kpi-value">{value}</div><div>{label(key)}</div></article>)}</div></section>
      <section className="page-card"><h2>Marketing adoption</h2>{Object.entries(data.marketingAdoption).map(([key, value]) => <p key={key}><strong>{value}</strong> {label(key)}</p>)}</section>
      <section className="page-card"><h2>Subscription mix</h2><div className="grid-2"><div><h3>Seller plans</h3>{data.sellerPlanMix.map((row) => <p key={row.code}>{row.displayName} <small>({row.code})</small>: {row.count}</p>)}</div><div><h3>Buyer plans</h3>{data.buyerPlanMix.map((row) => <p key={row.code}>{row.displayName}: {row.count}</p>)}</div></div></section>
      <section className="page-card"><h2>Action queue</h2>{data.actionQueue.length === 0 ? <p>No shops currently meet a V1 action rule.</p> : <div style={{ overflowX: "auto" }}><table className="admin-table"><thead><tr><th>Shop</th><th>Plan</th><th>Health</th><th>Inventory</th><th>Marketing</th><th>Reasons</th><th>Action</th></tr></thead><tbody>{data.actionQueue.map((shop) => <tr key={shop.id}><td>{shop.name}</td><td>{shop.sellerPlanDisplay}<br/><small>{shop.subscriptionStatus}</small></td><td>{shop.shopHealth.score}/{shop.shopHealth.maximum}</td><td>{shop.activeListings}/{shop.listingLimit ?? "∞"}</td><td>{shop.activeCampaigns} active · {shop.scans} scans</td><td>{shop.reasons.join("; ")}</td><td><Link to={shop.adminRoute}>Open shop</Link></td></tr>)}</tbody></table></div>}</section>
      <p>Privacy: aggregate shop activity only. Private Growth Center contacts are not included.</p>
    </div> : null}
  </AdminPageShell>;
}

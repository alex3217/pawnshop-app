import { useCallback, useEffect, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";
import { disableMarketingCampaign, getMarketingAdministration, type MarketingAdministration } from "../services/marketingAdministrationApi";

export default function SuperAdminMarketingAdministrationPage() {
  const [data, setData] = useState<MarketingAdministration | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [query, setQuery] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setData((await getMarketingAdministration(query)).administration); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load marketing administration."); } finally { setLoading(false); } }, [query]);
  useEffect(() => { void load(); }, [load]);
  async function disable(id: string) { const reason = window.prompt("Reason for disabling this campaign (required):")?.trim(); if (!reason) return; try { await disableMarketingCampaign(id, reason); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to disable campaign."); } }
  return <AdminPageShell title="Marketing Administration" subtitle="Platform adoption, code-owned templates, aggregate engagement, referrals, and audited campaign safety controls.">
    {error ? <p role="alert" className="error-text">{error}</p> : null}{loading ? <p aria-live="polite">Loading marketing administration…</p> : null}
    <label>Search campaigns or shops<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {data ? <><section className="admin-card"><h2>Adoption</h2><div className="admin-stats-grid">{Object.entries(data.metrics).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{key.replaceAll(/([A-Z])/g, " $1")}</span></div>)}</div><p>Follower data is aggregate only; buyer contact data is not included.</p></section>
      <section className="admin-card"><h2>Campaigns</h2>{data.campaigns.length === 0 ? <p>No campaigns match this search.</p> : <div className="admin-table-wrap"><table><thead><tr><th>Shop</th><th>Campaign</th><th>Destination</th><th>Scans</th><th>Status</th><th>Safety</th></tr></thead><tbody>{data.campaigns.map((campaign) => <tr key={campaign.id}><td>{campaign.shop.name}</td><td>{campaign.name}</td><td>{campaign.destinationType}</td><td>{campaign.scanCount}</td><td>{campaign.isActive ? "Active" : "Inactive"}</td><td>{campaign.isActive ? <button type="button" onClick={() => void disable(campaign.id)}>Disable with audit</button> : "Preserved"}</td></tr>)}</tbody></table></div>}</section></> : null}
  </AdminPageShell>;
}

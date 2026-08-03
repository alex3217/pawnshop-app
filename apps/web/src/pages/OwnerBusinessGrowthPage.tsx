import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { exportCsv } from "../admin/utils/exportCsv";
import { getMyShops, type Shop } from "../services/shops";
import { getBusinessGrowth, type BusinessGrowth, type GrowthOpportunity } from "../services/businessGrowth";
import "../styles/owner-business-growth.css";

const verifiedRoutes = new Set(["/owner/items/new", "/owner/inventory", "/offers", "/owner/auctions/new", "/owner/auctions", "/marketplace/sales", "/owner/marketing", "/owner/onboarding", "/owner/finance", "/owner/subscription"]);
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const label = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()).replaceAll("Qr", "QR");
const formatUpdated = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not yet loaded";

const metricMeta: Record<string, { name: string; sourceWindow: string; explanation: string; route?: string; state?: "positive" | "neutral" | "attention" }> = {
  activeListings: { name: "Active listings", sourceWindow: "Current", explanation: "AVAILABLE and PENDING inventory at the time this report was generated.", route: "/owner/inventory", state: "positive" },
  inventoryAddedRecently: { name: "Inventory added", sourceWindow: "Trailing 30 days", explanation: "Items created during the API’s fixed trailing 30-day window.", route: "/owner/inventory", state: "neutral" },
  soldInventory: { name: "Items marked sold", sourceWindow: "All recorded activity", explanation: "Inventory records marked SOLD; this is distinct from completed marketplace transactions.", route: "/owner/inventory", state: "positive" },
  orders: { name: "Marketplace orders", sourceWindow: "All recorded activity", explanation: "All marketplace seller transactions, regardless of current transaction status.", route: "/marketplace/sales", state: "neutral" },
  completedSales: { name: "Completed marketplace sales", sourceWindow: "All recorded activity", explanation: "Marketplace seller transactions with COMPLETED status.", route: "/marketplace/sales", state: "positive" },
  pendingOffers: { name: "Pending offers", sourceWindow: "Current", explanation: "Offers currently waiting for a response.", route: "/offers", state: "attention" },
  auctions: { name: "Auctions (all statuses)", sourceWindow: "All recorded activity", explanation: "All auctions for this shop. The current service does not provide an active-only count.", route: "/owner/auctions", state: "neutral" },
  inquiries: { name: "Inquiries", sourceWindow: "All recorded activity", explanation: "All recorded inquiries for this shop’s inventory.", state: "neutral" },
  activeQrCampaigns: { name: "Active QR campaigns", sourceWindow: "Current", explanation: "Marketing campaigns currently active at report generation.", route: "/owner/marketing", state: "positive" },
  qrScans: { name: "QR scans", sourceWindow: "All recorded activity", explanation: "Total scans recorded across this shop’s campaigns.", route: "/owner/marketing", state: "positive" },
};

const benefitFor = (opportunity: GrowthOpportunity) => {
  if (opportunity.id === "photos") return "Improve listing completeness and buyer confidence.";
  if (opportunity.id === "descriptions") return "Give buyers clearer information before they inquire.";
  if (opportunity.id === "offers") return "Reduce the queue of offers awaiting an owner response.";
  if (opportunity.id === "marketing") return "Make an existing storefront campaign available for discovery.";
  if (opportunity.id === "stripe") return "Complete the existing payment-readiness requirement.";
  if (opportunity.id === "capacity") return "Review available listing capacity before adding inventory.";
  return "Address the operational evidence reported by PawnLoop.";
};

export default function OwnerBusinessGrowthPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [growth, setGrowth] = useState<BusinessGrowth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const refreshInFlight = useRef(false);

  const load = useCallback(async (id: string, signal?: AbortSignal, refresh = false) => {
    if (!id || (refresh && refreshInFlight.current)) return;
    if (refresh) { refreshInFlight.current = true; setRefreshing(true); } else setLoading(true);
    setError("");
    try { setGrowth(await getBusinessGrowth(id, signal)); }
    catch (cause) { if ((cause as Error)?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load Business Growth."); }
    finally { if (refresh) { refreshInFlight.current = false; setRefreshing(false); } else setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getMyShops(controller.signal).then((rows) => {
      setShops(rows); const first = rows[0]?.id || ""; setShopId(first);
      if (first) return load(first, controller.signal);
      setLoading(false);
    }).catch((cause) => { if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load shops."); setLoading(false); });
    return () => controller.abort();
  }, [load]);

  const currentShop = shops.find((shop) => shop.id === shopId) || null;
  const opportunities = useMemo(() => (growth?.opportunities || []).filter((item) => !item.complete && verifiedRoutes.has(item.route)), [growth]);
  const healthChecks = growth?.health.components.flatMap((component) => component.checks) || [];
  const completeChecks = healthChecks.filter((check) => check.complete).length;
  const metrics = growth ? Object.entries(growth.overview).map(([key, value]) => ({ key, value, ...(metricMeta[key] || { name: label(key), sourceWindow: "Current authorized snapshot", explanation: "Current value supplied by the Business Growth service.", state: "neutral" as const }) })) : [];

  function exportReport() {
    if (!growth || !currentShop) return;
    const generatedTimestamp = new Date().toISOString();
    exportCsv(`business-growth-${currentShop.id}.csv`, [
      ...metrics.map((metric) => ({ metric: metric.name, value: metric.value, reportingWindow: metric.sourceWindow, reportType: "Current authorized snapshot", shop: currentShop.name, generatedTimestamp })),
      { metric: "Gross marketplace sales", value: money(growth.revenueSummary.grossSalesCents), reportingWindow: "All recorded completed marketplace transactions", reportType: "Current authorized snapshot", shop: currentShop.name, generatedTimestamp },
      { metric: "Platform fees", value: money(growth.revenueSummary.platformFeesCents), reportingWindow: "All recorded completed marketplace transactions", reportType: "Current authorized snapshot", shop: currentShop.name, generatedTimestamp },
    ]);
  }

  const quickActions = currentShop ? [
    ["Add Inventory", "/owner/items/new"], ["Manage Inventory", "/owner/inventory"], ["Review Pending Offers", "/offers"], ["Create Auction", "/owner/auctions/new"], ["Manage Auctions", "/owner/auctions"], ["View Sales", "/marketplace/sales"], ["View Storefront", `/shops/${encodeURIComponent(currentShop.slug || currentShop.id)}`], ["Open Marketing Center", "/owner/marketing"],
  ] as const : [];

  return <main className="owner-business-growth-page">
    <header className="growth-hero"><p className="owner-business-growth-eyebrow">OWNER TOOLS</p><h1>Business Growth Center</h1><p>Operational performance and explainable next actions from your shop’s real PawnLoop activity.</p></header>

    <section className="growth-control-bar" aria-labelledby="growth-controls-title">
      <h2 id="growth-controls-title">Business Growth controls</h2>
      <div className="growth-controls-grid">
        <div className="growth-control"><span>Shop/location</span>{shops.length > 1 ? <select aria-label="Shop/location" value={shopId} onChange={(event) => { setShopId(event.target.value); setGrowth(null); void load(event.target.value); }}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select> : <strong>{currentShop?.name || "No shop available"}</strong>}</div>
        <div className="growth-control"><span>Reporting window</span><strong>Current authorized snapshot</strong></div>
        <label className="growth-control"><span>Compare</span><select aria-describedby="growth-comparison-note" value="Unavailable" disabled><option>Unavailable</option></select></label>
      </div>
      <p id="growth-comparison-note" className="growth-data-note">The current service returns one authorized snapshot and provides no selectable reporting periods or comparison datasets. Inventory Added is the only metric with a fixed trailing-30-day window.</p>
      <div className="growth-control-actions"><button type="button" onClick={() => void load(shopId, undefined, true)} disabled={!shopId || loading || refreshing} aria-busy={refreshing}>{refreshing ? "Refreshing Insights…" : "Refresh Insights"}</button><button type="button" onClick={exportReport} disabled={!growth}>Export Report</button>{currentShop ? <Link to={`/shops/${encodeURIComponent(currentShop.slug || currentShop.id)}`}>View Storefront</Link> : null}<Link to="/owner/marketing">Open Marketing Center</Link></div>
      <p className="growth-updated" role="status" aria-live="polite">Last updated: {formatUpdated(growth?.generatedAt || null)}</p>
    </section>

    {loading ? <section className="growth-state" role="status" aria-live="polite"><h2>Loading Business Growth</h2><p>Loading authorized shop activity…</p></section> : null}
    {error ? <section role="alert" className="growth-state growth-error"><h2>Business Growth unavailable</h2><p>{error}</p><button type="button" onClick={() => void load(shopId)}>Try again</button></section> : null}
    {!loading && !error && shops.length === 0 ? <section className="growth-state"><h2>No shop is available</h2><p>Create a shop before using Business Growth.</p><Link to="/owner/shops/new">Create shop</Link></section> : null}

    {growth ? <div className="growth-content">
      <section className="growth-panel"><div className="growth-section-heading"><div><h2>Quick Actions</h2><p>Verified destinations already available in PawnLoop.</p></div></div><nav className="growth-quick-actions" aria-label="Business Growth quick actions">{quickActions.map(([name, route]) => <Link key={name} to={route}>{name}</Link>)}</nav></section>

      <section className="growth-panel"><div className="growth-section-heading"><div><h2>Growth overview</h2><p>Current authorized snapshot generated by PawnLoop. Every metric states its real source window.</p></div><span className="growth-period-chip">Current authorized snapshot</span></div><dl className="owner-business-growth-metrics">{metrics.map((metric) => <div key={metric.key} className={`growth-metric growth-metric-${metric.state}`}><dt>{metric.name}</dt><dd><strong>{metric.value}</strong><span className="growth-metric-window">{metric.sourceWindow}</span><span>{metric.explanation}</span>{metric.route ? <Link to={metric.route} aria-label={`Open details for ${metric.name}`}>View details</Link> : null}</dd></div>)}</dl></section>

      <section className="growth-panel"><div className="growth-section-heading"><div><h2>Shop Health</h2><p>{completeChecks} of {healthChecks.length} checks complete. {growth.health.disclaimer}</p></div><strong>{growth.health.score} / {growth.health.maximum}</strong></div><progress max={growth.health.maximum} value={growth.health.score} aria-label={`Overall Shop Health ${growth.health.score} out of ${growth.health.maximum}`}>{growth.health.score} / {growth.health.maximum}</progress><p className="growth-version">Calculation: {growth.health.calculationVersion}</p><div className="owner-business-growth-components">{growth.health.components.map((component) => <article key={component.id}><h3>{component.label}</h3><progress max={component.maximum} value={component.score} aria-label={`${component.label} ${component.score} out of ${component.maximum}`}>{component.score} / {component.maximum}</progress><p>{component.score} of {component.maximum} points</p><ul>{component.checks.map((check) => <li key={check.id} className={check.complete ? "growth-check-complete" : "growth-check-incomplete"}><strong>{check.complete ? "Complete" : "Needs attention"}: {check.label}</strong><span>Evidence: {check.evidence || "Evidence unavailable"}</span>{check.recommendedAction ? <span>Recommended action: {check.recommendedAction}</span> : null}</li>)}</ul></article>)}</div></section>

      <section className="growth-panel"><div className="growth-section-heading"><div><h2>Recommended Next Actions</h2><p>Prioritized only from incomplete, explainable API recommendations.</p></div></div>{opportunities.length ? <div className="growth-opportunities">{opportunities.map((item) => <article key={item.id}><span className={`growth-priority growth-priority-${item.priority.toLowerCase()}`}>{item.priority} priority</span><h3>{item.action}</h3><p><strong>Reason:</strong> {item.reason}</p><p><strong>Supporting evidence:</strong> {item.supportingMetric !== undefined ? `${item.supportingMetric} reported by the service.` : item.reason}</p><p><strong>Operational benefit:</strong> {benefitFor(item)}</p><div className="growth-opportunity-actions"><Link to={item.route}>Take Action</Link><details><summary>Learn Why</summary><p>This action appears because the current Business Growth response reports: {item.reason}</p></details></div></article>)}</div> : <p>No incomplete rule-based recommendations are currently reported.</p>}</section>

      <div className="growth-two-column"><section className="growth-panel"><h2>Revenue Performance</h2><dl className="growth-detail-list"><div><dt>Completed marketplace sales</dt><dd>{growth.revenueSummary.completedSales}</dd></div><div><dt>Gross marketplace sales</dt><dd>{money(growth.revenueSummary.grossSalesCents)}</dd></div><div><dt>Platform fees</dt><dd>{money(growth.revenueSummary.platformFeesCents)}</dd></div></dl><p>{growth.revenueSummary.note}</p></section><section className="growth-panel"><h2>Inventory Insights</h2><dl className="growth-detail-list">{Object.entries(growth.inventoryInsights).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{value}</dd></div>)}</dl></section></div>

      <section className="growth-panel"><h2>Customer Insights</h2><p>Privacy-conscious aggregate counts only.</p><dl className="growth-detail-list">{Object.entries(growth.customerInsights).filter(([, value]) => typeof value === "number").map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{String(value)}</dd></div>)}</dl></section>

      <section className="growth-panel"><h2>Marketplace Intelligence</h2><p>Aggregate shop-scoped data only · {growth.marketplaceIntelligence.access.level} access.</p>{growth.marketplaceIntelligence.access.planLimited ? <p className="growth-data-note">{growth.marketplaceIntelligence.access.limitation}</p> : null}<h3>Category performance</h3>{growth.marketplaceIntelligence.categoryPerformance.length ? <div className="owner-business-growth-table" tabIndex={0} aria-label="Category performance table"><table><thead><tr><th>Category</th><th>Active</th><th>Completed</th></tr></thead><tbody>{growth.marketplaceIntelligence.categoryPerformance.map((row) => <tr key={String(row.category)}><td>{String(row.category)}</td><td>{String(row.activeListings)}</td><td>{String(row.completedSales)}</td></tr>)}</tbody></table></div> : <p>Category performance is unavailable because there is insufficient activity.</p>}<p><small>{growth.marketplaceIntelligence.limitations.join(" ")}</small></p></section>

      <section className="growth-panel growth-unavailable"><h2>Data availability</h2><p>These capabilities are not supplied by the current authorized service and are intentionally not estimated:</p><ul>{(growth.unavailable || ["benchmarking", "persistentGoals"]).map((item) => <li key={item}>{label(item)}</li>)}</ul></section>
    </div> : null}
  </main>;
}

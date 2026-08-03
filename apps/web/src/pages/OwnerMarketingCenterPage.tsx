import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getMyShops, type Shop } from "../services/shops";
import {
  createMarketingCampaign,
  deleteMarketingCampaign,
  downloadCampaignQr,
  listMarketingCampaigns,
  updateMarketingCampaign,
  type MarketingDestinationType,
  type ShopMarketingCampaign,
} from "../services/shopMarketing";
import { downloadMarketingAsset, getCustomerGrowth, getMarketingTemplates, getShopReferrals, type CustomerGrowth, type MarketingTemplate } from "../services/customerEngagement";
import "../styles/owner-workspace-readability.css";

const DESTINATIONS: Array<[MarketingDestinationType, string]> = [
  ["STOREFRONT", "Shop storefront"], ["INVENTORY", "Inventory"],
  ["NEW_ARRIVALS", "New arrivals"], ["AUCTIONS", "Auctions"], ["DEALS", "Deals"],
  ["ITEM", "Specific item"], ["CATEGORY", "Category"], ["SELL_ITEM", "Sell an item"],
  ["PAWN_INQUIRY", "Pawn inquiry"], ["FOLLOW_SHOP", "Follow shop"],
  ["REVIEW_REQUEST", "Review request"], ["CUSTOMER_REGISTRATION", "Customer registration"],
  ["BUYER_REFERRAL", "Buyer referral"], ["PAWNSHOP_REFERRAL", "Pawnshop referral"],
];

export default function OwnerMarketingCenterPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [campaigns, setCampaigns] = useState<ShopMarketingCampaign[]>([]);
  const [shopSlug, setShopSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState("");
  const [destination, setDestination] = useState<MarketingDestinationType>("STOREFRONT");
  const [resourceId, setResourceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [growth, setGrowth] = useState<CustomerGrowth | null>(null);
  const [referrals, setReferrals] = useState<{ code: string; link: string; events: Record<string, number>; rewards: { available: false; issued: number } } | null>(null);
  const [productItemId, setProductItemId] = useState("");

  const loadCampaigns = useCallback(async (selectedShopId: string, signal?: AbortSignal) => {
    const [result, templateResult, growthResult, referralResult] = await Promise.all([
      listMarketingCampaigns(selectedShopId, signal), getMarketingTemplates(selectedShopId), getCustomerGrowth(selectedShopId), getShopReferrals(selectedShopId),
    ]);
    setCampaigns(result.campaigns);
    setShopSlug(result.shop.slug);
    setTemplates(templateResult.templates); setGrowth(growthResult.growth); setReferrals(referralResult.referrals);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getMyShops(controller.signal)
      .then(async (rows) => {
        setShops(rows);
        const first = rows[0]?.id || "";
        setShopId(first);
        if (first) await loadCampaigns(first, controller.signal);
      })
      .catch((cause) => {
        if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load Marketing Center.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [loadCampaigns]);

  async function selectShop(nextShopId: string) {
    setShopId(nextShopId); setError(""); setMessage(""); setLoading(true);
    try { await loadCampaigns(nextShopId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load campaigns."); }
    finally { setLoading(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!shopId) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await createMarketingCampaign(shopId, {
        name: name.trim(), destinationType: destination,
        placementLabel: placement.trim() || null,
        resourceId: ["ITEM", "CATEGORY"].includes(destination) ? resourceId.trim() || null : null,
      });
      setName(""); setPlacement(""); setResourceId("");
      await loadCampaigns(shopId);
      setMessage("Campaign created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create campaign."); }
    finally { setSaving(false); }
  }

  async function toggle(campaign: ShopMarketingCampaign) {
    setError(""); setMessage("");
    try {
      await updateMarketingCampaign(shopId, campaign.id, { isActive: !campaign.isActive });
      await loadCampaigns(shopId);
      setMessage(campaign.isActive ? "Campaign deactivated." : "Campaign activated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update campaign."); }
  }

  async function remove(campaign: ShopMarketingCampaign) {
    if (!window.confirm(`Delete campaign “${campaign.name}”?`)) return;
    setError(""); setMessage("");
    try { await deleteMarketingCampaign(shopId, campaign.id); await loadCampaigns(shopId); setMessage("Campaign deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete campaign."); }
  }

  return (
    <main className="owner-readable-page owner-marketing-page">
      <header><p className="owner-marketing-eyebrow">OWNER TOOLS</p><h1>Marketing Center</h1><p>Create shop-specific links and QR codes. Every destination stays inside PawnLoop.</p></header>
      {error ? <div role="alert" className="error-text">{error}</div> : null}
      {message ? <div role="status" className="success-text">{message}</div> : null}
      {loading ? <p aria-live="polite">Loading Marketing Center…</p> : null}
      {!loading && shops.length === 0 ? <section className="list-card"><h2>No shop is available</h2><p>Create and complete a shop before creating marketing campaigns.</p><Link className="button" to="/owner/shops/new">Create shop</Link></section> : null}
      {shops.length ? <>
        <label style={{ display: "grid", gap: 6, maxWidth: 420, margin: "18px 0" }}>Shop
          <select value={shopId} onChange={(event) => void selectShop(event.target.value)}>{shops.map((shop) => <option value={shop.id} key={shop.id}>{shop.name}</option>)}</select>
        </label>
        <section className="list-card"><h2>Permanent shop QR</h2><p>Your default QR opens <Link to={`/shops/${shopSlug}`}>/shops/{shopSlug}</Link> directly. The short link remains stable if the storefront destination evolves.</p></section>
        <section className="list-card" style={{ marginTop: 16 }}><h2>Printable Materials</h2><p>Code-owned, print-ready PDFs use active internal campaigns so every QR opens this shop or the selected public item.</p><label>Public item ID for product display card<input value={productItemId} onChange={(event) => setProductItemId(event.target.value)} /></label><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 12 }}>{templates.map((template) => <article key={template.type}><strong>{template.name}</strong><p>{template.size.replaceAll("_", " ")} · {template.minimumPlan === "PREMIUM" ? "Plus" : template.minimumPlan}+</p><button type="button" disabled={!template.available || (template.type === "PRODUCT_DISPLAY_CARD" && !productItemId.trim())} onClick={() => void downloadMarketingAsset(shopId, template.type, template.type === "PRODUCT_DISPLAY_CARD" ? productItemId.trim() : undefined).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to download PDF."))}>{template.available ? "Download PDF" : "Plan limited"}</button></article>)}</div></section>
        <section className="list-card" style={{ marginTop: 16 }}><h2>Customer Growth</h2>{growth ? <><div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}><strong>{growth.followers} followers</strong><span>{growth.newFollowers} new</span><span>{growth.qrScans} QR scans</span><span>{growth.messages} messages</span><span>{growth.offers} offers</span></div><p>Alert opt-ins: {growth.alertPreferences.newArrivals} new arrivals · {growth.alertPreferences.deals} deals · {growth.alertPreferences.auctions} auctions · {growth.alertPreferences.general} announcements</p><ul>{growth.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul><small>Aggregate only. Buyer contact data is never included.</small></> : <p>No aggregate growth data is available.</p>}</section>
        <section className="list-card" style={{ marginTop: 16 }}><h2>Referrals</h2>{referrals ? <><p>Stable internal link: <a href={referrals.link}>{referrals.link}</a></p><p>{Object.values(referrals.events).reduce((total, value) => total + value, 0)} attributed events. Rewards are unavailable in V1 and none are issued.</p></> : <p>No referral foundation is available.</p>}</section>
        <section className="list-card" style={{ marginTop: 16 }}><h2>Create campaign</h2>
          <form onSubmit={create} style={{ display: "grid", gap: 10, maxWidth: 620 }}>
            <label>Campaign name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></label>
            <label>Placement label<input value={placement} onChange={(event) => setPlacement(event.target.value)} maxLength={160} placeholder="Front door, receipt, social post…" /></label>
            <label>Destination<select value={destination} onChange={(event) => setDestination(event.target.value as MarketingDestinationType)}>{DESTINATIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
            {["ITEM", "CATEGORY"].includes(destination) ? <label>{destination === "ITEM" ? "Public item ID" : "Category"}<input value={resourceId} onChange={(event) => setResourceId(event.target.value)} required /></label> : null}
            <button className="button" disabled={saving}>{saving ? "Creating…" : "Create campaign"}</button>
          </form>
        </section>
        <section style={{ marginTop: 18 }}><h2>Campaigns</h2>
          {!loading && campaigns.length === 0 ? <p>No campaigns yet.</p> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {campaigns.map((campaign) => <article className="list-card" key={campaign.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><h3>{campaign.name}</h3><strong>{campaign.isActive ? "Active" : "Inactive"}</strong></div>
              <p>{campaign.destinationType.replaceAll("_", " ")} · {campaign.scanCount} scans</p>
              <p><a href={campaign.redirectPath} target="_blank" rel="noreferrer">{window.location.origin}{campaign.redirectPath}</a></p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button className="button" type="button" onClick={() => void toggle(campaign)}>{campaign.isActive ? "Deactivate" : "Activate"}</button>
                <button className="button" type="button" onClick={() => void downloadCampaignQr(campaign.svgPath, `${campaign.name}.svg`)}>Download SVG</button>
                <button className="button" type="button" onClick={() => void downloadCampaignQr(campaign.pngPath, `${campaign.name}.png`)}>Download PNG</button>
                {!campaign.isDefault ? <button className="button" type="button" onClick={() => void remove(campaign)}>Delete</button> : null}
              </div>
            </article>)}
          </div>
        </section>
      </> : null}
    </main>
  );
}

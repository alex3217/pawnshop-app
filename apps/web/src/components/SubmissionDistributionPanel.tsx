import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { distributeBuyerItemSubmission, searchSubmissionShops, type DistributionShop, type SubmissionDistributionMode } from "../services/buyerItemSubmissions";

type Props = { submissionId: string; marketplaceListingId?: string | null; marketplacePrice?: number | null; defaultRadius?: number; onDistributed?: () => void };
const modes: Array<[SubmissionDistributionMode, string]> = [
  ["ONE_SHOP", "One shop"], ["SELECTED_SHOPS", "Selected shops"], ["NEARBY_SHOPS", "Nearby shops"],
  ["MARKETPLACE", "Marketplace only"], ["SELECTED_SHOPS_AND_MARKETPLACE", "Selected shops + marketplace"], ["NEARBY_SHOPS_AND_MARKETPLACE", "Nearby shops + marketplace"],
];

export default function SubmissionDistributionPanel({ submissionId, marketplaceListingId, marketplacePrice, defaultRadius = 25, onDistributed }: Props) {
  const [mode, setMode] = useState<SubmissionDistributionMode | "">("");
  const [query, setQuery] = useState(""); const [shops, setShops] = useState<DistributionShop[]>([]); const [selected, setSelected] = useState<DistributionShop[]>([]);
  const [limit, setLimit] = useState(10); const [reviewing, setReviewing] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const usesSelected = mode === "ONE_SHOP" || mode === "SELECTED_SHOPS" || mode === "SELECTED_SHOPS_AND_MARKETPLACE";
  const usesNearby = mode === "NEARBY_SHOPS" || mode === "NEARBY_SHOPS_AND_MARKETPLACE";
  const usesMarketplace = mode === "MARKETPLACE" || mode === "SELECTED_SHOPS_AND_MARKETPLACE" || mode === "NEARBY_SHOPS_AND_MARKETPLACE";
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void searchSubmissionShops(query, controller.signal).then((result) => { setShops(result.shops); setLimit(result.selectedShopLimit); }).catch((error) => { if (error?.name !== "AbortError") setMessage(error instanceof Error ? error.message : "Shop search failed"); }), 200); return () => { controller.abort(); window.clearTimeout(timer); }; }, [query]);
  const canReview = Boolean(mode) && (!usesSelected || (mode === "ONE_SHOP" ? selected.length === 1 : selected.length > 0)) && (!usesMarketplace || marketplaceListingId || marketplacePrice);
  const summary = useMemo(() => selected.map((shop) => shop.name).join(", "), [selected]);
  function toggle(shop: DistributionShop) { setSelected((current) => current.some((item) => item.id === shop.id) ? current.filter((item) => item.id !== shop.id) : current.length >= limit ? current : [...current, shop]); }
  async function submit() {
    if (!mode) return; setBusy(true); setMessage("");
    try {
      const origin = usesNearby ? await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject)) : null;
      await distributeBuyerItemSubmission(submissionId, { distributionMode: mode, shopIds: selected.map((shop) => shop.id), radiusMiles: defaultRadius, latitude: origin?.coords.latitude, longitude: origin?.coords.longitude, marketplace: usesMarketplace ? { marketplaceListingId: marketplaceListingId || undefined, price: marketplacePrice || undefined, quantity: 1, pickupAvailable: true, shippingAvailable: false } : undefined });
      setMessage("Your item opportunity was distributed."); setReviewing(false); onDistributed?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Distribution failed"); } finally { setBusy(false); }
  }
  return <section className="sellitem-next-card" aria-labelledby="distribution-title">
    <div className="sellitem-section-title"><span>Offer my item</span><h2 id="distribution-title">Choose exactly where this opportunity goes</h2><p>Marketplace publication is never selected automatically. Shops cannot see one another or competing offers.</p></div>
    <label><span>Distribution choice</span><select value={mode} onChange={(event) => { setMode(event.target.value as SubmissionDistributionMode); setReviewing(false); setSelected([]); }}><option value="">Choose distribution…</option>{modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {usesSelected ? <><label><span>Search shops by name, city, state, ZIP, address, or keyword</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pawnshops" /></label><div className="sellitem-flow-list">{shops.map((shop) => <div key={shop.id}><label><input type="checkbox" checked={selected.some((item) => item.id === shop.id)} onChange={() => toggle(shop)} disabled={!selected.some((item) => item.id === shop.id) && selected.length >= limit} /> <strong>{shop.name}</strong></label><span>{[shop.address, shop.city, shop.state, shop.zip].filter(Boolean).join(", ")}{shop.distanceMiles != null ? ` · ${shop.distanceMiles} mi` : ""}</span><Link to={`/shops/${shop.id}`}>View shop profile</Link></div>)}</div><div className="sellitem-mini-actions" aria-label="Selected shops">{selected.map((shop) => <button type="button" key={shop.id} onClick={() => toggle(shop)}>{shop.name} ×</button>)}</div><small>{selected.length} of {limit} shops selected</small></> : null}
    {usesNearby ? <p>Nearby shops within {defaultRadius} miles will be resolved from your location when you confirm.</p> : null}
    {usesMarketplace ? <p>Marketplace draft: {marketplaceListingId || "will be created after required photo, price, quantity, and fulfillment checks"}</p> : null}
    {!reviewing ? <button type="button" disabled={!canReview} onClick={() => setReviewing(true)}>Review distribution</button> : <div className="sellitem-preview-card"><strong>Final review</strong><p>Mode: {mode}</p>{usesSelected ? <p>Shops: {summary}</p> : null}<p>Public marketplace: {usesMarketplace ? "Draft requested explicitly" : "No"}</p><button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Distributing…" : "Offer my item"}</button><button type="button" className="secondary" disabled={busy} onClick={() => setReviewing(false)}>Back</button></div>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

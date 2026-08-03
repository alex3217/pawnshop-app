import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getBuyerPreferences, patchBuyerPreferences, type BuyerPreferences } from "../services/buyerPreferences";
import { RECENTLY_VIEWED_ENABLED_KEY } from "../services/recentlyViewed.mjs";
import "../styles/buyer-account.css";

const toggles: Array<[keyof BuyerPreferences, string]> = [
  ["savedSearchNotifications", "Saved-search notifications"],
  ["priceDropAlerts", "Price-drop alerts"],
  ["auctionAlerts", "Auction alerts"],
  ["followedShopAlerts", "Followed-shop alerts"],
  ["marketingCommunications", "Marketing communications"],
  ["recentlyViewedEnabled", "Store recently viewed items in this browser"],
];

export default function BuyerSettingsPage() {
  const [form, setForm] = useState<BuyerPreferences | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getBuyerPreferences(controller.signal).then(setForm).catch((cause) => {
      if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load account settings.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => { if (error || notice) statusRef.current?.focus(); }, [error, notice]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await patchBuyerPreferences({
        displayName: form.displayName, phone: form.phone, locationLabel: form.locationLabel,
        searchRadiusMiles: Number(form.searchRadiusMiles), savedSearchNotifications: form.savedSearchNotifications,
        priceDropAlerts: form.priceDropAlerts, auctionAlerts: form.auctionAlerts,
        followedShopAlerts: form.followedShopAlerts, marketingCommunications: form.marketingCommunications,
        recentlyViewedEnabled: form.recentlyViewedEnabled,
      });
      setForm(updated);
      try { localStorage.setItem(RECENTLY_VIEWED_ENABLED_KEY, String(updated.recentlyViewedEnabled)); } catch { /* Preference remains server-backed. */ }
      setNotice("Buyer settings saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save buyer settings."); }
    finally { setSaving(false); }
  }

  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
    <header><p className="section-eyebrow">ACCOUNT</p><h1>Account Settings</h1><p>Manage buyer profile, discovery, communication, and browser-history preferences.</p></header>
    <div ref={statusRef} tabIndex={-1} aria-live="polite">{error ? <p role="alert" className="error-text">{error}</p> : notice ? <p>{notice}</p> : null}</div>
    {!form && !error ? <p>Loading account settings…</p> : null}
    {form ? <form className="space-y-6" onSubmit={submit}>
      <section className="list-card"><h2>Profile and search defaults</h2><div className="grid gap-4 md:grid-cols-2">
        <label>Display name<input required maxLength={120} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
        <label>Email<input value={form.email} readOnly aria-describedby="email-help" /></label>
        <p id="email-help" className="md:col-start-2">Email changes require a verified workflow and are not available here.</p>
        <label>Phone<input type="tel" maxLength={30} value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value || null })} /></label>
        <label>Default city, state, or location<input maxLength={120} value={form.locationLabel || ""} onChange={(event) => setForm({ ...form, locationLabel: event.target.value || null })} /></label>
        <label>Search radius in miles<input type="number" min={1} max={250} value={form.searchRadiusMiles} onChange={(event) => setForm({ ...form, searchRadiusMiles: Number(event.target.value) })} /></label>
      </div></section>
      <section className="list-card"><h2>Alerts, communications, and privacy</h2><div className="grid gap-3">{toggles.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} /> {label}</label>)}</div><p>Recently viewed history is browser-local and never synchronized across devices.</p></section>
      <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button><Link className="btn btn-secondary" to="/account/payment-methods">Payment Methods</Link><Link className="btn btn-secondary" to="/forgot-password">Reset password</Link></div>
    </form> : null}
  </main>;
}

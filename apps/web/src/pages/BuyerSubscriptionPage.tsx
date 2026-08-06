import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  createBuyerCheckout,
  formatBuyerLimit,
  getBuyerPlanCatalog,
  getBuyerPlanUsage,
  manageBuyerCancellation,
  openBuyerBillingPortal,
  type BuyerPlanCatalogEntry,
  type BuyerPlanUsage,
} from "../services/buyerPlans";

const money = (cents: number, currency = "USD") => cents === 0
  ? "Free"
  : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
const date = (value: string | null) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleDateString()
  : "Not scheduled";
const isStripeUrl = (value: string) => {
  const target = new URL(value);
  return target.protocol === "https:" && (target.hostname === "stripe.com" || target.hostname.endsWith(".stripe.com"));
};

export default function BuyerSubscriptionPage() {
  const [usage, setUsage] = useState<BuyerPlanUsage | null>(null);
  const [plans, setPlans] = useState<BuyerPlanCatalogEntry[]>([]);
  const [interval, setInterval] = useState<"MONTH" | "YEAR">("MONTH");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [params, setParams] = useSearchParams();
  const statusRef = useRef<HTMLDivElement>(null);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const [nextUsage, catalog] = await Promise.all([
        getBuyerPlanUsage(signal),
        getBuyerPlanCatalog(signal),
      ]);
      setUsage(nextUsage);
      setPlans(catalog.plans);
      if (nextUsage.subscription.billingInterval === "YEAR") setInterval("YEAR");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (cause?.name !== "AbortError") {
        setError(cause instanceof Error ? cause.message : "Unable to load buyer subscription.");
      }
    });
    const checkout = params.get("checkout");
    if (checkout === "success") setNotice("Checkout completed. Your plan will update after Stripe confirms the subscription.");
    if (checkout === "canceled") setNotice("Checkout was canceled. Your plan has not changed.");
    if (checkout) {
      const next = new URLSearchParams(params);
      next.delete("checkout");
      setParams(next, { replace: true });
    }
    return () => controller.abort();
  // URL result state is intentionally consumed once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (notice || error) statusRef.current?.focus(); }, [notice, error]);

  async function openPortal(busyKey = "portal") {
    setBusy(busyKey);
    setError("");
    setNotice("");
    try {
      const result = await openBuyerBillingPortal(window.location.href);
      if (!isStripeUrl(result.url)) throw new Error("Stripe returned an untrusted billing URL.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open billing.");
      setBusy("");
    }
  }

  async function choose(plan: BuyerPlanCatalogEntry) {
    setBusy(plan.code);
    setError("");
    setNotice("");
    try {
      if (plan.isFree) {
        if (!usage?.subscription.isPaid) return;
        const result = await manageBuyerCancellation(true);
        setUsage((current) => current ? {
          ...current,
          subscription: { ...current.subscription, cancelAtPeriodEnd: result.cancelAtPeriodEnd },
        } : current);
        setNotice("Your paid plan is scheduled to end at the current period end. Stripe confirmation is pending.");
        return;
      }
      if (usage?.subscription.isPaid) {
        await openPortal(plan.code);
        return;
      }
      const result = await createBuyerCheckout(plan.code, interval);
      if (!isStripeUrl(result.url)) throw new Error("Stripe returned an untrusted checkout URL.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to manage subscription.");
    } finally {
      setBusy("");
    }
  }

  async function resume() {
    setBusy("resume");
    setError("");
    try {
      const result = await manageBuyerCancellation(false);
      setUsage((current) => current ? {
        ...current,
        subscription: { ...current.subscription, cancelAtPeriodEnd: result.cancelAtPeriodEnd },
      } : current);
      setNotice("Your cancellation reversal was sent to Stripe. Confirmation is pending.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to resume subscription.");
    } finally {
      setBusy("");
    }
  }

  const usageCards = usage ? [
    ["Saved searches", usage.usage.savedSearches],
    ["Watchlist items", usage.usage.watchlistItems],
  ] as const : [];
  const stateGuidance: Record<string, string> = {
    PAST_DUE: "A payment failed. Open Billing to update your payment method.",
    INCOMPLETE: "Stripe needs more information before this subscription can activate.",
    INCOMPLETE_EXPIRED: "This incomplete subscription expired; select a plan to try again.",
    CANCELED: "Your paid subscription has ended. Core commerce remains available on Free.",
    PAUSED: "Billing is paused. Open Billing for available next steps.",
  };

  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
    <header className="page-card">
      <p className="section-eyebrow">BUYER PLAN</p>
      <h1>Buyer Subscription</h1>
      <p>Manage billing and compare benefits that are available now. Browsing, purchasing, offers, auctions, and order tracking remain on Free.</p>
    </header>
    <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite">
      {error ? <div className="list-card" role="alert"><strong>Unable to complete that request.</strong><p>{error}</p><button className="btn btn-secondary" onClick={() => { setError(""); void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to reload.")); }}>Try again</button></div> : notice ? <div className="list-card">{notice}</div> : null}
    </div>
    {loading && !usage ? <p className="list-card" aria-live="polite">Loading buyer subscription…</p> : null}
    {usage ? <>
      <section className="list-card" aria-labelledby="current-plan">
        <p className="section-eyebrow">CURRENT PLAN</p>
        <h2 id="current-plan">{usage.subscription.displayName}</h2>
        <p><strong>Status:</strong> {usage.subscription.status.replaceAll("_", " ")} · <strong>Billing:</strong> {usage.subscription.billingInterval?.toLowerCase() || "No paid interval"}</p>
        {usage.subscription.storedPlan !== usage.subscription.effectivePlan ? <p>Stored plan: {usage.subscription.storedPlan}; effective access: {usage.subscription.effectivePlan} because of billing status.</p> : null}
        <p><strong>Current period ends:</strong> {date(usage.subscription.currentPeriodEnd)}</p>
        {usage.subscription.cancelAtPeriodEnd ? <p><strong>Cancellation scheduled.</strong> Access continues through the date above.</p> : null}
        {stateGuidance[usage.subscription.status] ? <p>{stateGuidance[usage.subscription.status]}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" disabled={Boolean(busy) || !usage.subscription.isPaid} onClick={() => void openPortal()}>{busy === "portal" ? "Opening Stripe…" : "Manage Billing"}</button>
          <Link className="btn btn-secondary" to="/account/payment-methods">Payment Methods</Link>
          {usage.subscription.cancelAtPeriodEnd ? <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void resume()}>{busy === "resume" ? "Working…" : "Resume subscription"}</button> : null}
        </div>
      </section>
      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading">Usage and limits</h2>
        <div className="grid gap-3 md:grid-cols-2">{usageCards.map(([label, value]) => <article className="list-card" key={label}><h3>{label}</h3><p className="text-2xl font-bold">{value.used} / {formatBuyerLimit(value.limit)}</p>{value.atLimit ? <p>This plan limit has been reached.</p> : <p>{value.unlimited ? "No plan limit" : `${value.remaining} remaining`}</p>}</article>)}</div>
      </section>
      <section aria-labelledby="compare-plans">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="compare-plans">Compare plans</h2><p>Only implemented benefits are listed under Available now.</p>{usage.subscription.isPaid ? <p>Upgrades, downgrades, billing interval changes, and payment management are completed securely in Stripe.</p> : null}</div><fieldset><legend className="text-sm font-bold">Billing interval</legend><div className="flex gap-3"><label><input type="radio" name="billing" checked={interval === "MONTH"} onChange={() => setInterval("MONTH")} /> Monthly</label><label><input type="radio" name="billing" checked={interval === "YEAR"} onChange={() => setInterval("YEAR")} /> Yearly</label></div></fieldset></div>
        {plans.length === 0 ? <div className="list-card" role="status"><h3>Plans are temporarily unavailable</h3><p>No buyer plans are available to compare. Your current access is unchanged.</p></div> : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => {
          const current = plan.code === usage.subscription.effectivePlan;
          const price = interval === "YEAR" ? plan.yearlyPriceCents : plan.monthlyPriceCents;
          const configured = interval === "YEAR" ? plan.yearlyCheckoutConfigured : plan.monthlyCheckoutConfigured;
          return <article className="list-card" key={plan.code} aria-label={`${plan.label} plan${current ? ", current plan" : ""}`}>
            <h3>{plan.label}</h3>
            {current ? <p><strong>Current plan</strong></p> : null}
            <p className="text-2xl font-bold">{money(price, plan.currency)}{price ? interval === "YEAR" ? " / year" : " / month" : ""}</p>
            {interval === "YEAR" && plan.annualSavingsCents > 0 ? <p>Save {money(plan.annualSavingsCents, plan.currency)} annually</p> : null}
            <p>{formatBuyerLimit(plan.maxSavedSearches)} saved searches · {formatBuyerLimit(plan.maxWatchlistItems)} watchlist items</p>
            <h4>Available now</h4>
            <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {!current && !(plan.isFree && usage.subscription.cancelAtPeriodEnd) ? <button className="btn btn-primary" disabled={Boolean(busy) || (!plan.isFree && !usage.subscription.isPaid && !configured)} onClick={() => void choose(plan)}>{busy === plan.code ? usage.subscription.isPaid && !plan.isFree ? `Opening ${plan.label} plan in Stripe…` : "Working…" : plan.isFree ? "Downgrade to Free" : usage.subscription.isPaid ? `Manage ${plan.label} plan in Stripe` : `Choose ${plan.label}`}</button> : null}
            {!usage.subscription.isPaid && !configured ? <p role="note"><strong>This billing interval is not configured yet.</strong> Choose another interval or check back later.</p> : null}
          </article>;
        })}</div>}
      </section>
    </> : null}
  </main>;
}

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createBuyerCheckout, formatBuyerLimit, getBuyerPlanCatalog, getBuyerPlanUsage, manageBuyerCancellation, openBuyerBillingPortal, type BuyerPlanCatalogEntry, type BuyerPlanUsage } from "../services/buyerPlans";
import "../styles/buyer-subscription.css";

type Interval = "MONTH" | "YEAR";
const money = (cents: number, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const date = (value: string | null) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Not scheduled";
const isStripeUrl = (value: string) => { const target = new URL(value); return target.protocol === "https:" && (target.hostname === "stripe.com" || target.hostname.endsWith(".stripe.com")); };
const statusLabel = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

export default function BuyerSubscriptionPage() {
  const [usage, setUsage] = useState<BuyerPlanUsage | null>(null);
  const [plans, setPlans] = useState<BuyerPlanCatalogEntry[]>([]);
  const [interval, setInterval] = useState<Interval>("MONTH");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [params, setParams] = useSearchParams();
  const statusRef = useRef<HTMLDivElement>(null);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const [nextUsage, catalog] = await Promise.all([getBuyerPlanUsage(signal), getBuyerPlanCatalog(signal)]);
      setUsage(nextUsage); setPlans(catalog.plans);
      if (nextUsage.subscription.billingInterval === "YEAR") setInterval("YEAR");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => { if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load buyer membership."); });
    const checkout = params.get("checkout");
    if (checkout === "success") setNotice("Checkout completed. Your membership will update after Stripe confirms it.");
    if (checkout === "canceled") setNotice("Checkout was canceled. Your membership has not changed.");
    if (checkout) { const next = new URLSearchParams(params); next.delete("checkout"); setParams(next, { replace: true }); }
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (notice || error) statusRef.current?.focus(); }, [notice, error]);

  async function openPortal(key = "portal") {
    setBusy(key); setError(""); setNotice("");
    try { const result = await openBuyerBillingPortal(window.location.href); if (!isStripeUrl(result.url)) throw new Error("Stripe returned an untrusted billing URL."); window.location.assign(result.url); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open billing."); setBusy(""); }
  }

  async function choose(plan: BuyerPlanCatalogEntry) {
    if (!usage) return;
    setBusy(plan.code); setError(""); setNotice("");
    try {
      if (plan.isFree) {
        if (!usage.subscription.canManageSubscription) return;
        if (!usage.subscription.isPaid || usage.subscription.cancelAtPeriodEnd) { await openPortal(plan.code); return; }
        const result = await manageBuyerCancellation(true);
        setUsage((current) => current ? { ...current, subscription: { ...current.subscription, cancelAtPeriodEnd: result.cancelAtPeriodEnd } } : current);
        setNotice("Your paid membership is scheduled to end at the current period end. Stripe confirmation is pending.");
      } else if (usage.subscription.canManageBilling && usage.subscription.canManageSubscription && !["CANCELED", "INCOMPLETE_EXPIRED"].includes(usage.subscription.status)) {
        await openPortal(plan.code);
      } else {
        const result = await createBuyerCheckout(plan.code, interval);
        if (!isStripeUrl(result.url)) throw new Error("Stripe returned an untrusted checkout URL.");
        window.location.assign(result.url);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to manage membership."); }
    finally { setBusy(""); }
  }

  async function resume() {
    setBusy("resume"); setError("");
    try { const result = await manageBuyerCancellation(false); setUsage((current) => current ? { ...current, subscription: { ...current.subscription, cancelAtPeriodEnd: result.cancelAtPeriodEnd } } : current); setNotice("Your cancellation reversal was sent to Stripe. Confirmation is pending."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to resume membership."); }
    finally { setBusy(""); }
  }

  const selectedUnavailable = plans.filter((plan) => !plan.isFree && !(interval === "YEAR" ? plan.yearlyCheckoutConfigured : plan.monthlyCheckoutConfigured));
  const canManageBilling = Boolean(usage?.subscription.canManageBilling);
  const currentRank = plans.find((plan) => plan.code === usage?.subscription.effectivePlan)?.rank ?? 0;
  const stateGuidance: Record<string, string> = { PAST_DUE: "A payment failed. Manage billing to update your payment method.", INCOMPLETE: "Stripe needs more information before this membership can activate.", INCOMPLETE_EXPIRED: "This incomplete membership expired; choose a plan to try again.", CANCELED: "Your paid membership ended, so Free access applies.", PAUSED: "Billing is paused. Manage billing for available next steps." };

  return <main className="buyer-membership-page">
    <header className="buyer-membership-hero page-card"><p className="section-eyebrow">BUYER MEMBERSHIP</p><h1>Buyer Membership</h1><p>Compare buyer plans, understand your current access, and manage subscription billing securely.</p></header>
    <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite">{error ? <div className="buyer-membership-message" role="alert"><strong>Unable to complete that request.</strong><p>{error}</p><button className="btn btn-secondary" onClick={() => { setError(""); void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to reload.")); }}>Try again</button></div> : notice ? <div className="buyer-membership-message">{notice}</div> : null}</div>
    {loading && !usage ? <p className="buyer-membership-message" aria-live="polite">Loading buyer membership…</p> : null}
    {usage ? <>
      <section className="buyer-membership-summary" aria-labelledby="current-membership"><div><p className="section-eyebrow">CURRENT MEMBERSHIP</p><h2 id="current-membership">{usage.subscription.displayName}</h2><p className={`buyer-membership-status buyer-membership-status--${usage.subscription.status.toLowerCase()}`}>{statusLabel(usage.subscription.status)}</p></div><dl><div><dt>Billing interval</dt><dd>{usage.subscription.billingInterval ? statusLabel(usage.subscription.billingInterval) : "Free plan"}</dd></div><div><dt>{usage.subscription.cancelAtPeriodEnd ? "Cancellation date" : "Renewal date"}</dt><dd>{date(usage.subscription.currentPeriodEnd)}</dd></div>{usage.subscription.storedPlan !== usage.subscription.effectivePlan ? <div><dt>Billing plan</dt><dd>{statusLabel(usage.subscription.storedPlan)} · Free access currently applies</dd></div> : null}</dl><div className="buyer-membership-summary__actions">{canManageBilling ? <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void openPortal()}>{busy === "portal" ? "Opening Stripe…" : "Manage billing"}</button> : null}<Link className="btn btn-secondary" to="/account/payment-methods">Payment methods</Link>{usage.subscription.cancelAtPeriodEnd && usage.subscription.canManageSubscription ? <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => void resume()}>{busy === "resume" ? "Working…" : "Resume membership"}</button> : null}</div>{stateGuidance[usage.subscription.status] ? <p className="buyer-membership-summary__guidance">{stateGuidance[usage.subscription.status]}</p> : null}</section>
      <section className="buyer-membership-usage" aria-labelledby="buyer-usage"><div><p className="section-eyebrow">CURRENT USAGE</p><h2 id="buyer-usage">Usage and limits</h2></div><dl><div><dt>Saved searches</dt><dd>{usage.usage.savedSearches.used} of {formatBuyerLimit(usage.usage.savedSearches.limit)}</dd></div><div><dt>Watchlist items</dt><dd>{usage.usage.watchlistItems.used} of {formatBuyerLimit(usage.usage.watchlistItems.limit)}</dd></div>{usage.implementation.namedWishLists ? <div><dt>Wish lists</dt><dd>{usage.usage.wishLists.used} of {formatBuyerLimit(usage.usage.wishLists.limit)}</dd></div> : null}{usage.implementation.comparisons ? <div><dt>Comparisons</dt><dd>{usage.usage.comparisons.used} of {formatBuyerLimit(usage.usage.comparisons.limit)}</dd></div> : null}</dl></section>
      <section aria-labelledby="compare-plans"><div className="buyer-membership-compare"><div><p className="section-eyebrow">PLAN OPTIONS</p><h2 id="compare-plans">Choose the membership that fits</h2><p>Prices, limits, fees, and benefits come from PawnLoop’s buyer plan catalog.</p></div><fieldset className="buyer-interval"><legend>Billing interval</legend><div role="radiogroup" aria-label="Billing interval"><label className={interval === "MONTH" ? "is-selected" : ""}><input type="radio" name="billing" checked={interval === "MONTH"} onChange={() => setInterval("MONTH")} />Monthly</label><label className={interval === "YEAR" ? "is-selected" : ""}><input type="radio" name="billing" checked={interval === "YEAR"} onChange={() => setInterval("YEAR")} />Yearly</label></div></fieldset></div>
        {selectedUnavailable.length ? <div className="buyer-membership-config-notice" role="note"><strong>Some {interval === "YEAR" ? "yearly" : "monthly"} options are temporarily unavailable.</strong><span>Checkout is disabled for {selectedUnavailable.map((plan) => plan.label).join(", ")} until billing configuration is complete. Displayed catalog prices are for comparison and cannot be purchased yet.</span></div> : null}
        {plans.length === 0 ? <div className="buyer-membership-message"><h3>Plans are temporarily unavailable</h3><p>Your current access is unchanged.</p></div> : <div className="buyer-plan-grid">{plans.map((plan) => {
          const current = plan.code === usage.subscription.effectivePlan;
          const price = interval === "YEAR" ? plan.yearlyPriceCents : plan.monthlyPriceCents;
          const configured = plan.isFree || (interval === "YEAR" ? plan.yearlyCheckoutConfigured : plan.monthlyCheckoutConfigured);
          const isPaidAccount = canManageBilling && usage.subscription.canManageSubscription && !["CANCELED", "INCOMPLETE_EXPIRED"].includes(usage.subscription.status);
          const direction = plan.rank > currentRank ? "Upgrade" : "Downgrade";
          const label = !configured ? "Temporarily unavailable" : current ? (isPaidAccount ? "Manage billing" : "Current plan") : plan.isFree ? (usage.subscription.cancelAtPeriodEnd ? "Manage billing" : "Downgrade to Free") : isPaidAccount ? `${direction} in billing` : `Choose ${plan.label}`;
          const disabled = Boolean(busy) || (!configured && !(current && isPaidAccount)) || (current && !isPaidAccount);
          return <article className={`buyer-plan-card${current ? " is-current" : ""}`} key={plan.code} aria-label={`${plan.label} plan${current ? ", current plan" : ""}`}><div className="buyer-plan-card__heading"><div><h3>{plan.label}</h3>{current ? <span>Current plan</span> : null}</div><p className="buyer-plan-price"><strong>{price === 0 ? "Free" : money(price, plan.currency)}</strong>{price > 0 ? <span> / {interval === "YEAR" ? "year" : "month"}</span> : null}</p>{interval === "YEAR" && plan.annualSavingsCents > 0 ? <p className="buyer-plan-savings">Save {money(plan.annualSavingsCents, plan.currency)} per year</p> : null}</div><p className="buyer-plan-fee"><strong>{(plan.buyerFeeBps / 100).toFixed(plan.buyerFeeBps % 100 ? 2 : 0)}% buyer/platform fee</strong></p><dl className="buyer-plan-limits"><div><dt>Saved searches</dt><dd>{formatBuyerLimit(plan.maxSavedSearches)}</dd></div><div><dt>Watchlist</dt><dd>{formatBuyerLimit(plan.maxWatchlistItems)}</dd></div></dl><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><button className="btn btn-primary buyer-plan-action" disabled={disabled} aria-disabled={disabled} onClick={() => void choose(plan)}>{busy === plan.code ? "Working…" : label}</button></article>;
        })}</div>}
      </section>
    </> : null}
  </main>;
}

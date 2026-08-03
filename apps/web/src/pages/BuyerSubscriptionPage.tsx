import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createBuyerCheckout, formatBuyerLimit, getBuyerPlanCatalog, getBuyerPlanUsage, manageBuyerCancellation, openBuyerBillingPortal, type BuyerPlanCatalogEntry, type BuyerPlanUsage } from "../services/buyerPlans";
import "../styles/buyer-account.css";

const money = (cents: number, currency = "USD") => cents === 0 ? "Free" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
const date = (value: string | null) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString() : "Not scheduled";

export default function BuyerSubscriptionPage() {
  const [usage, setUsage] = useState<BuyerPlanUsage | null>(null);
  const [plans, setPlans] = useState<BuyerPlanCatalogEntry[]>([]);
  const [interval, setInterval] = useState<"MONTH" | "YEAR">("MONTH");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [params, setParams] = useSearchParams();
  const statusRef = useRef<HTMLDivElement>(null);
  const checkout = params.get("checkout");

  const load = useCallback(async (signal?: AbortSignal) => {
    const [nextUsage, catalog] = await Promise.all([
      getBuyerPlanUsage(signal),
      getBuyerPlanCatalog(signal),
    ]);
    setUsage(nextUsage);
    setPlans(catalog.plans);

    if (nextUsage.subscription.billingInterval === "YEAR") {
      setInterval("YEAR");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (cause?.name !== "AbortError") {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load buyer subscription.",
        );
      }
    });

    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (checkout === "success") {
      setNotice(
        "Checkout completed. Your plan will update after Stripe confirms the subscription.",
      );
    }

    if (checkout === "canceled") {
      setNotice("Checkout was canceled. Your plan has not changed.");
    }

    if (checkout) {
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("checkout");
        return next;
      }, { replace: true });
    }
  }, [checkout, setParams]);

  useEffect(() => { if (notice || error) statusRef.current?.focus(); }, [notice, error]);

  async function choose(plan: BuyerPlanCatalogEntry) {
    setBusy(plan.code); setError(""); setNotice("");
    try {
      if (plan.isFree) {
        if (!usage?.subscription.isPaid) return;
        await manageBuyerCancellation(true);
        setNotice("Your paid plan is scheduled to end at the current period end. Stripe confirmation is pending.");
        await load();
      } else {
        const base = `${window.location.origin}/buyer/subscription`;
        const result = await createBuyerCheckout(plan.code, interval, `${base}?checkout=success`, `${base}?checkout=canceled`);
        window.location.assign(result.url);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to manage subscription."); }
    finally { setBusy(""); }
  }

  async function portal() {
    setBusy("portal"); setError("");
    try { const result = await openBuyerBillingPortal(window.location.href); window.location.assign(result.url); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open billing."); setBusy(""); }
  }

  async function resume() {
    setBusy("resume"); setError("");
    try { await manageBuyerCancellation(false); setNotice("Your cancellation reversal was sent to Stripe. Confirmation is pending."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to resume subscription."); }
    finally { setBusy(""); }
  }

  const usageCards = usage ? [["Saved searches", usage.usage.savedSearches], ["Watchlist items", usage.usage.watchlistItems], ["Active shop requests", usage.usage.activeShopRequests], ["Monthly shop requests", usage.usage.monthlyShopRequests], ["Active marketplace listings", usage.usage.activeMarketplaceListings], ["Monthly marketplace listings", usage.usage.monthlyMarketplaceListings], ["AI listing generations", usage.usage.aiListingGenerations]] as const : [];
  const stateGuidance: Record<string, string> = { PAST_DUE: "A payment failed. Open Billing to update your payment method.", INCOMPLETE: "Stripe needs more information before this subscription can activate.", INCOMPLETE_EXPIRED: "This incomplete subscription expired; select a plan to try again.", CANCELED: "Your paid subscription has ended. Core commerce remains available on Free.", PAUSED: "Billing is paused. Open Billing for available next steps." };

  return <main className="buyer-subscription-page"><header><p className="section-eyebrow">BUYER PLAN</p><h1>Buyer Subscription</h1><p>Manage billing and compare benefits that are available now. Browsing, purchasing, offers, auctions, and order tracking remain on Free.</p></header>
    <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite">{error ? <p className="error-text" role="alert">{error}</p> : notice ? <p className="list-card">{notice}</p> : null}</div>
    {!usage && !error ? <p aria-live="polite">Loading buyer subscription…</p> : null}
    {usage ? <><section className="buyer-subscription-current list-card" aria-labelledby="current-plan"><p className="section-eyebrow">CURRENT PLAN</p><h2 id="current-plan">{usage.subscription.displayName}</h2><p><strong>Status:</strong> {usage.subscription.status.replaceAll("_", " ")} · <strong>Billing:</strong> {usage.subscription.billingInterval?.toLowerCase() || "No paid interval"}</p>{usage.subscription.storedPlan !== usage.subscription.effectivePlan ? <p>Stored plan: {usage.subscription.storedPlan}; effective access: {usage.subscription.effectivePlan} because of billing status.</p> : null}<p><strong>Current period ends:</strong> {date(usage.subscription.currentPeriodEnd)}</p>{usage.subscription.cancelAtPeriodEnd ? <p><strong>Cancellation scheduled.</strong> Access continues through the date above.</p> : null}{stateGuidance[usage.subscription.status] ? <p>{stateGuidance[usage.subscription.status]}</p> : null}<div className="buyer-subscription-actions"><button className="btn btn-secondary" disabled={busy === "portal" || !usage.subscription.isPaid} onClick={() => void portal()}>Manage Billing</button><Link className="btn btn-secondary" to="/account/payment-methods">Payment Methods</Link>{usage.subscription.cancelAtPeriodEnd ? <button className="btn btn-primary" disabled={busy === "resume"} onClick={() => void resume()}>Resume subscription</button> : null}</div></section>
      <section className="buyer-subscription-usage"><h2>Usage and limits</h2><div className="buyer-subscription-usage-grid">{usageCards.map(([label, value]) => <article className="buyer-subscription-usage-card list-card" key={label}><h3>{label}</h3><p className="buyer-subscription-metric">{value.used} / {formatBuyerLimit(value.limit)}</p><p>{value.unlimited ? "Unlimited remaining" : `${value.remaining} remaining`}</p>{value.atLimit ? <p>This plan limit has been reached. Choose a higher plan below to keep selling.</p> : null}</article>)}</div></section>
      <section className="buyer-subscription-compare" aria-labelledby="compare-plans"><div className="buyer-subscription-compare-header"><div><h2 id="compare-plans">Compare plans</h2><p>Only implemented benefits are listed under Available now.</p></div><fieldset className="buyer-subscription-interval"><legend>Billing interval</legend><div className="buyer-subscription-interval-options"><label className="buyer-subscription-interval-option"><input type="radio" name="billing" checked={interval === "MONTH"} onChange={() => setInterval("MONTH")} /><span>Monthly</span></label><label className="buyer-subscription-interval-option"><input type="radio" name="billing" checked={interval === "YEAR"} onChange={() => setInterval("YEAR")} /><span>Yearly</span></label></div></fieldset></div><div className="buyer-subscription-plan-grid">{plans.map((plan) => { const current = plan.code === usage.subscription.effectivePlan; const price = interval === "YEAR" ? plan.yearlyPriceCents : plan.monthlyPriceCents; const configured = plan.isFree || Boolean(interval === "YEAR" ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId); return <article className={`buyer-subscription-plan-card list-card${current ? " is-current" : ""}`} key={plan.code} aria-label={`${plan.label} plan${current ? ", current plan" : ""}`}><h3>{plan.label}</h3>{current ? <p><strong>Current plan</strong></p> : null}<p className="buyer-subscription-price">{money(price, plan.currency)}{price ? interval === "YEAR" ? " / year" : " / month" : ""}</p>{interval === "YEAR" && plan.annualSavingsCents > 0 ? <p>Save {money(plan.annualSavingsCents, plan.currency)} annually</p> : null}<p>{formatBuyerLimit(plan.maxSavedSearches)} saved searches · {formatBuyerLimit(plan.maxWatchlistItems)} watchlist items</p><h4>Available now</h4><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>{!current ? <button className="btn btn-primary" disabled={Boolean(busy) || !configured} onClick={() => void choose(plan)}>{busy === plan.code ? "Working…" : plan.isFree ? "Downgrade to Free" : `Choose ${plan.label}`}</button> : null}{!configured ? <p role="note">This billing interval is not configured yet.</p> : null}</article>; })}</div></section></> : null}
  </main>;
}

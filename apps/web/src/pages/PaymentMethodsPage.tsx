import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { paymentMethodsApi, type SafePaymentMethod } from "../services/paymentMethods";
import "../styles/payment-methods.css";

const isStripeHost = (hostname: string) => hostname === "stripe.com" || hostname.endsWith(".stripe.com");

const readableValue = (value: string) => value
  .replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const methodName = (method: SafePaymentMethod) => {
  if (method.brand) return readableValue(method.brand);
  if (method.type === "us_bank_account") return "US bank account";
  return readableValue(method.type);
};

const syncLabel = (sync: string) => {
  if (sync === "SYNCED") return "Synced with Stripe";
  if (sync === "NOT_CONFIGURED") return "Not configured";
  return readableValue(sync);
};

export default function PaymentMethodsPage() {
  const [params] = useSearchParams();
  const shopId = params.get("shopId");
  const [methods, setMethods] = useState<SafePaymentMethod[]>([]);
  const [sync, setSync] = useState("UNKNOWN");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await paymentMethodsApi.list(shopId);
      setMethods(result.methods);
      setSync(result.syncStatus);
      if (params.get("setup") === "complete") {
        setNotice("Stripe setup completed. Your saved methods have been synchronized.");
      } else if (params.get("setup") === "canceled") {
        setNotice("Stripe setup was canceled. No payment method was changed.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load payment methods.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setup() {
    if (!consent) {
      setError("Consent is required before saving a method for future charges.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const success = new URL(location.href);
      success.searchParams.set("setup", "complete");
      const cancel = new URL(location.href);
      cancel.searchParams.set("setup", "canceled");
      const result = await paymentMethodsApi.setup({
        shopId,
        successUrl: success.toString(),
        cancelUrl: cancel.toString(),
        consent: { accepted: true, termsVersion: "payment-method-consent-v1" },
      });
      const target = new URL(result.url);
      if (target.protocol !== "https:" || !isStripeHost(target.hostname)) {
        throw new Error("Stripe returned an untrusted setup URL.");
      }
      location.assign(target.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start secure setup.");
      setBusy(false);
    }
  }

  async function makeDefault(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await paymentMethodsApi.setDefault(id, shopId);
      setMethods(result.methods);
      setNotice("Default payment method updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the default method.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this saved payment method? Active subscriptions must retain an eligible method.")) return;
    setBusy(true);
    setError("");
    try {
      const result = await paymentMethodsApi.remove(id, shopId);
      setMethods(result.methods);
      setNotice("Payment method removed from Stripe.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove the method.");
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    setError("");
    try {
      const result = await paymentMethodsApi.portal(shopId, location.href);
      const target = new URL(result.url);
      if (target.protocol !== "https:" || !isStripeHost(target.hostname)) {
        throw new Error("Stripe returned an untrusted portal URL.");
      }
      location.assign(target.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open Stripe billing.");
      setBusy(false);
    }
  }

  const setupLabel = methods.length === 0 ? "Add payment method" : "Add another payment method";

  return (
    <main className="payment-methods-page">
      <header className="payment-methods-hero">
        <div>
          <p className="payment-methods-eyebrow">{shopId ? "Seller billing" : "Buyer wallet"}</p>
          <h1>Payment Methods</h1>
          <p className="payment-methods-lead">
            Securely add, update, or remove the payment methods used for PawnLoop purchases and subscriptions.
          </p>
        </div>
        <div className="payment-methods-security-note">
          <span className="payment-methods-security-icon" aria-hidden="true">✓</span>
          <span><strong>Protected by Stripe</strong>PawnLoop never stores your full card or bank details.</span>
        </div>
        {shopId ? (
          <nav className="payment-methods-context-links" aria-label="Seller billing links">
            <Link className="btn btn-secondary" to={`/owner/finance?shopId=${encodeURIComponent(shopId)}`}>Payout account</Link>
            <Link className="btn btn-secondary" to="/owner/subscription">Seller plan</Link>
          </nav>
        ) : null}
      </header>

      {error ? <div role="alert" className="payment-methods-alert payment-methods-alert--error">{error}</div> : null}
      {notice ? <div role="status" className="payment-methods-alert payment-methods-alert--success">{notice}</div> : null}

      <div className="payment-methods-layout">
        <section className="payment-methods-card" aria-labelledby="saved-methods-heading">
          <div className="payment-methods-section-heading">
            <div>
              <p className="payment-methods-eyebrow">Your wallet</p>
              <h2 id="saved-methods-heading">Saved payment methods</h2>
            </div>
            <span className={`payment-methods-sync payment-methods-sync--${sync.toLowerCase()}`}>
              {syncLabel(sync)}
            </span>
          </div>

          {loading ? (
            <div className="payment-methods-empty" role="status">Loading masked payment methods…</div>
          ) : methods.length === 0 ? (
            <div className="payment-methods-empty">
              <span className="payment-methods-empty-icon" aria-hidden="true">+</span>
              <h3>No saved payment methods</h3>
              <p>Add a card or eligible bank account securely through Stripe.</p>
            </div>
          ) : (
            <div className="payment-methods-list">
              {methods.map((method) => (
                <article key={method.id} className="payment-method-row">
                  <div className="payment-method-summary">
                    <span className="payment-method-brand" aria-hidden="true">{method.type === "card" ? "CARD" : "BANK"}</span>
                    <div>
                      <div className="payment-method-title">
                        <strong>{methodName(method)} ending in {method.last4 || "unknown"}</strong>
                        {method.default ? <span className="payment-method-default">Default</span> : null}
                        {method.expired ? <span className="payment-method-expired">Expired</span> : null}
                      </div>
                      <p>
                        {method.expMonth
                          ? `Expires ${String(method.expMonth).padStart(2, "0")}/${method.expYear}`
                          : readableValue(method.type)}
                        {method.status ? ` · ${readableValue(method.status)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="payment-method-actions">
                    {!method.default ? (
                      <button className="btn btn-secondary" disabled={busy || method.expired} onClick={() => void makeDefault(method.id)}>
                        Set as default
                      </button>
                    ) : null}
                    <button
                      className="btn btn-secondary"
                      disabled={busy || !consent}
                      aria-describedby="payment-method-consent-description"
                      onClick={() => void setup()}
                    >
                      Replace
                    </button>
                    <button className="btn payment-methods-remove" disabled={busy} onClick={() => void remove(method.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="payment-methods-sidebar" aria-label="Payment method actions">
          <section className="payment-methods-card payment-methods-setup" aria-labelledby="secure-setup-heading">
            <p className="payment-methods-eyebrow">Secure setup</p>
            <h2 id="secure-setup-heading">{setupLabel}</h2>
            <p id="payment-method-consent-description">
              Authorize Stripe to save this method for purchases, subscriptions, and future charges you approve.
            </p>
            <label className="payment-methods-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>I authorize PawnLoop and Stripe to store and use this payment method for charges I approve.</span>
            </label>
            <button
              className="btn btn-primary payment-methods-primary"
              disabled={busy || !consent}
              aria-describedby="payment-method-consent-description"
              onClick={() => void setup()}
            >
              {busy ? "Opening Stripe…" : setupLabel}
            </button>
            {!consent ? <p className="payment-methods-consent-hint">Select the authorization checkbox to continue.</p> : null}
          </section>

          <section className="payment-methods-card payment-methods-portal" aria-labelledby="billing-portal-heading">
            <p className="payment-methods-eyebrow">Billing & receipts</p>
            <h2 id="billing-portal-heading">Manage billing</h2>
            <p>Open Stripe to review invoices, update subscription billing, and manage additional payment options.</p>
            <button className="btn btn-secondary" disabled={busy} onClick={() => void portal()}>
              Open Stripe billing portal
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}

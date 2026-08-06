import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { paymentMethodsApi, type SafePaymentMethod } from "../services/paymentMethods";
import "../styles/payment-methods.css";

const isStripeHost = (hostname: string) => hostname === "stripe.com" || hostname.endsWith(".stripe.com");

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

  useEffect(() => {
    void load();
  }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!confirm("Remove this saved payment method? Active subscriptions must retain an eligible method.")) {
      return;
    }
    setBusy(true);
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

  return (
    <div className="container page-stack payment-methods-page">
      <header className="page-card payment-methods-hero">
        <div className="payment-methods-kicker">
          {shopId ? "Seller billing" : "Buyer wallet"}
        </div>
        <h1>Payment Methods</h1>
        <p className="payment-methods-description">
          Card and bank details are collected and stored by Stripe. PawnLoop receives only
          Stripe references and masked display details.
        </p>
        <div className="payment-methods-actions">
          <button className="btn btn-primary" disabled={busy} onClick={() => void setup()}>
            {busy ? "Opening Stripe…" : "Add or replace payment method"}
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => void portal()}>
            Open Stripe billing portal
          </button>
          {shopId ? (
            <>
              <Link
                className="btn btn-secondary"
                to={`/owner/finance?shopId=${encodeURIComponent(shopId)}`}
              >
                Payout account
              </Link>
              <Link className="btn btn-secondary" to="/owner/subscription">
                Seller plan
              </Link>
            </>
          ) : null}
        </div>
      </header>

      <label className="page-card payment-methods-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>
          I authorize PawnLoop and Stripe to store this payment method and use it for future
          or off-session charges that I authorize. Consent time and mandate references will
          be retained.
        </span>
      </label>

      {error ? (
        <div role="alert" className="payment-methods-message payment-methods-message-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="payment-methods-message payment-methods-message-success">
          {notice}
        </div>
      ) : null}

      <section className="page-card payment-methods-saved">
        <div className="payment-methods-section-heading">
          <h2>Saved methods</h2>
          <span>Stripe sync: {sync}</span>
        </div>
        {loading ? (
          <p className="payment-methods-empty">Loading masked payment methods…</p>
        ) : methods.length === 0 ? (
          <p className="payment-methods-empty">
            No payment methods saved. Add one securely through Stripe.
          </p>
        ) : (
          <div className="payment-methods-list">
            {methods.map((method) => (
              <article key={method.id} className="list-card payment-method-card">
                <div>
                  <strong>
                    {method.brand || method.type} •••• {method.last4 || "unknown"}
                  </strong>
                  <div className="payment-method-meta">
                    {method.expMonth
                      ? `Expires ${method.expMonth}/${method.expYear}`
                      : method.type}{" "}
                    · {method.status}
                    {method.default ? " · Default" : ""}
                  </div>
                </div>
                <div className="payment-methods-actions payment-method-card-actions">
                  {!method.default ? (
                    <button
                      className="btn btn-secondary"
                      disabled={busy || method.expired}
                      onClick={() => void makeDefault(method.id)}
                    >
                      Set default
                    </button>
                  ) : null}
                  <button className="btn btn-secondary" disabled={busy} onClick={() => void setup()}>
                    Update
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void remove(method.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// File: apps/web/src/pages/MyWinsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { stripePromise } from "../lib/stripe";
import { getAuthToken } from "../services/auth";
import {
  createSettlementPaymentIntent,
  getMySettlements,
  type Settlement,
} from "../services/settlements";
import "../styles/my-wins-v2.css";
import "../styles/my-wins-pay-button-readability.css";

type ActivePayment = {
  settlementId: string;
  clientSecret: string;
  title: string;
  amountLabel: string;
  paymentIntentId?: string;
};

type WinRecord = {
  settlementId: string;
  auctionId: string;
  itemId: string;
  shopId: string;
  auctionTitle: string;
  shopName: string;
  finalAmountCents: number;
  currency: string;
  status: string;
  endedAt: string | null;
  settledAt: string | null;
  stripePaymentIntent: string | null;
  fulfillmentStatus: string;
  fulfillmentNote: string | null;
  fulfilledAt: string | null;
};

function toValidDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toCentsFromSettlement(row: Settlement) {
  if (typeof row.finalAmountCents === "number") return row.finalAmountCents;
  if (typeof row.amountCents === "number") return row.amountCents;

  if (row.finalPrice !== undefined && row.finalPrice !== null) {
    return Math.round(toNumber(row.finalPrice) * 100);
  }

  if (row.amount !== undefined && row.amount !== null) {
    const amount = toNumber(row.amount);

    if (amount > 0 && amount < 1_000_000) {
      return Math.round(amount * 100);
    }

    return Math.round(amount);
  }

  return 0;
}

function formatCurrency(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function formatDate(value: string | null) {
  const date = toValidDate(value);
  return date ? date.toLocaleString() : "—";
}

function normalizeStatus(value: string | undefined) {
  const normalized = String(value || "PENDING").trim().toUpperCase();

  const aliases: Record<string, string> = {
    PAID: "CHARGED",
    COMPLETE: "CHARGED",
    COMPLETED: "CHARGED",
    SUCCESS: "CHARGED",
    SUCCEEDED: "CHARGED",
    WON: "PENDING",
  };

  return (aliases[normalized] || normalized || "PENDING").replaceAll("_", " ");
}

function isPaidStatus(status: string) {
  return normalizeStatus(status) === "CHARGED";
}

function isFailedStatus(status: string) {
  return normalizeStatus(status) === "FAILED";
}

function isPayableStatus(status: string) {
  const normalized = normalizeStatus(status);
  return normalized === "PENDING" || normalized === "FAILED";
}

function statusClass(status: string) {
  return `wins2-status wins2-status-${normalizeStatus(status).toLowerCase()}`;
}

function normalizeFulfillmentStatus(value: string | null | undefined) {
  return String(value || "PAYMENT_PENDING").trim().toUpperCase().replaceAll("_", " ");
}

function normalizeWin(row: Settlement, index: number): WinRecord {
  return {
    settlementId: String(row.settlementId || row.id || `win-${index}`),
    auctionId: String(row.auctionId || ""),
    itemId: String(row.itemId || ""),
    shopId: String(row.shopId || ""),
    auctionTitle: String(row.auctionTitle || row.itemTitle || "Won auction"),
    shopName: String(row.shopName || "Unknown shop"),
    finalAmountCents: toCentsFromSettlement(row),
    currency: String(row.currency || "USD").toUpperCase(),
    status: normalizeStatus(row.status),
    endedAt: row.endedAt || null,
    settledAt: row.settledAt || row.updatedAt || row.createdAt || null,
    stripePaymentIntent: row.stripePaymentIntent || null,
    fulfillmentStatus: String(row.fulfillmentStatus || "PAYMENT_PENDING"),
    fulfillmentNote: row.fulfillmentNote || null,
    fulfilledAt: row.fulfilledAt || null,
  };
}

function sortWinsNewestFirst(items: WinRecord[]) {
  return [...items].sort((a, b) => {
    const aTime =
      toValidDate(a.settledAt)?.getTime() ??
      toValidDate(a.endedAt)?.getTime() ??
      0;
    const bTime =
      toValidDate(b.settledAt)?.getTime() ??
      toValidDate(b.endedAt)?.getTime() ??
      0;
    return bTime - aTime;
  });
}

async function fetchMyWins(): Promise<WinRecord[]> {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Missing buyer token. Please log in again.");
  }

  const settlements = await getMySettlements();

  return sortWinsNewestFirst(
    settlements.map((row, index) => normalizeWin(row, index)),
  );
}

function SettlementPaymentPanel({
  activePayment,
  disabled,
  onCancel,
  onError,
  onSuccess,
}: {
  activePayment: ActivePayment;
  disabled: boolean;
  onCancel: () => void;
  onError: (message: string) => void;
  onSuccess: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stripe || !elements) {
      onError("Stripe is still loading. Please try again.");
      return;
    }

    const card = elements.getElement(CardElement);

    if (!card) {
      onError("Card form is not ready yet.");
      return;
    }

    setProcessing(true);
    onError("");

    try {
      const result = await stripe.confirmCardPayment(activePayment.clientSecret, {
        payment_method: {
          card,
        },
      });

      if (result.error) {
        throw new Error(result.error.message || "Payment failed.");
      }

      if (result.paymentIntent?.status !== "succeeded") {
        throw new Error(
          `Payment is ${result.paymentIntent?.status || "not complete"} yet.`,
        );
      }

      await onSuccess();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="wins2-payment-panel">
      <div className="wins2-payment-header">
        <div>
          <span>Secure checkout</span>
          <h2>{activePayment.title}</h2>
          <p>
            Settlement #{activePayment.settlementId} · {activePayment.amountLabel}
            {activePayment.paymentIntentId ? ` · PI ${activePayment.paymentIntentId}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={disabled || processing}
          className="wins2-secondary-button"
        >
          Close
        </button>
      </div>

      <form onSubmit={onSubmit} className="wins2-payment-form">
        <div className="wins2-card-element">
          <CardElement
            options={{
              hidePostalCode: true,
              style: {
                base: {
                  color: "#0f172a",
                  fontSize: "16px",
                  "::placeholder": {
                    color: "#64748b",
                  },
                },
                invalid: {
                  color: "#dc2626",
                },
              },
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!stripe || disabled || processing}
          className="wins2-pay-button"
        >
          {processing ? "Confirming payment..." : "Confirm payment"}
        </button>
      </form>
    </section>
  );
}

export default function MyWinsPage() {
  const [wins, setWins] = useState<WinRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingSettlementId, setPayingSettlementId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activePayment, setActivePayment] = useState<ActivePayment | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "PAID" | "FAILED">("ALL");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"NEWEST" | "AMOUNT_HIGH" | "PENDING_FIRST" | "PAID_FIRST">("NEWEST");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const data = await fetchMyWins();
      setWins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your wins.");
    } finally {
      if (mode === "refresh") setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  async function handlePay(win: WinRecord) {
    setError("");
    setNotice("");
    setPaymentError("");
    setPayingSettlementId(win.settlementId);

    try {
      if (!isPayableStatus(win.status)) {
        throw new Error("This settlement is not payable.");
      }

      const paymentIntent = await createSettlementPaymentIntent(win.settlementId);

      if (
        normalizeStatus(String(paymentIntent.settlementStatus || "")) === "CHARGED" &&
        !paymentIntent.clientSecret
      ) {
        setNotice("This settlement is already paid. Refreshing status now...");
        await load("refresh");
        return;
      }

      if (!paymentIntent.clientSecret) {
        throw new Error("Missing Stripe client secret.");
      }

      setActivePayment({
        settlementId: win.settlementId,
        clientSecret: paymentIntent.clientSecret,
        paymentIntentId: paymentIntent.paymentIntentId,
        title: win.auctionTitle || "Settlement payment",
        amountLabel: formatCurrency(win.finalAmountCents, win.currency),
      });

      setNotice("Payment ready. Enter your card details to complete checkout.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPayingSettlementId(null);
    }
  }

  async function handlePaymentSuccess() {
    setNotice("Payment successful. Your settlement status is refreshing now...");
    setActivePayment(null);
    setPaymentError("");
    await load("refresh");
  }

  async function copyReference(label: string, value: string) {
    setError("");
    setNotice("");

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setError(`Unable to copy ${label.toLowerCase()}.`);
    }
  }

  const summary = useMemo(() => {
    const totalCommittedCents = wins.reduce(
      (sum, row) => sum + row.finalAmountCents,
      0,
    );

    const paidCents = wins
      .filter((row) => isPaidStatus(row.status))
      .reduce((sum, row) => sum + row.finalAmountCents, 0);

    const pendingCents = wins
      .filter((row) => isPayableStatus(row.status))
      .reduce((sum, row) => sum + row.finalAmountCents, 0);

    const latest = wins.length > 0 ? sortWinsNewestFirst(wins)[0] : null;

    return {
      winsCount: wins.length,
      paidCount: wins.filter((row) => isPaidStatus(row.status)).length,
      pendingCount: wins.filter((row) => isPayableStatus(row.status)).length,
      failedCount: wins.filter((row) => isFailedStatus(row.status)).length,
      totalCommittedCents,
      paidCents,
      pendingCents,
      latestSettlement: latest?.settledAt || latest?.endedAt || null,
    };
  }, [wins]);

  const filteredWins = useMemo(() => {
    const q = query.trim().toLowerCase();

    const nextWins = wins.filter((win) => {
      const matchesFilter =
        filter === "ALL" ||
        (filter === "PENDING" && isPayableStatus(win.status)) ||
        (filter === "PAID" && isPaidStatus(win.status)) ||
        (filter === "FAILED" && isFailedStatus(win.status));

      if (!matchesFilter) return false;
      if (!q) return true;

      const searchable = [
        win.auctionTitle,
        win.shopName,
        win.status,
        normalizeFulfillmentStatus(win.fulfillmentStatus),
        win.settlementId,
        win.stripePaymentIntent || "",
        formatCurrency(win.finalAmountCents, win.currency),
      ].join(" ").toLowerCase();

      return searchable.includes(q);
    });

    return [...nextWins].sort((a, b) => {
      if (sortMode === "AMOUNT_HIGH") {
        return b.finalAmountCents - a.finalAmountCents;
      }

      if (sortMode === "PENDING_FIRST") {
        return Number(isPayableStatus(b.status)) - Number(isPayableStatus(a.status));
      }

      if (sortMode === "PAID_FIRST") {
        return Number(isPaidStatus(b.status)) - Number(isPaidStatus(a.status));
      }

      const aTime =
        toValidDate(a.settledAt)?.getTime() ??
        toValidDate(a.endedAt)?.getTime() ??
        0;
      const bTime =
        toValidDate(b.settledAt)?.getTime() ??
        toValidDate(b.endedAt)?.getTime() ??
        0;

      return bTime - aTime;
    });
  }, [filter, query, sortMode, wins]);

  const hasActiveWinControls =
    filter !== "ALL" || query.trim().length > 0 || sortMode !== "NEWEST";

  function clearWinControls() {
    setFilter("ALL");
    setQuery("");
    setSortMode("NEWEST");
  }

  return (
    <main className="wins2-page">
      <section className="wins2-hero">
        <div className="wins2-hero-copy">
          <span className="wins2-pill">Buyer win center</span>
          <h1>Manage won auctions and settlement payments.</h1>
          <p>
            Review won auctions, final pricing, payment status, Stripe checkout,
            and settlement progress from one place.
          </p>

          <div className="wins2-hero-actions">
            <Link to="/auctions">Browse auctions</Link>
            <Link to="/my-bids">My bids</Link>
            <button
              type="button"
              onClick={() => void load("refresh")}
              disabled={loading || refreshing || Boolean(payingSettlementId)}
            >
              {refreshing ? "Refreshing..." : "Refresh wins"}
            </button>
          </div>
        </div>

        <aside className="wins2-hero-panel">
          <div>
            <span>Won auctions</span>
            <strong>{summary.winsCount}</strong>
            <small>settlement records</small>
          </div>
          <div>
            <span>Pending payment</span>
            <strong>{summary.pendingCount}</strong>
            <small>{formatCurrency(summary.pendingCents)}</small>
          </div>
          <div>
            <span>Paid</span>
            <strong>{summary.paidCount}</strong>
            <small>{formatCurrency(summary.paidCents)}</small>
          </div>
          <div>
            <span>Total committed</span>
            <strong>{formatCurrency(summary.totalCommittedCents)}</strong>
            <small>Latest: {formatDate(summary.latestSettlement)}</small>
          </div>
        </aside>
      </section>

        <section className="wins2-control-panel">
          <div className="wins2-filter-tabs">
            {[
              ["ALL", "All"],
              ["PENDING", "Pending"],
              ["PAID", "Paid"],
              ["FAILED", "Failed"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value as typeof filter)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="wins2-control-row">
            <label>
              <span>Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item, shop, status, settlement..."
              />
            </label>

            <label>
              <span>Sort</span>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as typeof sortMode)}
              >
                <option value="NEWEST">Newest first</option>
                <option value="AMOUNT_HIGH">Highest amount</option>
                <option value="PENDING_FIRST">Pending payment first</option>
                <option value="PAID_FIRST">Paid first</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            className="wins2-clear-controls"
            onClick={clearWinControls}
            disabled={!hasActiveWinControls || loading || refreshing || Boolean(activePayment)}
          >
            Clear filters
          </button>

          <div className="wins2-control-summary">
            Showing {filteredWins.length} of {wins.length} win records
          </div>
        </section>


      <section className="wins2-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to="/my-bids">
          My bids <span>Track bidding activity</span>
        </Link>
        <Link to="/auctions">
          Auctions <span>Find active auctions</span>
        </Link>
        <Link to="/offers">
          Offers <span>Review negotiations</span>
        </Link>
      </section>

      {summary.failedCount > 0 ? (
        <section className="wins2-warning">
          {summary.failedCount} settlement payment{" "}
          {summary.failedCount === 1 ? "needs" : "need"} attention. Retry failed
          settlement payments below.
        </section>
      ) : null}

      {notice ? <section className="wins2-notice">{notice}</section> : null}
      {paymentError ? <section className="wins2-error">{paymentError}</section> : null}

      {activePayment ? (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret: activePayment.clientSecret }}
        >
          <SettlementPaymentPanel
            activePayment={activePayment}
            disabled={Boolean(payingSettlementId)}
            onCancel={() => {
              setActivePayment(null);
              setPaymentError("");
            }}
            onError={setPaymentError}
            onSuccess={handlePaymentSuccess}
          />
        </Elements>
      ) : null}

      {loading ? <section className="wins2-state">Loading your wins...</section> : null}

      {!loading && error ? (
        <section className="wins2-state wins2-error">
          <h2>Unable to continue</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {!loading && !error && filteredWins.length === 0 ? (
        <section className="wins2-state">
          <h2>No wins matched</h2>
          <p>
            Won auctions and settlement tracking will appear here once you win an
            auction.
          </p>
          <Link to="/auctions">Browse auctions</Link>
        </section>
      ) : null}

      {!loading && !error && filteredWins.length > 0 ? (
        <section className="wins2-grid">
          {filteredWins.map((win) => {
            const payable = isPayableStatus(win.status);
            const paying = payingSettlementId === win.settlementId;
            const paid = isPaidStatus(win.status);
            const failed = isFailedStatus(win.status);

            return (
              <article key={win.settlementId} className="wins2-card">
                <div className="wins2-card-top">
                  <div>
                    <h2>{win.auctionTitle}</h2>
                    <p>{win.shopName}</p>
                  </div>

                  <span className="wins2-amount">
                    {formatCurrency(win.finalAmountCents, win.currency)}
                  </span>
                </div>

                <div className="wins2-detail-grid">
                  <div>
                    <span>Auction ended</span>
                    <strong>{formatDate(win.endedAt)}</strong>
                  </div>
                  <div>
                    <span>Settlement updated</span>
                    <strong>{formatDate(win.settledAt)}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong className={statusClass(win.status)}>{win.status}</strong>
                  </div>
                  <div>
                    <span>Fulfillment</span>
                    <strong>{normalizeFulfillmentStatus(win.fulfillmentStatus)}</strong>
                  </div>
                  <div>
                    <span>Fulfilled at</span>
                    <strong>{formatDate(win.fulfilledAt)}</strong>
                  </div>
                  <div>
                    <span>Settlement</span>
                    <strong>#{win.settlementId}</strong>
                  </div>
                </div>

                {win.stripePaymentIntent ? (
                  <div className="wins2-payment-intent">
                    Payment intent: {win.stripePaymentIntent}
                  </div>
                ) : null}

                {win.fulfillmentNote ? (
                  <div className="wins2-payment-intent">
                    Fulfillment note: {win.fulfillmentNote}
                  </div>
                ) : null}

                <div className="wins2-card-actions">
                  {payable ? (
                    <button
                      type="button"
                      onClick={() => void handlePay(win)}
                      disabled={paying || Boolean(activePayment)}
                      className="wins2-pay-button"
                    >
                      {paying ? "Preparing..." : failed ? "Retry payment" : "Pay now"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="wins2-secondary-button"
                    onClick={() =>
                      void copyReference(
                        "Settlement ID",
                        win.settlementId,
                      )
                    }
                  >
                    Copy settlement ID
                  </button>

                  {win.stripePaymentIntent ? (
                    <button
                      type="button"
                      className="wins2-secondary-button"
                      onClick={() =>
                        void copyReference(
                          "Payment ID",
                          win.stripePaymentIntent || "",
                        )
                      }
                    >
                      Copy payment ID
                    </button>
                  ) : null}

                  {paid ? (
                    <span className="wins2-paid-label">
                      Payment completed
                    </span>
                  ) : null}

                  {win.auctionId ? (
                    <Link to={`/auctions/${win.auctionId}`}>View auction</Link>
                  ) : null}

                  {win.itemId ? (
                    <Link to={`/items/${win.itemId}`}>View item</Link>
                  ) : null}

                  {win.shopId ? (
                    <Link to={`/shops/${win.shopId}`}>View shop</Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}

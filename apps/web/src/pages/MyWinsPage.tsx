// File: apps/web/src/pages/MyWinsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
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
  auctionTitle: string;
  shopName: string;
  finalAmountCents: number;
  currency: string;
  status: string;
  endedAt: string | null;
  settledAt: string | null;
  stripePaymentIntent: string | null;
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

function getStatusBadgeStyle(status: string): CSSProperties {
  const normalized = normalizeStatus(status);

  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };

  if (normalized === "CHARGED") {
    return {
      ...base,
      color: "#bbf7d0",
      background: "rgba(34,197,94,0.16)",
      border: "1px solid rgba(34,197,94,0.32)",
    };
  }

  if (normalized === "FAILED") {
    return {
      ...base,
      color: "#fecaca",
      background: "rgba(239,68,68,0.16)",
      border: "1px solid rgba(239,68,68,0.32)",
    };
  }

  return {
    ...base,
    color: "#fde68a",
    background: "rgba(245,158,11,0.16)",
    border: "1px solid rgba(245,158,11,0.32)",
  };
}

function normalizeWin(row: Settlement, index: number): WinRecord {
  return {
    settlementId: String(row.settlementId || row.id || `win-${index}`),
    auctionId: String(row.auctionId || ""),
    auctionTitle: String(
      row.auctionTitle || row.itemTitle || "Won auction",
    ),
    shopName: String(row.shopName || "Unknown shop"),
    finalAmountCents: toCentsFromSettlement(row),
    currency: String(row.currency || "USD").toUpperCase(),
    status: normalizeStatus(row.status),
    endedAt: row.endedAt || null,
    settledAt: row.settledAt || row.updatedAt || row.createdAt || null,
    stripePaymentIntent: row.stripePaymentIntent || null,
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
    <section style={styles.paymentPanel}>
      <div style={styles.paymentPanelHeader}>
        <div>
          <div style={styles.detailLabel}>Secure checkout</div>
          <h2 style={styles.paymentTitle}>{activePayment.title}</h2>
          <div style={styles.metaRow}>
            <span>Settlement #{activePayment.settlementId}</span>
            <span>{activePayment.amountLabel}</span>
            {activePayment.paymentIntentId ? (
              <span>PI {activePayment.paymentIntentId}</span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={disabled || processing}
          style={styles.secondaryButton}
        >
          Close
        </button>
      </div>

      <form onSubmit={onSubmit} style={styles.paymentForm}>
        <div style={styles.cardElementBox}>
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
          style={{
            ...styles.payButton,
            ...(!stripe || disabled || processing
              ? styles.actionButtonDisabled
              : {}),
          }}
        >
          {processing ? "Confirming payment..." : "Confirm Payment"}
        </button>
      </form>
    </section>
  );
}

export default function MyWinsPage() {
  const [wins, setWins] = useState<WinRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingSettlementId, setPayingSettlementId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activePayment, setActivePayment] = useState<ActivePayment | null>(null);
  const [paymentError, setPaymentError] = useState("");

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
        normalizeStatus(String(paymentIntent.settlementStatus || "")) ===
          "CHARGED" &&
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

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Buyer</div>
          <h1 style={styles.title}>My Wins</h1>
          <p style={styles.subtitle}>
            Review won auctions, final pricing, payment status, and settlement
            progress.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load("refresh")}
          disabled={loading || refreshing || Boolean(payingSettlementId)}
          style={{
            ...styles.actionButton,
            ...(loading || refreshing || payingSettlementId
              ? styles.actionButtonDisabled
              : {}),
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Won auctions</div>
          <div style={styles.statValue}>{summary.winsCount}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Pending payment</div>
          <div style={styles.statValue}>{summary.pendingCount}</div>
          <div style={styles.statHint}>
            {formatCurrency(summary.pendingCents)}
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Paid settlements</div>
          <div style={styles.statValue}>{summary.paidCount}</div>
          <div style={styles.statHint}>{formatCurrency(summary.paidCents)}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total committed</div>
          <div style={styles.statValue}>
            {formatCurrency(summary.totalCommittedCents)}
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Latest update</div>
          <div style={styles.statValueSmall}>
            {formatDate(summary.latestSettlement)}
          </div>
        </div>
      </div>

      {summary.failedCount > 0 ? (
        <div style={styles.warningCard}>
          {summary.failedCount} settlement payment{" "}
          {summary.failedCount === 1 ? "needs" : "need"} attention. You can
          retry failed settlement payments below.
        </div>
      ) : null}

      {notice ? <div style={styles.noticeCard}>{notice}</div> : null}

      {paymentError ? <div style={styles.errorCard}>{paymentError}</div> : null}

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

      {loading ? <div style={styles.stateCard}>Loading your wins...</div> : null}

      {!loading && error ? (
        <div style={styles.errorCard}>
          <div style={styles.emptyTitle}>Unable to continue</div>
          <p style={styles.emptyText}>{error}</p>
        </div>
      ) : null}

      {!loading && !error && wins.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No wins yet</div>
          <p style={styles.emptyText}>
            When you win an auction, it will appear here for payment and
            settlement tracking.
          </p>
          <Link to="/auctions" style={styles.primaryLink}>
            Browse Auctions
          </Link>
        </div>
      ) : null}

      {!loading && wins.length > 0 ? (
        <div style={styles.list}>
          {wins.map((win) => {
            const payable = isPayableStatus(win.status);
            const paying = payingSettlementId === win.settlementId;
            const paid = isPaidStatus(win.status);
            const failed = isFailedStatus(win.status);

            return (
              <article key={win.settlementId} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <h2 style={styles.cardTitle}>{win.auctionTitle}</h2>
                    <div style={styles.metaRow}>
                      <span>{win.shopName}</span>
                      <span>Settlement #{win.settlementId}</span>
                      {win.stripePaymentIntent ? (
                        <span>PI {win.stripePaymentIntent}</span>
                      ) : null}
                    </div>
                  </div>

                  <div style={styles.amountPill}>
                    {formatCurrency(win.finalAmountCents, win.currency)}
                  </div>
                </div>

                <div style={styles.detailGrid}>
                  <div>
                    <div style={styles.detailLabel}>Auction ended</div>
                    <div style={styles.detailValue}>{formatDate(win.endedAt)}</div>
                  </div>

                  <div>
                    <div style={styles.detailLabel}>Settlement updated</div>
                    <div style={styles.detailValue}>
                      {formatDate(win.settledAt)}
                    </div>
                  </div>

                  <div>
                    <div style={styles.detailLabel}>Status</div>
                    <div style={getStatusBadgeStyle(win.status)}>{win.status}</div>
                  </div>
                </div>

                <div style={styles.cardActions}>
                  {payable ? (
                    <button
                      type="button"
                      onClick={() => void handlePay(win)}
                      disabled={paying || Boolean(activePayment)}
                      style={{
                        ...styles.payButton,
                        ...(paying || activePayment
                          ? styles.actionButtonDisabled
                          : {}),
                      }}
                    >
                      {paying
                        ? "Preparing..."
                        : failed
                          ? "Retry Payment"
                          : "Pay Now"}
                    </button>
                  ) : null}

                  {paid ? (
                    <span style={styles.paidLabel}>Payment completed</span>
                  ) : null}

                  {win.auctionId ? (
                    <Link
                      to={`/auctions/${win.auctionId}`}
                      style={styles.secondaryLink}
                    >
                      View Auction
                    </Link>
                  ) : null}

                  <Link to="/offers" style={styles.secondaryLink}>
                    View Offers
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
    color: "#eef2ff",
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  eyebrow: {
    color: "#93c5fd",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    fontSize: 12,
  },
  title: {
    margin: "6px 0 0",
    fontSize: 34,
    fontWeight: 900,
  },
  subtitle: {
    marginTop: 8,
    color: "#a7b0d8",
    maxWidth: 620,
    lineHeight: 1.6,
  },
  actionButton: {
    border: "none",
    color: "#08111f",
    background: "#7ef0b3",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  actionButtonDisabled: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
  paymentPanel: {
    display: "grid",
    gap: 14,
    padding: 18,
    borderRadius: 18,
    background: "#ecfdf5",
    border: "1px solid rgba(34,197,94,0.35)",
    color: "#0f172a",
  },
  paymentPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  paymentTitle: {
    margin: "4px 0",
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
  },
  paymentForm: {
    display: "grid",
    gap: 12,
  },
  cardElementBox: {
    padding: 14,
    borderRadius: 12,
    background: "#ffffff",
    border: "1px solid rgba(15,23,42,0.18)",
  },
  secondaryButton: {
    border: "1px solid rgba(15,23,42,0.18)",
    color: "#0f172a",
    background: "#ffffff",
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  payButton: {
    border: "none",
    color: "#ffffff",
    background: "#22c55e",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  statsGrid: {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  },
  statCard: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
  },
  statLabel: {
    color: "#a7b0d8",
    fontSize: 13,
    fontWeight: 800,
  },
  statValue: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: 900,
  },
  statValueSmall: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 900,
  },
  statHint: {
    marginTop: 4,
    color: "#a7b0d8",
    fontSize: 13,
    fontWeight: 800,
  },
  noticeCard: {
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.24)",
    color: "#bbf7d0",
    borderRadius: 16,
    padding: 16,
    fontWeight: 800,
  },
  warningCard: {
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.26)",
    color: "#fde68a",
    borderRadius: 16,
    padding: 16,
    fontWeight: 800,
  },
  errorCard: {
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.24)",
    borderRadius: 16,
    padding: 18,
    color: "#fecaca",
  },
  stateCard: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 22,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 900,
  },
  emptyText: {
    color: "#a7b0d8",
    lineHeight: 1.6,
  },
  primaryLink: {
    display: "inline-block",
    marginTop: 12,
    textDecoration: "none",
    background: "#6ea8fe",
    color: "#08111f",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 900,
  },
  list: {
    display: "grid",
    gap: 16,
  },
  card: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
  },
  metaRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    color: "#a7b0d8",
    fontSize: 13,
    marginTop: 8,
  },
  amountPill: {
    background: "rgba(34,197,94,0.14)",
    border: "1px solid rgba(34,197,94,0.28)",
    color: "#bbf7d0",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 900,
    height: "fit-content",
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginTop: 18,
  },
  detailLabel: {
    color: "#a7b0d8",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  detailValue: {
    marginTop: 6,
    fontWeight: 800,
  },
  cardActions: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 18,
  },
  secondaryLink: {
    color: "#bfdbfe",
    textDecoration: "none",
    fontWeight: 900,
  },
  paidLabel: {
    color: "#bbf7d0",
    fontWeight: 900,
  },
};

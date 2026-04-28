// File: apps/web/src/pages/MyWinsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { getAuthHeaders, getAuthToken } from "../services/auth";
import { stripePromise } from "../lib/stripe";

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
};

type ApiWinRecord = Partial<{
  id: string;
  settlementId: string;
  auctionId: string;
  auctionTitle: string;
  title: string;
  itemTitle: string;
  shopName: string;
  pawnShopName: string;
  finalAmountCents: number;
  amountCents: number;
  amount: number;
  currency: string;
  status: string;
  endedAt: string;
  settledAt: string;
}>;

type PaymentIntentResponse = {
  success?: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  amount?: number;
  currency?: string;
  error?: string;
  message?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toValidDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  const normalized = String(value || "WON").trim().toUpperCase();
  return (normalized || "WON").replaceAll("_", " ");
}

function isPayableStatus(status: string) {
  const normalized = normalizeStatus(status);
  return normalized === "PENDING" || normalized === "WON";
}

function normalizeWin(row: ApiWinRecord, index: number): WinRecord {
  const cents =
    typeof row.finalAmountCents === "number"
      ? row.finalAmountCents
      : typeof row.amountCents === "number"
        ? row.amountCents
        : typeof row.amount === "number"
          ? Math.round(row.amount * 100)
          : 0;

  return {
    settlementId: String(row.settlementId || row.id || `win-${index}`),
    auctionId: String(row.auctionId || ""),
    auctionTitle: String(
      row.auctionTitle || row.title || row.itemTitle || "Won auction",
    ),
    shopName: String(row.shopName || row.pawnShopName || "Unknown shop"),
    finalAmountCents: cents,
    currency: String(row.currency || "USD"),
    status: normalizeStatus(row.status),
    endedAt: row.endedAt || null,
    settledAt: row.settledAt || null,
  };
}

function extractWinRows(payload: unknown): ApiWinRecord[] {
  if (Array.isArray(payload)) return payload as ApiWinRecord[];

  if (isObject(payload)) {
    if (Array.isArray(payload.data)) return payload.data as ApiWinRecord[];
    if (Array.isArray(payload.wins)) return payload.wins as ApiWinRecord[];
    if (Array.isArray(payload.items)) return payload.items as ApiWinRecord[];
    if (Array.isArray(payload.settlements)) {
      return payload.settlements as ApiWinRecord[];
    }
    if (payload.settlement && isObject(payload.settlement)) {
      return [payload.settlement as ApiWinRecord];
    }
  }

  return [];
}

function extractMessage(payload: unknown) {
  if (isObject(payload) && typeof payload.message === "string") {
    return payload.message;
  }
  if (isObject(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  return null;
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

async function fetchMyWins(signal?: AbortSignal): Promise<WinRecord[]> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing buyer token. Please log in again.");
  }

  const response = await fetch("/api/settlements/mine", {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "include",
    signal,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      extractMessage(payload) || `Request failed (${response.status})`;
    throw new Error(message);
  }

  const rawList = extractWinRows(payload);

  return sortWinsNewestFirst(
    rawList.map((row: ApiWinRecord, index: number) =>
      normalizeWin(row, index),
    ),
  );
}

async function createSettlementPaymentIntent(settlementId: string) {
  const response = await fetch(
    `/api/stripe/payment-intents/settlements/${settlementId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      credentials: "include",
      body: JSON.stringify({}),
    },
  );

  const payload = (await response
    .json()
    .catch(() => null)) as PaymentIntentResponse | null;

  if (!response.ok || !payload?.clientSecret) {
    throw new Error(
      payload?.error ||
        payload?.message ||
        `Failed to create payment (${response.status})`,
    );
  }

  return payload;
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

  const load = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      signal?: AbortSignal,
    ) => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const data = await fetchMyWins(signal);
        setWins(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load your wins.");
      } finally {
        if (mode === "refresh") setRefreshing(false);
        else setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load("initial", controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handlePay(settlementId: string) {
    setError("");
    setNotice("");
    setPayingSettlementId(settlementId);

    try {
      const paymentIntent = await createSettlementPaymentIntent(settlementId);
      const clientSecret = paymentIntent.clientSecret;

      if (!clientSecret) {
        throw new Error("Missing Stripe client secret.");
      }

      const stripe = await stripePromise;

      if (!stripe) {
        throw new Error("Stripe failed to load.");
      }

      const result = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: {
              token: "tok_visa",
            },
          },
        },
      );

      if (result.error) {
        throw new Error(result.error.message || "Payment failed.");
      }

      setNotice("Payment successful. Refreshing your wins...");
      await load("refresh");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPayingSettlementId(null);
    }
  }

  const summary = useMemo(() => {
    const totalSpentCents = wins.reduce(
      (sum, row) => sum + row.finalAmountCents,
      0,
    );

    const latest = wins.length > 0 ? sortWinsNewestFirst(wins)[0] : null;

    return {
      winsCount: wins.length,
      totalSpentCents,
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
          disabled={loading || refreshing}
          style={{
            ...styles.actionButton,
            ...(loading || refreshing ? styles.actionButtonDisabled : {}),
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
          <div style={styles.statLabel}>Total committed</div>
          <div style={styles.statValue}>
            {formatCurrency(summary.totalSpentCents)}
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Latest update</div>
          <div style={styles.statValueSmall}>
            {formatDate(summary.latestSettlement)}
          </div>
        </div>
      </div>

      {notice ? <div style={styles.noticeCard}>{notice}</div> : null}

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

            return (
              <article key={win.settlementId} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <h2 style={styles.cardTitle}>{win.auctionTitle}</h2>
                    <div style={styles.metaRow}>
                      <span>{win.shopName}</span>
                      <span>Settlement #{win.settlementId}</span>
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
                    <div style={styles.detailValue}>{win.status}</div>
                  </div>
                </div>

                <div style={styles.cardActions}>
                  {payable ? (
                    <button
                      type="button"
                      onClick={() => void handlePay(win.settlementId)}
                      disabled={paying}
                      style={{
                        ...styles.payButton,
                        ...(paying ? styles.actionButtonDisabled : {}),
                      }}
                    >
                      {paying ? "Processing..." : "Pay Now"}
                    </button>
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
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
  noticeCard: {
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.24)",
    color: "#bbf7d0",
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
};

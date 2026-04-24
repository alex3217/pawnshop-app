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
  if (!normalized) return "WON";
  return normalized.replaceAll("_", " ");
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

  const endpoint = "/api/settlements/mine";

  const response = await fetch(endpoint, {
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

export default function MyWinsPage() {
  const [wins, setWins] = useState<WinRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

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

  const summary = useMemo(() => {
    const totalSpentCents = wins.reduce(
      (sum, row) => sum + row.finalAmountCents,
      0,
    );

    return {
      winsCount: wins.length,
      totalSpentCents,
    };
  }, [wins]);

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Buyer</div>
          <h1 style={styles.title}>My Wins</h1>
          <p style={styles.subtitle}>
            Review the auctions you have won, final pricing, and settlement
            status.
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
      </div>

      {loading ? (
        <div style={styles.stateCard}>Loading your wins...</div>
      ) : error ? (
        <div style={styles.errorCard}>
          <div style={styles.emptyTitle}>Unable to load wins</div>
          <p style={styles.emptyText}>{error}</p>
        </div>
      ) : wins.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No wins yet</div>
          <p style={styles.emptyText}>
            When you win an auction, it will appear here with final price and
            settlement status.
          </p>
          <Link to="/auctions" style={styles.primaryLink}>
            Browse live auctions
          </Link>
        </div>
      ) : (
        <div style={styles.list}>
          {wins.map((win) => (
            <article key={win.settlementId} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>{win.auctionTitle}</h2>
                  <div style={styles.metaRow}>
                    <span>{win.shopName}</span>
                    <span>•</span>
                    <span>Status: {win.status}</span>
                  </div>
                </div>

                <div style={styles.amountPill}>
                  {formatCurrency(win.finalAmountCents, win.currency)}
                </div>
              </div>

              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.detailLabel}>Auction ended</div>
                  <div style={styles.detailValue}>
                    {formatDate(win.endedAt)}
                  </div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Settlement updated</div>
                  <div style={styles.detailValue}>
                    {formatDate(win.settledAt)}
                  </div>
                </div>
              </div>

              <div style={styles.cardActions}>
                {win.auctionId ? (
                  <Link
                    to={`/auctions/${win.auctionId}`}
                    style={styles.secondaryLink}
                  >
                    View auction
                  </Link>
                ) : null}

                <Link to="/offers" style={styles.secondaryLink}>
                  View offers
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    opacity: 0.72,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 4vw, 2.6rem)",
    fontWeight: 900,
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 760,
    color: "rgba(238,242,255,0.78)",
    lineHeight: 1.6,
  },
  actionButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  statCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 18,
  },
  statLabel: {
    fontSize: 13,
    color: "rgba(238,242,255,0.7)",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 900,
  },
  stateCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 22,
  },
  errorCard: {
    border: "1px solid rgba(255,120,120,0.25)",
    background: "rgba(255,120,120,0.09)",
    color: "#ffd4d4",
    borderRadius: 18,
    padding: 22,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 8,
  },
  emptyText: {
    margin: 0,
    color: "rgba(238,242,255,0.76)",
  },
  primaryLink: {
    display: "inline-flex",
    marginTop: 16,
    color: "#0b1020",
    background: "#eef2ff",
    textDecoration: "none",
    fontWeight: 800,
    padding: "10px 14px",
    borderRadius: 12,
  },
  list: {
    display: "grid",
    gap: 16,
  },
  card: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 20,
    display: "grid",
    gap: 18,
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
    fontWeight: 800,
  },
  metaRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8,
    color: "rgba(238,242,255,0.72)",
    fontSize: 14,
  },
  amountPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(99,102,241,0.18)",
    border: "1px solid rgba(129,140,248,0.3)",
    fontWeight: 900,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  detailLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(238,242,255,0.6)",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: 700,
  },
  cardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  secondaryLink: {
    textDecoration: "none",
    color: "#eef2ff",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
  },
};
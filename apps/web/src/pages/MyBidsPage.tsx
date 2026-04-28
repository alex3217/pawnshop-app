// File: apps/web/src/pages/MyBidsPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { getAuthToken } from "../services/auth";
import { getMyBids, type BidRow } from "../services/bids";

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

function getAuctionEndLabel(row: BidRow) {
  const raw = row.auction?.extendedEndsAt || row.auction?.endsAt;
  return formatDateTime(raw);
}

function getStatusTone(status: string): CSSProperties {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "LIVE") {
    return {
      background: "rgba(16, 185, 129, 0.14)",
      color: "#047857",
      border: "1px solid rgba(16, 185, 129, 0.28)",
    };
  }

  if (normalized === "ENDED") {
    return {
      background: "rgba(71, 85, 105, 0.14)",
      color: "#475569",
      border: "1px solid rgba(71, 85, 105, 0.28)",
    };
  }

  if (normalized === "CANCELED") {
    return {
      background: "rgba(220, 38, 38, 0.12)",
      color: "#b91c1c",
      border: "1px solid rgba(220, 38, 38, 0.24)",
    };
  }

  return {
    background: "rgba(59, 130, 246, 0.10)",
    color: "#1d4ed8",
    border: "1px solid rgba(59, 130, 246, 0.20)",
  };
}

export default function MyBidsPage() {
  const token = getAuthToken();

  const [rows, setRows] = useState<BidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false, signal?: AbortSignal) => {
      if (!token) {
        setRows([]);
        setError("You must be logged in to view your bids.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const data = await getMyBids(signal);
        setRows(data);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;

        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load bids");
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    return () => controller.abort();
  }, [load]);

  const summary = useMemo(() => {
    const liveCount = rows.filter(
      (row) => String(row.auction?.status || "").toUpperCase() === "LIVE",
    ).length;

    const endedCount = rows.filter(
      (row) => String(row.auction?.status || "").toUpperCase() === "ENDED",
    ).length;

    return {
      total: rows.length,
      liveCount,
      endedCount,
    };
  }, [rows]);

  return (
    <div className="page-stack">
      <div className="page-card">
        <div className="toolbar" style={{ alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="section-title">My Bids</div>
            <div className="section-subtitle">
              Review your bid history, current auction status, and latest
              auction prices.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {!loading && !error ? (
          <div className="muted" style={{ marginBottom: 12 }}>
            Total bids: {summary.total} · Live auctions: {summary.liveCount} ·
            Ended auctions: {summary.endedCount}
          </div>
        ) : null}

        {loading ? <p className="muted">Loading your bids…</p> : null}
        {error ? <div className="error-text">{error}</div> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="list-card">
            <strong>No bids yet</strong>
            <p className="muted" style={{ marginBottom: 12 }}>
              Browse auctions and place your first bid to see activity here.
            </p>
            <Link to="/auctions" className="btn btn-primary">
              Browse Auctions
            </Link>
          </div>
        ) : null}

        <div className="grid">
          {rows.map((row) => {
            const status = row.auction?.status ?? "UNKNOWN";
            const statusTone = getStatusTone(status);

            return (
              <div
                key={row.id}
                className="list-card"
                style={{ display: "grid", gap: 10 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <strong>{row.auction?.item?.title ?? "Auction Item"}</strong>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      ...statusTone,
                    }}
                  >
                    {status}
                  </span>
                </div>

                <div className="muted">
                  Shop: {row.auction?.shop?.name ?? "Unknown Shop"}
                </div>

                <div className="muted">
                  Bid placed: {formatDateTime(row.createdAt)}
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  <div>
                    <strong>Your bid:</strong> {formatMoney(row.amount)}
                  </div>
                  <div>
                    <strong>Current auction price:</strong>{" "}
                    {formatMoney(row.auction?.currentPrice)}
                  </div>
                  <div className="muted">
                    Minimum increment: {formatMoney(row.auction?.minIncrement)}
                  </div>
                </div>

                <div className="muted">
                  Ends: {getAuctionEndLabel(row)}
                  {row.auction?.extendedEndsAt ? " (extended)" : ""}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginTop: 4,
                  }}
                >
                  <Link to={`/auctions/${row.auctionId}`} className="btn btn-primary">
                    Open Auction
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

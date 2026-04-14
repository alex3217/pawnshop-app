// File: apps/web/src/pages/AuctionsPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE } from "../config";

type AuctionStatusFilter = "LIVE" | "ENDED" | "CANCELED" | "ALL";

type AuctionRow = {
  id: string;
  itemId: string;
  shopId: string;
  status: string;
  startingPrice: string;
  minIncrement: string;
  reservePrice?: string | null;
  buyItNowPrice?: string | null;
  startsAt: string;
  endsAt: string;
  extendedEndsAt?: string | null;
  currentPrice: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  item?: {
    id?: string;
    title?: string | null;
  } | null;
  shop?: {
    id?: string;
    name?: string | null;
  } | null;
};

type AuctionsResponse =
  | {
      page?: number;
      limit?: number;
      total?: number;
      rows?: AuctionRow[];
      error?: string;
      message?: string;
    }
  | AuctionRow[];

const FILTERS: AuctionStatusFilter[] = ["LIVE", "ENDED", "CANCELED", "ALL"];

function extractApiError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const maybe = payload as { error?: unknown; message?: unknown };
  return String(maybe.error || maybe.message || "");
}

async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeAuctionRows(payload: AuctionsResponse | null): AuctionRow[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function normalizeStatusFilter(value: string | null): AuctionStatusFilter {
  const raw = String(value || "LIVE").trim().toUpperCase();
  return FILTERS.includes(raw as AuctionStatusFilter)
    ? (raw as AuctionStatusFilter)
    : "LIVE";
}

function buildAuctionsUrl(status: AuctionStatusFilter) {
  const params = new URLSearchParams();

  if (status !== "ALL") {
    params.set("status", status);
  }

  params.set("limit", "50");

  const query = params.toString();
  return `${API_BASE}/auctions${query ? `?${query}` : ""}`;
}

function getAuctionEndLabel(auction: AuctionRow) {
  const raw = auction.extendedEndsAt || auction.endsAt;
  if (!raw) return "—";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function getStatusTone(status: string): React.CSSProperties {
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

export default function AuctionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = useMemo(
    () => normalizeStatusFilter(searchParams.get("status")),
    [searchParams]
  );

  const [rows, setRows] = useState<AuctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const res = await fetch(buildAuctionsUrl(statusFilter));
        const json = await safeJson<AuctionsResponse>(res);

        if (!res.ok) {
          throw new Error(
            extractApiError(json) || `Failed to load auctions (${res.status})`
          );
        }

        setRows(normalizeAuctionRows(json));
      } catch (err: unknown) {
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load auctions");
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (statusFilter !== "LIVE") return;

    const timer = window.setInterval(() => {
      load(true);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [load, statusFilter]);

  function applyFilter(next: AuctionStatusFilter) {
    if (next === "LIVE") {
      setSearchParams({});
      return;
    }

    setSearchParams({ status: next });
  }

  const emptyMessage =
    statusFilter === "LIVE"
      ? "No live auctions are available right now."
      : statusFilter === "ALL"
        ? "No auctions found."
        : `No ${statusFilter.toLowerCase()} auctions found.`;

  return (
    <div className="page-stack">
      <div className="page-card">
        <div className="toolbar" style={{ alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="section-title">Auctions</div>
            <div className="section-subtitle">
              Browse marketplace auctions, view current prices, and open any listing for details.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {FILTERS.map((filter) => {
              const active = filter === statusFilter;
              return (
                <button
                  key={filter}
                  type="button"
                  className={active ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => applyFilter(filter)}
                >
                  {filter === "ALL" ? "All" : filter}
                </button>
              );
            })}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => load(true)}
              disabled={loading || refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {loading ? <p className="muted">Loading auctions…</p> : null}
        {error ? <div className="error-text">{error}</div> : null}

        {!loading && !error ? (
          <div className="muted" style={{ marginBottom: 12 }}>
            Showing {rows.length} auction{rows.length === 1 ? "" : "s"}.
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="list-card">
            <strong>{emptyMessage}</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              Try another filter or refresh the list.
            </p>
          </div>
        ) : null}

        <div className="grid">
          {rows.map((auction) => {
            const statusTone = getStatusTone(auction.status);

            return (
              <div key={auction.id} className="list-card" style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong>{auction.item?.title ?? "Auction Item"}</strong>
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
                    {auction.status}
                  </span>
                </div>

                <div className="muted">
                  Shop: {auction.shop?.name ?? "Unknown Shop"}
                </div>

                <div style={{ fontSize: 24, fontWeight: 800 }}>
                  {formatMoney(auction.currentPrice)}
                </div>

                <div className="muted">
                  Minimum increment: {formatMoney(auction.minIncrement)}
                </div>

                <div className="muted">
                  Ends: {getAuctionEndLabel(auction)}
                  {auction.extendedEndsAt ? " (extended)" : ""}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  <Link to={`/auctions/${auction.id}`} className="btn btn-primary">
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
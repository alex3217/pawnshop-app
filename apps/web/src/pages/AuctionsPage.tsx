// File: apps/web/src/pages/AuctionsPage.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE } from "../config";

type AuctionStatusFilter = "LIVE" | "ENDED" | "CANCELED" | "ALL";

type AuctionRow = {
  id: string;
  itemId: string;
  shopId: string;
  status: "LIVE" | "ENDED" | "CANCELED" | string;
  startingPrice: string | number | null;
  minIncrement: string | number | null;
  reservePrice: string | number | null;
  buyItNowPrice: string | number | null;
  startsAt: string | null;
  endsAt: string | null;
  extendedEndsAt: string | null;
  currentPrice: string | number | null;
  version: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  item?: {
    id: string;
    title: string;
    description?: string | null;
    price?: string | number | null;
    currency?: string | null;
    category?: string | null;
    condition?: string | null;
    status?: string | null;
  } | null;
  shop?: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
  } | null;
};

type AuctionsResponse =
  | {
      page?: number;
      limit?: number;
      total?: number;
      rows?: AuctionRow[];
      auctions?: AuctionRow[];
      items?: AuctionRow[];
    }
  | AuctionRow[]
  | null;

async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

function normalizeAuctionRows(payload: AuctionsResponse): AuctionRow[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.auctions)) return payload.auctions;
  if (Array.isArray(payload.items)) return payload.items;

  return [];
}

function toMoney(value: string | number | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function toDateTime(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isAuctionStatusFilter(value: string | null): value is AuctionStatusFilter {
  return value === "LIVE" || value === "ENDED" || value === "CANCELED" || value === "ALL";
}

function buildAuctionsUrl(status: AuctionStatusFilter): string {
  const params = new URLSearchParams();

  if (status !== "ALL") {
    params.set("status", status);
  }

  params.set("limit", "50");

  const query = params.toString();
  return `${API_BASE}/auctions${query ? `?${query}` : ""}`;
}

function getStatusTone(status: string): string {
  switch (String(status || "").toUpperCase()) {
    case "LIVE":
      return "#22c55e";
    case "ENDED":
      return "#94a3b8";
    case "CANCELED":
      return "#ef4444";
    default:
      return "#60a5fa";
  }
}

const FILTERS: AuctionStatusFilter[] = ["LIVE", "ENDED", "CANCELED", "ALL"];
const POLL_MS = 30000;

export default function AuctionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState<AuctionStatusFilter>(
    isAuctionStatusFilter(initialStatus) ? initialStatus : "LIVE"
  );
  const [rows, setRows] = useState<AuctionRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  const syncUrl = useCallback(
    (nextStatus: AuctionStatusFilter) => {
      const nextParams = new URLSearchParams(searchParams);

      if (nextStatus === "ALL") {
        nextParams.delete("status");
      } else {
        nextParams.set("status", nextStatus);
      }

      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (inFlightRef.current) return;

      inFlightRef.current = true;

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        const res = await fetch(buildAuctionsUrl(statusFilter), {
          cache: "no-store",
        });

        const json = await safeJson<AuctionsResponse>(res);

        if (!res.ok) {
          const maybeError =
            json && typeof json === "object" && !Array.isArray(json) && "error" in json
              ? String((json as { error?: unknown }).error || "")
              : "";

          throw new Error(maybeError || `Failed to load auctions (${res.status})`);
        }

        const normalizedRows = normalizeAuctionRows(json);
        const nextTotal =
          json && typeof json === "object" && !Array.isArray(json) && "total" in json
            ? Number((json as { total?: unknown }).total ?? normalizedRows.length)
            : normalizedRows.length;

        setRows(normalizedRows);
        setTotal(Number.isFinite(nextTotal) ? nextTotal : normalizedRows.length);
      } catch (err: unknown) {
        setRows([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "Failed to load auctions.");
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    if (!isAuctionStatusFilter(initialStatus) && initialStatus !== null) {
      syncUrl("LIVE");
    }
    // intentionally only reacts to current URL's initial invalid value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (statusFilter !== "LIVE") return;

    const timer = window.setInterval(() => {
      void load("refresh");
    }, POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [load, statusFilter]);

  const headerDescription = useMemo(() => {
    switch (statusFilter) {
      case "LIVE":
        return "Browse live marketplace auctions and track current prices in real time.";
      case "ENDED":
        return "Review ended auctions and inspect their final outcomes.";
      case "CANCELED":
        return "Review canceled auctions across the marketplace.";
      case "ALL":
      default:
        return "Browse marketplace auctions, view current prices, and open any listing for details.";
    }
  }, [statusFilter]);

  const handleFilterChange = useCallback(
    (nextFilter: AuctionStatusFilter) => {
      setStatusFilter(nextFilter);
      syncUrl(nextFilter);
    },
    [syncUrl]
  );

  return (
    <div className="page-stack">
      <div className="page-card">
        <div className="toolbar" style={{ alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="section-title">Auctions</div>
            <div className="section-subtitle">{headerDescription}</div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void load("refresh")}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 8,
            marginBottom: 18,
          }}
        >
          {FILTERS.map((filter) => {
            const active = statusFilter === filter;

            return (
              <button
                key={filter}
                type="button"
                className={active ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => handleFilterChange(filter)}
              >
                {filter}
              </button>
            );
          })}
        </div>

        {error ? <div className="error-text">{error}</div> : null}
        {loading ? <p className="muted">Loading auctions…</p> : null}

        {!loading ? (
          <div className="muted" style={{ marginBottom: 14 }}>
            Showing {total} auction{total === 1 ? "" : "s"}.
          </div>
        ) : null}

        {!loading && rows.length === 0 ? (
          <div className="list-card">
            <strong>
              {statusFilter === "LIVE"
                ? "No live auctions are available right now."
                : statusFilter === "ENDED"
                  ? "No ended auctions were found."
                  : statusFilter === "CANCELED"
                    ? "No canceled auctions were found."
                    : "No auctions were found."}
            </strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              Try another filter or refresh the list.
            </p>
          </div>
        ) : null}

        <div className="grid">
          {rows.map((auction) => {
            const statusTone = getStatusTone(auction.status);

            return (
              <div key={auction.id} className="list-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <strong>{auction.item?.title || "Untitled Auction"}</strong>
                    <div className="muted">
                      Shop: {auction.shop?.name || "Unknown Shop"}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: statusTone,
                    }}
                  >
                    {auction.status}
                  </span>
                </div>

                {auction.item?.description ? (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    {auction.item.description}
                  </p>
                ) : null}

                <div className="muted">
                  Current Price: <strong>${toMoney(auction.currentPrice)}</strong>
                </div>

                <div className="muted">
                  Starting Price: ${toMoney(auction.startingPrice)}
                </div>

                <div className="muted">
                  Min Increment: ${toMoney(auction.minIncrement)}
                </div>

                <div className="muted">Starts: {toDateTime(auction.startsAt)}</div>
                <div className="muted">
                  Ends: {toDateTime(auction.extendedEndsAt || auction.endsAt)}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <Link to={`/auctions/${auction.id}`} className="btn btn-primary">
                    View Auction
                  </Link>

                  {auction.item?.id ? (
                    <Link to={`/items/${auction.item.id}`} className="btn btn-secondary">
                      View Item
                    </Link>
                  ) : null}

                  {auction.shop?.id ? (
                    <Link to={`/shops/${auction.shop.id}`} className="btn btn-secondary">
                      View Shop
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
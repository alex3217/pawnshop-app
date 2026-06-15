// File: apps/web/src/pages/AuctionsPage.tsx

import "../styles/auctions-readable-fix.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAuctions, type Auction } from "../services/auctions";

type AuctionStatusFilter = "LIVE" | "ENDED" | "CANCELED" | "ALL";
type AuctionSortKey = "ENDING_SOON" | "NEWEST" | "PRICE_HIGH" | "PRICE_LOW" | "STATUS";

type AuctionRow = Auction;




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

function auctionTimeMs(value: string | null | undefined) {
  if (!value) return Number.MAX_SAFE_INTEGER;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function auctionSearchText(auction: AuctionRow) {
  return [
    auction.id,
    auction.status,
    auction.itemId,
    auction.shopId,
    auction.item?.title,
    auction.item?.description,
    auction.item?.category,
    auction.item?.condition,
    auction.shop?.name,
    auction.shop?.address,
    auction.shop?.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortAuctionRows(rows: AuctionRow[], sortKey: AuctionSortKey) {
  return [...rows].sort((left, right) => {
    if (sortKey === "NEWEST") {
      return auctionTimeMs(right.createdAt || right.startsAt) - auctionTimeMs(left.createdAt || left.startsAt);
    }

    if (sortKey === "PRICE_HIGH") {
      return Number(right.currentPrice || right.startingPrice || 0) - Number(left.currentPrice || left.startingPrice || 0);
    }

    if (sortKey === "PRICE_LOW") {
      return Number(left.currentPrice || left.startingPrice || 0) - Number(right.currentPrice || right.startingPrice || 0);
    }

    if (sortKey === "STATUS") {
      return String(left.status || "").localeCompare(String(right.status || ""));
    }

    return auctionTimeMs(left.extendedEndsAt || left.endsAt) - auctionTimeMs(right.extendedEndsAt || right.endsAt);
  });
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
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<AuctionSortKey>("ENDING_SOON");
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
        const response = await getAuctions(statusFilter);
        const nextRows = response.auctions || [];
        setRows(nextRows);
        setTotal(response.total ?? nextRows.length);
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

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const visible = needle
      ? rows.filter((auction) => auctionSearchText(auction).includes(needle))
      : rows;

    return sortAuctionRows(visible, sortKey);
  }, [query, rows, sortKey]);

  const hasActiveFilters =
    query.trim().length > 0 || sortKey !== "ENDING_SOON" || statusFilter !== "LIVE";

  const handleFilterChange = useCallback(
    (nextFilter: AuctionStatusFilter) => {
      setStatusFilter(nextFilter);
      syncUrl(nextFilter);
    },
    [syncUrl]
  );

  function clearAuctionControls() {
    setQuery("");
    setSortKey("ENDING_SOON");
    handleFilterChange("LIVE");
  }

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

          <section
            className="list-card"
            style={{
              display: "grid",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(220px, 1fr) repeat(auto-fit, minmax(160px, 220px))",
                gap: 10,
                alignItems: "end",
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Search auctions</span>
                <input
                  aria-label="Search auctions"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search item, shop, status, category..."
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted">Sort auctions</span>
                <select
                  aria-label="Sort auctions"
                  value={sortKey}
                  onChange={(event) =>
                    setSortKey(event.target.value as AuctionSortKey)
                  }
                >
                  <option value="ENDING_SOON">Ending soon first</option>
                  <option value="NEWEST">Newest first</option>
                  <option value="PRICE_HIGH">Highest price</option>
                  <option value="PRICE_LOW">Lowest price</option>
                  <option value="STATUS">Status</option>
                </select>
              </label>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearAuctionControls}
                disabled={!hasActiveFilters || loading || refreshing}
              >
                Clear filters
              </button>
            </div>

            <div className="muted">
              Showing {filteredRows.length} of {rows.length} loaded auctions
              {total !== rows.length ? ` · ${total} total from server` : ""}.
            </div>
          </section>

        {error ? <div className="error-text">{error}</div> : null}
        {loading ? <p className="muted">Loading auctions…</p> : null}

        {!loading && filteredRows.length === 0 ? (
          <div className="list-card auctions-readable-empty">
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
          {filteredRows.map((auction) => {
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

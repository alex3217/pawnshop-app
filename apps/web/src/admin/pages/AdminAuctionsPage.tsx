import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi, type AdminAuctionRow } from "../services/adminApi";

type AuctionStatus = "LIVE" | "ENDED" | "CANCELED" | "ALL";

const FILTERS: AuctionStatus[] = ["LIVE", "ENDED", "CANCELED", "ALL"];

function money(value: string | number | null | undefined) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function AdminAuctionsPage() {
  const [rows, setRows] = useState<AdminAuctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AuctionStatus>("ALL");
  const [error, setError] = useState<string | null>(null);

  async function load(
    mode: "initial" | "refresh" = "initial",
    status = statusFilter,
    signal?: AbortSignal,
  ) {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);

    setError(null);

    try {
      const data = await adminApi.getAuctions(status, signal);
      setRows(data);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;

      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load auctions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load("initial", statusFilter, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      live: rows.filter((row) => row.status === "LIVE").length,
      ended: rows.filter((row) => row.status === "ENDED").length,
      canceled: rows.filter((row) => row.status === "CANCELED").length,
    };
  }, [rows]);

  return (
    <AdminPageShell
      title="Auctions"
      subtitle="Monitor auction visibility and marketplace state across all shops."
      actions={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load("refresh")}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={
              statusFilter === filter ? "btn btn-primary" : "btn btn-secondary"
            }
            onClick={() => setStatusFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      {error ? <div className="error-text">{error}</div> : null}
      {loading ? <p className="muted">Loading auctions…</p> : null}

      {!loading ? (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginBottom: 20,
          }}
        >
          <div className="list-card">
            <div className="muted">Visible</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.total}</div>
          </div>

          <div className="list-card">
            <div className="muted">Live</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.live}</div>
          </div>

          <div className="list-card">
            <div className="muted">Ended</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.ended}</div>
          </div>

          <div className="list-card">
            <div className="muted">Canceled</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>
              {stats.canceled}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="list-card">
          <strong>No auctions found</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            No auctions matched the current filter.
          </p>
        </div>
      ) : null}

      <div className="grid">
        {rows.map((auction) => (
          <div key={auction.id} className="list-card">
            <strong>{auction.item?.title || "Untitled Auction"}</strong>

            <div className="muted">
              Shop: {auction.shop?.name || "Unknown Shop"}
            </div>

            <div className="muted">Status: {auction.status || "UNKNOWN"}</div>

            <div className="muted">
              Current Price: ${money(auction.currentPrice)}
            </div>

            <div className="muted">
              Starting Price: ${money(auction.startingPrice)}
            </div>

            <div className="muted">
              Min Increment: ${money(auction.minIncrement)}
            </div>

            <div className="muted">Starts: {formatDate(auction.startsAt)}</div>

            <div className="muted">
              Ends: {formatDate(auction.extendedEndsAt || auction.endsAt)}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <Link to={`/auctions/${auction.id}`} className="btn btn-primary">
                View Auction
              </Link>

              {auction.item?.id ? (
                <Link
                  to={`/items/${auction.item.id}`}
                  className="btn btn-secondary"
                >
                  View Item
                </Link>
              ) : null}

              {auction.shop?.id ? (
                <Link
                  to={`/shops/${auction.shop.id}`}
                  className="btn btn-secondary"
                >
                  View Shop
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </AdminPageShell>
  );
}

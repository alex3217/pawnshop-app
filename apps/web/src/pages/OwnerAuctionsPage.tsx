// File: apps/web/src/pages/OwnerAuctionsPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../config";
import { getAuthHeaders, getAuthToken } from "../services/auth";

type Shop = {
  id: string;
  name: string;
};

type Auction = {
  id: string;
  status: string;
  currentPrice: string;
  startingPrice: string;
  minIncrement: string;
  startsAt: string;
  endsAt: string;
  extendedEndsAt?: string | null;
  item?: {
    id?: string;
    title?: string | null;
  } | null;
  shop?: {
    id?: string;
    name?: string | null;
  } | null;
};

type ShopsResponse =
  | Shop[]
  | {
      rows?: Shop[];
      shops?: Shop[];
      error?: string;
      message?: string;
    };

type AuctionsResponse =
  | Auction[]
  | {
      rows?: Auction[];
      error?: string;
      message?: string;
    };

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

function normalizeShops(payload: ShopsResponse | null): Shop[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.shops)) return payload.shops;
  return [];
}

function normalizeAuctions(payload: AuctionsResponse | null): Auction[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

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

function getAuctionEndLabel(auction: Auction) {
  return formatDateTime(auction.extendedEndsAt ?? auction.endsAt);
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

export default function OwnerAuctionsPage() {
  const token = getAuthToken();

  const [rows, setRows] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!token) {
        setRows([]);
        setError("You must be logged in as an owner.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const [shopsRes, auctionsRes] = await Promise.all([
          fetch(`${API_BASE}/shops/mine`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API_BASE}/auctions`, {
            headers: getAuthHeaders(),
          }),
        ]);

        const shopsJson = await safeJson<ShopsResponse>(shopsRes);
        const auctionsJson = await safeJson<AuctionsResponse>(auctionsRes);

        if (!shopsRes.ok) {
          throw new Error(
            extractApiError(shopsJson) || `Failed to load owner shops (${shopsRes.status})`
          );
        }

        if (!auctionsRes.ok) {
          throw new Error(
            extractApiError(auctionsJson) || `Failed to load auctions (${auctionsRes.status})`
          );
        }

        const ownerShops = normalizeShops(shopsJson);
        const ownerShopIds = new Set(
          ownerShops
            .map((shop) => String(shop.id || ""))
            .filter(Boolean)
        );

        const allAuctions = normalizeAuctions(auctionsJson);
        const filtered = allAuctions.filter((auction) =>
          ownerShopIds.has(String(auction.shop?.id || ""))
        );

        setRows(filtered);
      } catch (err: unknown) {
        setRows([]);
        setError(
          err instanceof Error ? err.message : "Failed to load owner auctions"
        );
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const liveCount = rows.filter(
      (auction) => String(auction.status || "").toUpperCase() === "LIVE"
    ).length;

    const endedCount = rows.filter(
      (auction) => String(auction.status || "").toUpperCase() === "ENDED"
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
            <div className="section-title">My Auctions</div>
            <div className="section-subtitle">
              View and track auctions tied to your shop inventory.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/owner/auctions/new" className="btn btn-primary">
              Create Auction
            </Link>

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

        {!loading && !error ? (
          <div className="muted" style={{ marginBottom: 12 }}>
            Total auctions: {summary.total} · Live: {summary.liveCount} · Ended: {summary.endedCount}
          </div>
        ) : null}

        {loading ? <p className="muted">Loading owner auctions…</p> : null}
        {error ? <div className="error-text">{error}</div> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="list-card">
            <strong>No auctions yet</strong>
            <p className="muted" style={{ marginBottom: 12 }}>
              Create your first auction from an existing item.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to="/owner/auctions/new" className="btn btn-primary">
                Create Auction
              </Link>
              <Link to="/owner/items/new" className="btn btn-secondary">
                Create Item
              </Link>
            </div>
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
                  Starting price: {formatMoney(auction.startingPrice)}
                </div>

                <div className="muted">
                  Minimum increment: {formatMoney(auction.minIncrement)}
                </div>

                <div className="muted">
                  Starts: {formatDateTime(auction.startsAt)}
                </div>

                <div className="muted">
                  Ends: {getAuctionEndLabel(auction)}
                  {auction.extendedEndsAt ? " (extended)" : ""}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  <Link to={`/auctions/${auction.id}`} className="btn btn-secondary">
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
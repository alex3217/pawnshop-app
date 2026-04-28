// File: apps/web/src/pages/OwnerAuctionsPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  cancelAuction,
  getOwnerAuctions,
  type Auction,
  type AuctionStatus,
} from "../services/auctions";
import { getAuthRole, getAuthToken } from "../services/auth";

type StatusFilter = "ALL" | "SCHEDULED" | "LIVE" | "ENDED" | "CANCELED";

const STATUS_FILTERS: StatusFilter[] = [
  "ALL",
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "CANCELED",
];

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

function statusLabel(status: AuctionStatus | null | undefined) {
  return String(status || "UNKNOWN").toUpperCase();
}

function itemTitle(auction: Auction) {
  return auction.item?.title || `Auction ${auction.id.slice(0, 8)}`;
}

function itemSubtitle(auction: Auction) {
  const parts = [
    auction.item?.category,
    auction.item?.condition,
    auction.shop?.name,
  ].filter(Boolean);

  return parts.length ? parts.join(" • ") : "No item details available";
}

export default function OwnerAuctionsPage() {
  const token = getAuthToken();
  const role = String(getAuthRole() || "").toUpperCase();

  const canViewOwnerAuctions =
    role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    return auctions.reduce<Record<string, number>>((acc, auction) => {
      const key = statusLabel(auction.status);
      acc[key] = (acc[key] || 0) + 1;
      acc.ALL = (acc.ALL || 0) + 1;
      return acc;
    }, {});
  }, [auctions]);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      setMsg(null);

      if (!token) {
        setAuctions([]);
        setMsg("Login as an owner to view your auctions.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!canViewOwnerAuctions) {
        setAuctions([]);
        setMsg("Only owner or admin accounts can view owner auctions.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const response = await getOwnerAuctions(statusFilter);
        setAuctions(response.auctions);
      } catch (err: unknown) {
        setMsg(err instanceof Error ? err.message : "Failed to load owner auctions.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canViewOwnerAuctions, statusFilter, token],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  async function onCancelAuction(auctionId: string) {
    const confirmed = window.confirm(
      "Cancel this auction? This should only be used before an auction is completed.",
    );

    if (!confirmed) return;

    setMsg(null);
    setCancelingId(auctionId);

    try {
      await cancelAuction(auctionId);
      await load("refresh");
      setMsg("Auction canceled.");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Failed to cancel auction.");
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-card" style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Owner Auctions</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Manage auctions created from your pawnshop inventory.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn" to="/owner/inventory">
              Inventory
            </Link>

            <Link className="btn btn-primary" to="/create-auction">
              Create Auction
            </Link>
          </div>
        </div>

        {msg ? (
          <div
            className={
              msg === "Auction canceled." ? "alert alert-success" : "alert alert-warning"
            }
          >
            {msg}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              disabled={loading || refreshing}
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status} {counts[status] ? `(${counts[status]})` : ""}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn"
            type="button"
            onClick={() => void load("refresh")}
            disabled={loading || refreshing || !token || !canViewOwnerAuctions}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div className="page-card">Loading owner auctions…</div>
        ) : auctions.length === 0 ? (
          <div className="page-card" style={{ display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>No auctions found</h2>
            <p className="muted" style={{ margin: 0 }}>
              Create an auction from one of your inventory items.
            </p>
            <Link className="btn btn-primary" to="/create-auction">
              Create Auction
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Status</th>
                  <th>Current Price</th>
                  <th>Min Increment</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {auctions.map((auction) => {
                  const label = statusLabel(auction.status);
                  const canCancel = label === "SCHEDULED" || label === "LIVE";

                  return (
                    <tr key={auction.id}>
                      <td>
                        <div style={{ display: "grid", gap: 4 }}>
                          <Link to={`/auctions/${auction.id}`}>
                            <strong>{itemTitle(auction)}</strong>
                          </Link>
                          <small className="muted">{itemSubtitle(auction)}</small>
                        </div>
                      </td>

                      <td>
                        <span className="badge">{label}</span>
                      </td>

                      <td>{formatMoney(auction.currentPrice)}</td>
                      <td>{formatMoney(auction.minIncrement)}</td>
                      <td>{formatDateTime(auction.startsAt)}</td>
                      <td>{formatDateTime(auction.extendedEndsAt || auction.endsAt)}</td>

                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link className="btn btn-sm" to={`/auctions/${auction.id}`}>
                            View
                          </Link>

                          {canCancel ? (
                            <button
                              className="btn btn-sm"
                              type="button"
                              onClick={() => void onCancelAuction(auction.id)}
                              disabled={cancelingId === auction.id}
                            >
                              {cancelingId === auction.id ? "Canceling…" : "Cancel"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// File: apps/web/src/pages/OwnerAuctionsPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  cancelAuction,
  endAuction,
  getOwnerAuctions,
  type Auction,
  type AuctionStatus,
} from "../services/auctions";
import { getAuthRole, getAuthToken } from "../services/auth";

type StatusFilter = "ALL" | "SCHEDULED" | "LIVE" | "ENDED" | "CANCELED";

type OwnerAuctionMessage = {
  type: "success" | "warning" | "danger";
  text: string;
};

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

function getStatusBadgeStyle(label: string) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "#ffffff",
  };

  if (label === "LIVE") {
    return {
      ...base,
      background: "rgba(34,197,94,0.9)",
    };
  }

  if (label === "ENDED") {
    return {
      ...base,
      background: "rgba(100,116,139,0.9)",
    };
  }

  if (label === "CANCELED") {
    return {
      ...base,
      background: "rgba(239,68,68,0.9)",
    };
  }

  if (label === "SCHEDULED") {
    return {
      ...base,
      background: "rgba(245,158,11,0.9)",
    };
  }

  return {
    ...base,
    background: "rgba(71,85,105,0.9)",
  };
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

function canCancelAuction(status: string) {
  return status === "SCHEDULED" || status === "LIVE";
}

function canEndAuction(status: string) {
  return status === "LIVE" || status === "SCHEDULED";
}

export default function OwnerAuctionsPage() {
  const token = getAuthToken();
  const role = String(getAuthRole() || "").toUpperCase();

  const canViewOwnerAuctions =
    role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [message, setMessage] = useState<OwnerAuctionMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);

  const actionInProgress = Boolean(cancelingId || endingId);

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
      setMessage(null);

      if (!token) {
        setAuctions([]);
        setMessage({
          type: "warning",
          text: "Login as an owner to view your auctions.",
        });
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!canViewOwnerAuctions) {
        setAuctions([]);
        setMessage({
          type: "warning",
          text: "Only owner or admin accounts can view owner auctions.",
        });
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const response = await getOwnerAuctions(statusFilter);
        setAuctions(response.auctions);
      } catch (err: unknown) {
        setMessage({
          type: "danger",
          text:
            err instanceof Error
              ? err.message
              : "Failed to load owner auctions.",
        });
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

  async function onEndAuction(auctionId: string) {
    const confirmed = window.confirm(
      "End this auction now? This should create the final auction result and settlement flow.",
    );

    if (!confirmed) return;

    setMessage(null);
    setEndingId(auctionId);

    try {
      await endAuction(auctionId);
      await load("refresh");
      setMessage({
        type: "success",
        text: "Auction ended successfully.",
      });
    } catch (err: unknown) {
      setMessage({
        type: "danger",
        text: err instanceof Error ? err.message : "Failed to end auction.",
      });
    } finally {
      setEndingId(null);
    }
  }

  async function onCancelAuction(auctionId: string) {
    const confirmed = window.confirm(
      "Cancel this auction? This should only be used before the auction is completed.",
    );

    if (!confirmed) return;

    setMessage(null);
    setCancelingId(auctionId);

    try {
      await cancelAuction(auctionId);
      await load("refresh");
      setMessage({
        type: "success",
        text: "Auction canceled successfully.",
      });
    } catch (err: unknown) {
      setMessage({
        type: "danger",
        text: err instanceof Error ? err.message : "Failed to cancel auction.",
      });
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
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Owner Auctions</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Manage live, scheduled, ended, and canceled auctions from your
              pawnshop inventory.
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

        {message ? (
          <div className={`alert alert-${message.type}`}>{message.text}</div>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              className={statusFilter === status ? "btn btn-primary" : "btn"}
              onClick={() => setStatusFilter(status)}
              disabled={loading || refreshing || actionInProgress}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span>{status}</span>
              <strong>{counts[status] || 0}</strong>
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span>Status Filter</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              disabled={loading || refreshing || actionInProgress}
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
            disabled={
              loading ||
              refreshing ||
              actionInProgress ||
              !token ||
              !canViewOwnerAuctions
            }
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" to="/create-auction">
                Create Auction
              </Link>
              <Link className="btn" to="/owner/inventory">
                Go to Inventory
              </Link>
            </div>
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
                  const cancelable = canCancelAuction(label);
                  const endable = canEndAuction(label);
                  const rowBusy =
                    cancelingId === auction.id || endingId === auction.id;

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
                        <span style={getStatusBadgeStyle(label)}>{label}</span>
                      </td>

                      <td>{formatMoney(auction.currentPrice)}</td>
                      <td>{formatMoney(auction.minIncrement)}</td>
                      <td>{formatDateTime(auction.startsAt)}</td>
                      <td>
                        {formatDateTime(auction.extendedEndsAt || auction.endsAt)}
                        {auction.extendedEndsAt ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            Extended
                          </div>
                        ) : null}
                      </td>

                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <Link className="btn btn-sm" to={`/auctions/${auction.id}`}>
                            View
                          </Link>

                          {cancelable ? (
                            <button
                              className="btn btn-sm"
                              type="button"
                              onClick={() => void onCancelAuction(auction.id)}
                              disabled={rowBusy || actionInProgress}
                            >
                              {cancelingId === auction.id ? "Canceling…" : "Cancel"}
                            </button>
                          ) : null}

                          {endable ? (
                            <button
                              className="btn btn-sm btn-primary"
                              type="button"
                              onClick={() => void onEndAuction(auction.id)}
                              disabled={rowBusy || actionInProgress}
                            >
                              {endingId === auction.id ? "Ending…" : "End"}
                            </button>
                          ) : null}

                          {!cancelable && !endable ? (
                            <span className="muted" style={{ fontSize: 12 }}>
                              No actions
                            </span>
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
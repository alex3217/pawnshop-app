// File: apps/web/src/pages/OwnerAuctionsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
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
type AuctionAction = "cancel" | "end";

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

const ACTIONABLE_STATUSES = new Set(["SCHEDULED", "LIVE"]);

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
  gap: 10,
};

const smallMutedStyle: CSSProperties = {
  color: "var(--muted-foreground, #64748b)",
  fontSize: 12,
};

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

function getStatusBadgeStyle(label: string): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#ffffff",
    width: "fit-content",
  };

  if (label === "LIVE") {
    return {
      ...base,
      background: "rgba(34,197,94,0.95)",
    };
  }

  if (label === "SCHEDULED") {
    return {
      ...base,
      background: "rgba(245,158,11,0.95)",
    };
  }

  if (label === "ENDED") {
    return {
      ...base,
      background: "rgba(100,116,139,0.95)",
    };
  }

  if (label === "CANCELED") {
    return {
      ...base,
      background: "rgba(239,68,68,0.95)",
    };
  }

  return {
    ...base,
    background: "rgba(71,85,105,0.95)",
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

function getItemId(auction: Auction) {
  return auction.item?.id || auction.itemId;
}

function getShopId(auction: Auction) {
  return auction.shop?.id || auction.shopId;
}

function canCancelAuction(status: string) {
  return ACTIONABLE_STATUSES.has(status);
}

function canEndAuction(status: string) {
  return ACTIONABLE_STATUSES.has(status);
}

function disabledReason(status: string, action: AuctionAction) {
  if (status === "ENDED") {
    return action === "cancel"
      ? "Ended auctions cannot be canceled."
      : "This auction is already ended.";
  }

  if (status === "CANCELED") {
    return action === "cancel"
      ? "This auction is already canceled."
      : "Canceled auctions cannot be ended.";
  }

  return "This action is only available for scheduled or live auctions.";
}

function Metric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: 14,
        padding: "10px 12px",
        background: "rgba(148,163,184,0.08)",
        display: "grid",
        gap: 4,
      }}
    >
      <span style={smallMutedStyle}>{label}</span>
      <strong style={{ fontSize: strong ? 18 : 14 }}>{value}</strong>
    </div>
  );
}

function StatusFilterButton({
  status,
  active,
  count,
  disabled,
  onClick,
}: {
  status: StatusFilter;
  active: boolean;
  count: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "btn btn-primary" : "btn"}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        minHeight: 42,
      }}
    >
      <span>{status}</span>
      <strong>{count}</strong>
    </button>
  );
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
  const [actionLoadingById, setActionLoadingById] = useState<
    Record<string, AuctionAction>
  >({});

  const actionInProgress = Object.keys(actionLoadingById).length > 0;

  const counts = useMemo(() => {
    return auctions.reduce<Record<StatusFilter, number>>(
      (acc, auction) => {
        const key = statusLabel(auction.status) as StatusFilter;

        acc.ALL += 1;

        if (key in acc) {
          acc[key] += 1;
        }

        return acc;
      },
      {
        ALL: 0,
        SCHEDULED: 0,
        LIVE: 0,
        ENDED: 0,
        CANCELED: 0,
      },
    );
  }, [auctions]);

  const liveCount = counts.LIVE;
  const scheduledCount = counts.SCHEDULED;
  const endedCount = counts.ENDED;
  const canceledCount = counts.CANCELED;

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

  function setAuctionAction(auctionId: string, action: AuctionAction | null) {
    setActionLoadingById((current) => {
      const next = { ...current };

      if (action) {
        next[auctionId] = action;
      } else {
        delete next[auctionId];
      }

      return next;
    });
  }

  async function onEndAuction(auction: Auction) {
    const status = statusLabel(auction.status);

    if (!canEndAuction(status)) {
      setMessage({
        type: "warning",
        text: disabledReason(status, "end"),
      });
      return;
    }

    const confirmed = window.confirm(
      "End this auction now? This should create the final auction result and settlement flow.",
    );

    if (!confirmed) return;

    setMessage(null);
    setAuctionAction(auction.id, "end");

    try {
      await endAuction(auction.id);
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
      setAuctionAction(auction.id, null);
    }
  }

  async function onCancelAuction(auction: Auction) {
    const status = statusLabel(auction.status);

    if (!canCancelAuction(status)) {
      setMessage({
        type: "warning",
        text: disabledReason(status, "cancel"),
      });
      return;
    }

    const confirmed = window.confirm(
      "Cancel this auction? This should only be used before the auction is completed.",
    );

    if (!confirmed) return;

    setMessage(null);
    setAuctionAction(auction.id, "cancel");

    try {
      await cancelAuction(auction.id);
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
      setAuctionAction(auction.id, null);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-card" style={{ display: "grid", gap: 18 }}>
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
              Manage scheduled, live, ended, and canceled auctions from your
              pawnshop inventory.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn" to="/owner/inventory">
              Inventory
            </Link>

            <Link className="btn btn-primary" to="/owner/auctions/new">
              Create Auction
            </Link>
          </div>
        </div>

        {message ? (
          <div className={`alert alert-${message.type}`}>{message.text}</div>
        ) : null}

        <div style={metricGridStyle}>
          <Metric label="Total Loaded" value={String(counts.ALL)} strong />
          <Metric label="Live" value={String(liveCount)} />
          <Metric label="Scheduled" value={String(scheduledCount)} />
          <Metric label="Ended" value={String(endedCount)} />
          <Metric label="Canceled" value={String(canceledCount)} />
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          }}
        >
          {STATUS_FILTERS.map((status) => (
            <StatusFilterButton
              key={status}
              status={status}
              active={statusFilter === status}
              count={counts[status]}
              disabled={loading || refreshing || actionInProgress}
              onClick={() => setStatusFilter(status)}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <label style={{ display: "grid", gap: 6, minWidth: 180 }}>
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
                  {status}
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
            {refreshing ? "Refreshing…" : "Refresh Auctions"}
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
              <Link className="btn btn-primary" to="/owner/auctions/new">
                Create Auction
              </Link>
              <Link className="btn" to="/owner/inventory">
                Go to Inventory
              </Link>
            </div>
          </div>
        ) : (
          <div style={cardGridStyle}>
            {auctions.map((auction) => {
              const label = statusLabel(auction.status);
              const cancelable = canCancelAuction(label);
              const endable = canEndAuction(label);
              const rowAction = actionLoadingById[auction.id];
              const rowBusy = Boolean(rowAction);
              const itemId = getItemId(auction);
              const shopId = getShopId(auction);

              return (
                <article
                  key={auction.id}
                  className="page-card"
                  style={{
                    display: "grid",
                    gap: 14,
                    alignContent: "space-between",
                    border:
                      label === "LIVE"
                        ? "1px solid rgba(34,197,94,0.35)"
                        : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ display: "grid", gap: 5 }}>
                      <Link to={`/auctions/${auction.id}`}>
                        <strong style={{ fontSize: 18 }}>
                          {itemTitle(auction)}
                        </strong>
                      </Link>
                      <small className="muted">{itemSubtitle(auction)}</small>
                    </div>

                    <span style={getStatusBadgeStyle(label)}>{label}</span>
                  </div>

                  <div style={metricGridStyle}>
                    <Metric
                      label="Current Price"
                      value={formatMoney(auction.currentPrice)}
                      strong
                    />
                    <Metric
                      label="Starting Price"
                      value={formatMoney(auction.startingPrice)}
                    />
                    <Metric
                      label="Min Increment"
                      value={formatMoney(auction.minIncrement)}
                    />
                    <Metric
                      label="Reserve"
                      value={formatMoney(auction.reservePrice)}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      borderTop: "1px solid rgba(148,163,184,0.25)",
                      paddingTop: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr",
                        gap: 8,
                      }}
                    >
                      <span style={smallMutedStyle}>Starts</span>
                      <strong>{formatDateTime(auction.startsAt)}</strong>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr",
                        gap: 8,
                      }}
                    >
                      <span style={smallMutedStyle}>Ends</span>
                      <strong>
                        {formatDateTime(auction.extendedEndsAt || auction.endsAt)}
                      </strong>
                    </div>

                    {auction.extendedEndsAt ? (
                      <div className="alert alert-warning" style={{ margin: 0 }}>
                        Auction end time was extended by bidding activity.
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <Link className="btn btn-sm" to={`/auctions/${auction.id}`}>
                      Auction Detail
                    </Link>

                    {itemId ? (
                      <Link className="btn btn-sm" to={`/items/${itemId}`}>
                        Item
                      </Link>
                    ) : null}

                    {shopId ? (
                      <Link className="btn btn-sm" to={`/shops/${shopId}`}>
                        Shop
                      </Link>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                      borderTop: "1px solid rgba(148,163,184,0.25)",
                      paddingTop: 12,
                    }}
                  >
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => void onCancelAuction(auction)}
                      disabled={!cancelable || rowBusy}
                      title={
                        cancelable ? "Cancel auction" : disabledReason(label, "cancel")
                      }
                    >
                      {rowAction === "cancel" ? "Canceling…" : "Cancel Auction"}
                    </button>

                    <button
                      className="btn btn-sm btn-primary"
                      type="button"
                      onClick={() => void onEndAuction(auction)}
                      disabled={!endable || rowBusy}
                      title={endable ? "End auction" : disabledReason(label, "end")}
                    >
                      {rowAction === "end" ? "Ending…" : "End Auction"}
                    </button>

                    {!cancelable && !endable ? (
                      <span style={smallMutedStyle}>
                        Actions disabled for {label.toLowerCase()} auctions.
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

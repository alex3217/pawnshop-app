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
  endAuctionWithSettlement,
  getOwnerAuctions,
  type Auction,
  type AuctionStatus,
} from "../services/auctions";
import { getAuthRole, getAuthToken } from "../services/auth";

type StatusFilter = "ALL" | "SCHEDULED" | "LIVE" | "ENDED" | "CANCELED";

type OwnerAuctionViewFilter = StatusFilter | "ENDING_SOON" | "NEEDS_ATTENTION";

type OwnerAuctionSortKey =
  | "endingSoon"
  | "newest"
  | "oldest"
  | "highestPrice"
  | "status";

const OWNER_AUCTION_VIEW_FILTERS: OwnerAuctionViewFilter[] = [
  "ALL",
  "SCHEDULED",
  "LIVE",
  "ENDING_SOON",
  "NEEDS_ATTENTION",
  "ENDED",
  "CANCELED",
];
type AuctionAction = "cancel" | "end";

type OwnerAuctionMessage = {
  type: "success" | "warning" | "danger";
  text: string;
};


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
      className="page-card"
      style={{
        display: "grid",
        gap: 6,
        minHeight: 92,
        borderColor: strong ? "rgba(110, 168, 254, 0.45)" : undefined,
      }}
    >
      <div
        className="muted"
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: strong ? 28 : 24, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

function StatusFilterButton({
  status,
  label,
  active,
  count,
  disabled = false,
  onClick,
}: {
  status?: OwnerAuctionViewFilter;
  label?: string;
  active: boolean;
  count?: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  const displayLabel = label || ownerAuctionViewFilterLabel(status || "ALL");

  return (
    <button
      type="button"
      className={active ? "btn btn-primary" : "btn"}
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>{displayLabel}</span>
      {typeof count === "number" ? (
        <span
          aria-label={`${displayLabel} count`}
          style={{
            borderRadius: 999,
            padding: "2px 7px",
            fontSize: 12,
            fontWeight: 900,
            background: active ? "rgba(255,255,255,0.2)" : "rgba(110,168,254,0.14)",
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}


function formatOwnerAuctionMoney(value: unknown) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatOwnerAuctionCents(value: unknown) {
  const cents = Number(value ?? 0);

  if (!Number.isFinite(cents)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getEndAuctionSuccessMessage(result: Awaited<ReturnType<typeof endAuctionWithSettlement>>) {
  const settlement = result?.settlement;

  if (!settlement) {
    if (result?.settlementReason === "NO_BIDS") {
      return "Auction ended successfully. No settlement was created because there were no bids.";
    }

    if (result?.settlementReason) {
      return `Auction ended successfully. Settlement status: ${result.settlementReason}.`;
    }

    return "Auction ended successfully.";
  }

  const winner =
    settlement.winnerName ||
    settlement.winnerEmail ||
    settlement.winnerUserId ||
    "winning buyer";

  const amount = formatOwnerAuctionCents(settlement.finalAmountCents);

  return `Auction ended successfully. Settlement ${settlement.id} created for ${winner} at ${amount}. Payment status: ${settlement.status || "PENDING"}.`;
}

function formatOwnerAuctionDateTime(value: unknown) {
  if (!value) return "Not set";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleString();
}

function getOwnerAuctionTimeState(auction: Auction) {
  const label = statusLabel(auction.status);
  const now = Date.now();
  const startsAt = auction.startsAt ? new Date(String(auction.startsAt)).getTime() : 0;
  const endsAt = auction.endsAt ? new Date(String(auction.endsAt)).getTime() : 0;

  if (label === "CANCELED") return "Canceled — no active owner action needed.";
  if (label === "ENDED") return `Closed ${formatOwnerAuctionDateTime(auction.endsAt)}.`;
  if (label === "SCHEDULED") return `Scheduled to start ${formatOwnerAuctionDateTime(auction.startsAt)}.`;

  if (label === "LIVE" && endsAt > now) {
    const minutes = Math.max(1, Math.round((endsAt - now) / 60000));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `Live — ${hours}h ${remainingMinutes}m remaining.`;
    }

    return `Live — ${minutes}m remaining.`;
  }

  if (startsAt && startsAt > now) {
    return `Upcoming — starts ${formatOwnerAuctionDateTime(auction.startsAt)}.`;
  }

  if (endsAt && endsAt < now) {
    return `Past auction — ended ${formatOwnerAuctionDateTime(auction.endsAt)}.`;
  }

  return "Auction timing needs review.";
}

function OwnerAuctionDetailCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 12,
        padding: "10px 12px",
        background: "rgba(15,23,42,0.45)",
        display: "grid",
        gap: 4,
      }}
    >
      <span style={smallMutedStyle}>{label}</span>
      <strong style={{ fontSize: 13, lineHeight: 1.35 }}>{value}</strong>
    </div>
  );
}


function getAuctionTimestamp(value: unknown) {
  if (!value) return 0;

  const time = new Date(String(value)).getTime();

  return Number.isFinite(time) ? time : 0;
}

function getAuctionPrice(auction: Auction) {
  return Number(auction.currentPrice ?? auction.startingPrice ?? 0);
}

function isEndingSoonAuction(auction: Auction) {
  const label = statusLabel(auction.status);

  if (label !== "LIVE" && label !== "SCHEDULED") return false;

  const endsAt = getAuctionTimestamp(auction.endsAt);
  if (!endsAt) return false;

  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  return endsAt >= now && endsAt - now <= twentyFourHours;
}

function isNeedsAttentionAuction(auction: Auction) {
  const label = statusLabel(auction.status);

  if (label === "LIVE" && !auction.endsAt) return true;
  if (label === "SCHEDULED" && !auction.startsAt) return true;
  if (Number(auction.minIncrement ?? 0) <= 0) return true;
  if (Number(auction.startingPrice ?? 0) <= 0) return true;

  return false;
}

function ownerAuctionMatchesViewFilter(
  auction: Auction,
  viewFilter: OwnerAuctionViewFilter,
) {
  const label = statusLabel(auction.status);

  if (viewFilter === "ALL") return true;
  if (viewFilter === "ENDING_SOON") return isEndingSoonAuction(auction);
  if (viewFilter === "NEEDS_ATTENTION") return isNeedsAttentionAuction(auction);

  return label === viewFilter;
}

function sortOwnerAuctions(
  auctions: Auction[],
  sortKey: OwnerAuctionSortKey,
) {
  return [...auctions].sort((left, right) => {
    if (sortKey === "highestPrice") {
      return getAuctionPrice(right) - getAuctionPrice(left);
    }

    if (sortKey === "newest") {
      return (
        getAuctionTimestamp(right.startsAt || right.endsAt) -
        getAuctionTimestamp(left.startsAt || left.endsAt)
      );
    }

    if (sortKey === "oldest") {
      return (
        getAuctionTimestamp(left.startsAt || left.endsAt) -
        getAuctionTimestamp(right.startsAt || right.endsAt)
      );
    }

    if (sortKey === "status") {
      return statusLabel(left.status).localeCompare(statusLabel(right.status));
    }

    const leftEnd = getAuctionTimestamp(left.endsAt) || Number.MAX_SAFE_INTEGER;
    const rightEnd = getAuctionTimestamp(right.endsAt) || Number.MAX_SAFE_INTEGER;

    return leftEnd - rightEnd;
  });
}

function ownerAuctionViewFilterLabel(filter: OwnerAuctionViewFilter) {
  if (filter === "ENDING_SOON") return "ENDING SOON";
  if (filter === "NEEDS_ATTENTION") return "NEEDS ATTENTION";

  return filter;
}

function isClosedOwnerAuction(auction: Auction) {
  const label = statusLabel(auction.status);
  return label === "ENDED" || label === "CANCELED";
}

function getOwnerAuctionRelistPath(auction: Auction) {
  const params = new URLSearchParams();

  if (auction.itemId) params.set("itemId", String(auction.itemId));
  if (auction.id) params.set("fromAuction", String(auction.id));

  const query = params.toString();

  return query ? `/owner/auctions/new?${query}` : "/owner/auctions/new";
}

function getOwnerAuctionOperationalWarnings(auction: Auction) {
  const warnings: string[] = [];
  const label = statusLabel(auction.status);

  if (!auction.itemId) warnings.push("Missing linked inventory item.");
  if (!auction.shopId) warnings.push("Missing shop context.");
  if (Number(auction.startingPrice ?? 0) <= 0) warnings.push("Starting price needs review.");
  if (Number(auction.minIncrement ?? 0) <= 0) warnings.push("Minimum bid increment needs review.");

  if ((label === "LIVE" || label === "SCHEDULED") && !auction.endsAt) {
    warnings.push("Auction end time needs review.");
  }

  if (label === "SCHEDULED" && !auction.startsAt) {
    warnings.push("Scheduled auction start time needs review.");
  }

  return warnings;
}


export default function OwnerAuctionsPage() {
  const token = getAuthToken();
  const role = String(getAuthRole() || "").toUpperCase();

  const canViewOwnerAuctions =
    role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<OwnerAuctionViewFilter>("ALL");
  const [sortKey, setSortKey] = useState<OwnerAuctionSortKey>("endingSoon");
  const [reviewedAuctionIds, setReviewedAuctionIds] = useState<Set<string>>(
    () => new Set(),
  );
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
      const result = await endAuctionWithSettlement(auction.id);
      await load("refresh");
      setMessage({
        type: "success",
        text: getEndAuctionSuccessMessage(result),
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

  const filteredAuctions = useMemo<Auction[]>(() => {
    const needle = query.trim().toLowerCase();

    const visible = auctions
      .filter((auction) => ownerAuctionMatchesViewFilter(auction, viewFilter))
      .filter((auction: Auction) => {
        if (!needle) return true;

        return [
          auction.id,
          auction.status,
          auction.itemId,
          auction.shopId,
          auction.item?.title,
          auction.shop?.name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      });

    return sortOwnerAuctions(visible, sortKey);
  }, [auctions, query, sortKey, viewFilter]);

  function getViewFilterCount(filter: OwnerAuctionViewFilter) {
    return auctions.filter((auction) => ownerAuctionMatchesViewFilter(auction, filter)).length;
  }

  function applyViewFilter(filter: OwnerAuctionViewFilter) {
    setViewFilter(filter);

    if (
      filter === "ALL" ||
      filter === "SCHEDULED" ||
      filter === "LIVE" ||
      filter === "ENDED" ||
      filter === "CANCELED"
    ) {
      setStatusFilter(filter);
      return;
    }

    setStatusFilter("ALL");
  }

  const closedAuctions = useMemo(
    () => auctions.filter((auction) => isClosedOwnerAuction(auction)),
    [auctions],
  );

  const reviewedClosedAuctionCount = useMemo(
    () =>
      closedAuctions.filter((auction) => reviewedAuctionIds.has(String(auction.id)))
        .length,
    [closedAuctions, reviewedAuctionIds],
  );

  const warningAuctionCount = useMemo(
    () =>
      auctions.filter(
        (auction) => getOwnerAuctionOperationalWarnings(auction).length > 0,
      ).length,
    [auctions],
  );

  function markClosedAuctionsReviewed() {
    if (closedAuctions.length === 0) {
      setMessage({
        type: "warning",
        text: "No ended or canceled auctions are available to mark reviewed.",
      });
      return;
    }

    setReviewedAuctionIds((current) => {
      const next = new Set(current);

      closedAuctions.forEach((auction) => {
        next.add(String(auction.id));
      });

      return next;
    });

    setMessage({
      type: "success",
      text: `Marked ${closedAuctions.length} closed auctions reviewed locally.`,
    });
  }

  function clearReviewedAuctionMarks() {
    setReviewedAuctionIds(new Set());
    setMessage({
      type: "success",
      text: "Cleared local reviewed marks for closed auctions.",
    });
  }

  function exportAuctionsCsv() {
    const rows = filteredAuctions.map((auction) => ({
      id: auction.id,
      status: auction.status,
      itemId: auction.itemId,
      item: auction.item?.title || "",
      shopId: auction.shopId,
      shop: auction.shop?.name || "",
      startingPrice: auction.startingPrice,
      currentPrice: auction.currentPrice,
      minIncrement: auction.minIncrement,
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
    }));

    const headers = Object.keys(
      rows[0] || {
        id: "",
        status: "",
        itemId: "",
        item: "",
        shopId: "",
        shop: "",
        startingPrice: "",
        currentPrice: "",
        minIncrement: "",
        startsAt: "",
        endsAt: "",
      },
    );

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((key) => {
            const value = String((row as Record<string, unknown>)[key] ?? "");
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "owner-auctions.csv";
    anchor.click();

    URL.revokeObjectURL(url);
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

            <select
              aria-label="Sort auctions"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as OwnerAuctionSortKey)}
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "#121935",
                color: "#eef2ff",
              }}
            >
              <option value="endingSoon">Ending soon first</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highestPrice">Highest current price</option>
              <option value="status">Status</option>
            </select>

            <Link className="btn btn-primary" to="/owner/auctions/new">
              Create Auction
            </Link>
          </div>
        </div>

        <section
          style={{
            border: "1px solid rgba(110,168,254,0.28)",
            borderRadius: 18,
            padding: 18,
            background:
              "radial-gradient(circle at top left, rgba(110,168,254,0.20), transparent 30%), rgba(18,25,53,0.95)",
            display: "grid",
            gap: 14,
          }}
        >
          <div>
            <div style={{ color: "#6ea8fe", fontWeight: 900, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Auction Command Center
            </div>
            <h2 style={{ margin: "4px 0 0" }}>Daily Auction Controls</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Search auctions, filter by status, create auction listings, review item/shop context,
              cancel scheduled/live auctions, end auctions, refresh, and export CSV.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "minmax(220px, 1fr) repeat(auto-fit, minmax(150px, 210px))",
              alignItems: "center",
            }}
          >
            <input
              aria-label="Search auctions"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search auctions by item, shop, status, or id..."
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "#121935",
                color: "#eef2ff",
              }}
            />

            <Link className="btn btn-primary" to="/owner/auctions/new">
              Create Auction
            </Link>

            <Link className="btn" to="/owner/inventory">
              Inventory
            </Link>

            <button type="button" className="btn" onClick={exportAuctionsCsv}>
              Export CSV
            </button>
          </div>

          <div className="muted">
            View auction, view item, cancel auction, and end auction controls are available on each auction card.
          </div>
        </section>

        <section
          data-owner-auction-operational-actions="true"
          className="page-card"
          style={{
            display: "grid",
            gap: 14,
            borderColor: "rgba(34,197,94,0.22)",
          }}
        >
          <div>
            <div
              style={{
                color: "#86efac",
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Operational Actions
            </div>
            <h2 style={{ margin: "4px 0 0" }}>Closed Auction Workflow</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Mark ended/canceled auctions reviewed locally, relist closed inventory,
              and scan for missing price/time data before creating the next auction.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <Metric
              label="Closed auctions"
              value={String(closedAuctions.length)}
              strong
            />
            <Metric
              label="Reviewed locally"
              value={`${reviewedClosedAuctionCount}/${closedAuctions.length}`}
            />
            <Metric
              label="Needs attention warnings"
              value={String(warningAuctionCount)}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={markClosedAuctionsReviewed}
              disabled={closedAuctions.length === 0}
            >
              Mark closed auctions reviewed
            </button>

            <button
              type="button"
              className="btn"
              onClick={clearReviewedAuctionMarks}
              disabled={reviewedAuctionIds.size === 0}
            >
              Clear reviewed marks
            </button>

            <Link className="btn" to="/owner/auctions/new">
              Create fresh auction
            </Link>
          </div>
        </section>

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
          {OWNER_AUCTION_VIEW_FILTERS.map((status) => (
            <StatusFilterButton
              key={status}
              status={status}
              active={viewFilter === status}
              count={getViewFilterCount(status)}
              disabled={loading || refreshing || actionInProgress}
              onClick={() => applyViewFilter(status)}
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
              value={viewFilter}
              onChange={(event) =>
                applyViewFilter(event.target.value as OwnerAuctionViewFilter)
              }
              disabled={loading || refreshing || actionInProgress}
            >
              {OWNER_AUCTION_VIEW_FILTERS.map((status) => (
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
        ) : filteredAuctions.length === 0 ? (
          <div className="page-card" style={{ display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>No auctions found</h2>
            <p className="muted" style={{ margin: 0 }}>
              Create an auction from one of your inventory items. Try clearing your search or switching filters before creating a new auction.
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
            {filteredAuctions.map((auction) => {
              const label = statusLabel(auction.status);
              const cancelable = canCancelAuction(label);
              const endable = canEndAuction(label);
              const rowAction = actionLoadingById[auction.id];
              const operationalWarnings = getOwnerAuctionOperationalWarnings(auction);
              const closedAuction = isClosedOwnerAuction(auction);
              const reviewedAuction = reviewedAuctionIds.has(String(auction.id));
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

                  {operationalWarnings.length > 0 ? (
                    <div
                      data-owner-auction-warning="true"
                      style={{
                        border: "1px solid rgba(250,204,21,0.32)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "rgba(250,204,21,0.10)",
                        color: "#fef3c7",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <strong>Needs attention</strong>
                      <span style={{ fontSize: 13 }}>
                        {operationalWarnings.join(" ")}
                      </span>
                    </div>
                  ) : null}

                  <div
                    data-owner-auction-card-detail="true"
                    style={{
                      display: "grid",
                      gap: 10,
                      gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
                      marginTop: 12,
                    }}
                  >
                    <OwnerAuctionDetailCell
                      label="Item"
                      value={auction.item?.title || `Item ${auction.itemId || "Not linked"}`}
                    />
                    <OwnerAuctionDetailCell
                      label="Shop"
                      value={auction.shop?.name || `Shop ${auction.shopId || "Not linked"}`}
                    />
                    <OwnerAuctionDetailCell
                      label="Current price"
                      value={formatOwnerAuctionMoney(auction.currentPrice ?? auction.startingPrice)}
                    />
                    <OwnerAuctionDetailCell
                      label="Starting price"
                      value={formatOwnerAuctionMoney(auction.startingPrice)}
                    />
                    <OwnerAuctionDetailCell
                      label="Min increment"
                      value={formatOwnerAuctionMoney(auction.minIncrement)}
                    />
                    <OwnerAuctionDetailCell
                      label="Starts"
                      value={formatOwnerAuctionDateTime(auction.startsAt)}
                    />
                    <OwnerAuctionDetailCell
                      label="Ends"
                      value={formatOwnerAuctionDateTime(auction.endsAt)}
                    />
                  </div>

                  <div
                    data-owner-auction-time-state="true"
                    style={{
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: "rgba(110,168,254,0.10)",
                      border: "1px solid rgba(110,168,254,0.22)",
                      color: "#dbeafe",
                      fontWeight: 800,
                      fontSize: 13,
                      marginTop: 10,
                    }}
                  >
                    {getOwnerAuctionTimeState(auction)}
                  </div>

                  {closedAuction ? (
                    <div
                      data-owner-auction-settlement-summary="true"
                      style={{
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "rgba(34,197,94,0.10)",
                        border: "1px solid rgba(34,197,94,0.22)",
                        color: "#dcfce7",
                        display: "grid",
                        gap: 5,
                        marginTop: 10,
                        fontSize: 13,
                      }}
                    >
                      <strong>Settlement Summary</strong>
                      {auction.settlement ? (
                        <>
                          <span>
                            Winner:{" "}
                            {auction.settlement.winnerName ||
                              auction.settlement.winnerEmail ||
                              auction.settlement.winnerUserId ||
                              "Winning buyer"}
                          </span>
                          <span>
                            Final amount:{" "}
                            {formatOwnerAuctionCents(auction.settlement.finalAmountCents)}
                          </span>
                          <span>
                            Status: {String(auction.settlement.status || "PENDING")}
                          </span>
                          <span>Settlement ID: {auction.settlement.id}</span>
                        </>
                      ) : (
                        <span>
                          No settlement is attached yet. Auctions without bids may close without
                          creating a settlement.
                        </span>
                      )}
                    </div>
                  ) : null}

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
                    {closedAuction ? (
                      <Link
                        data-owner-auction-relist="true"
                        className="btn btn-sm"
                        to={getOwnerAuctionRelistPath(auction)}
                      >
                        Relist from ended auction
                      </Link>
                    ) : null}

                    {cancelable ? (
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => void onCancelAuction(auction)}
                        disabled={rowBusy}
                        title="Cancel auction"
                      >
                        {rowAction === "cancel" ? "Canceling…" : "Cancel Auction"}
                      </button>
                    ) : null}

                    {endable ? (
                      <button
                        className="btn btn-sm btn-primary"
                        type="button"
                        onClick={() => void onEndAuction(auction)}
                        disabled={rowBusy}
                        title="End auction"
                      >
                        {rowAction === "end" ? "Ending…" : "End Auction"}
                      </button>
                    ) : null}

                    {!cancelable && !endable ? (
                      <span
                        data-owner-auction-closed="true"
                        style={{
                          ...smallMutedStyle,
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 32,
                          borderRadius: 999,
                          padding: "6px 10px",
                          background: "rgba(148,163,184,0.12)",
                        }}
                      >
                        {reviewedAuction
                          ? "Reviewed — no active owner action needed."
                          : "Auction closed — no active owner action needed."}
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

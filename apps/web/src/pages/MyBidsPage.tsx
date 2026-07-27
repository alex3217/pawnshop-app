import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuthToken } from "../services/auth";
import { archiveBid, getMyBids, restoreBid, type BidRow } from "../services/bids";
import { addToWatchlist } from "../services/watchlist";
import "../styles/my-bids-v2.css";

type BidFilter = "ALL" | "LIVE" | "LEADING" | "OUTBID" | "ENDED" | "ARCHIVED";
type BidSort = "ENDING_SOON" | "RECENT" | "HIGHEST_BID" | "OUTBID_FIRST" | "LIVE_FIRST";

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getAuctionEndDate(row: BidRow) {
  const raw = row.auction?.extendedEndsAt || row.auction?.endsAt;
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAuctionEndLabel(row: BidRow) {
  const endDate = getAuctionEndDate(row);
  if (!endDate) return "End time unavailable";

  const diffMs = endDate.getTime() - Date.now();

  if (diffMs <= 0) return "Ended";

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(minutes, 1)}m left`;
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "UNKNOWN").toUpperCase();
}

function getBidPosition(row: BidRow) {
  const bid = Number(row.amount);
  const current = Number(row.auction?.currentPrice);

  if (!Number.isFinite(bid) || !Number.isFinite(current)) return "Unknown";
  if (bid >= current) return "Leading";
  return "Outbid";
}

function statusClass(status: string | null | undefined) {
  return `mybids2-status mybids2-status-${normalizeStatus(status).toLowerCase()}`;
}

function bidPositionClass(position: string) {
  return `mybids2-position mybids2-position-${position.toLowerCase()}`;
}

function itemIdFor(row: BidRow) {
  return row.auction?.item?.id || "";
}

function shopIdFor(row: BidRow) {
  return row.auction?.shop?.id || "";
}

function itemTitleFor(row: BidRow) {
  return row.auction?.item?.title || "Auction item";
}

function shopNameFor(row: BidRow) {
  return row.auction?.shop?.name || "Unknown shop";
}

function isLiveBid(row: BidRow) {
  return normalizeStatus(row.auction?.status) === "LIVE";
}

function isEndedBid(row: BidRow) {
  return normalizeStatus(row.auction?.status) === "ENDED" || getAuctionEndLabel(row) === "Ended";
}

const MY_BIDS_PAGE_SIZE = 36;

function BidCard({
  row,
  watchingItemId,
  onWatchItem,
  processingBidId,
  onArchiveAction,
}: {
  row: BidRow;
  watchingItemId: string | null;
  onWatchItem: (row: BidRow) => void;
  processingBidId: string | null;
  onArchiveAction: (row: BidRow) => void;
}) {
  const status = normalizeStatus(row.auction?.status);
  const position = getBidPosition(row);
  const itemTitle = itemTitleFor(row);
  const shopName = shopNameFor(row);
  const itemId = itemIdFor(row);
  const shopId = shopIdFor(row);
  const live = isLiveBid(row);
  const ended = isEndedBid(row);
  const outbid = position === "Outbid";
  const leading = position === "Leading";
  const processing = processingBidId === row.id;

  return (
    <article className={`mybids2-card${row.archived ? " mybids2-card-archived" : ""}`}>
      <div className="mybids2-card-top">
        <div>
          <Link to={`/auctions/${row.auctionId}`} className="mybids2-title">
            {itemTitle}
          </Link>
          <p>{shopName}</p>
        </div>

        <span className={statusClass(status)}>{status}</span>
      </div>

      <div className="mybids2-money-grid">
        <div>
          <span>Your bid</span>
          <strong>{formatMoney(row.amount)}</strong>
        </div>
        <div>
          <span>Current price</span>
          <strong>{formatMoney(row.auction?.currentPrice)}</strong>
        </div>
      </div>

      <div className="mybids2-meta-grid">
        <div>
          <span>Bid position</span>
          <strong className={bidPositionClass(position)}>{position}</strong>
        </div>
        <div>
          <span>Minimum increment</span>
          <strong>{formatMoney(row.auction?.minIncrement)}</strong>
        </div>
        <div>
          <span>Placed</span>
          <strong>{formatDateTime(row.createdAt)}</strong>
        </div>
        <div>
          <span>Ends</span>
          <strong>{getAuctionEndLabel(row)}</strong>
        </div>
      </div>

      <div className="mybids2-actions">
        <Link to={`/auctions/${row.auctionId}`} className="mybids2-primary-small">
          {live && outbid ? "Bid again" : live && leading ? "Monitor auction" : "Open auction"}
        </Link>

        {itemId ? (
          <Link to={`/items/${encodeURIComponent(itemId)}`} className="mybids2-secondary-small">
            View item
          </Link>
        ) : null}

        {shopId ? (
          <Link to={`/shops/${encodeURIComponent(shopId)}`} className="mybids2-secondary-small">
            View shop
          </Link>
        ) : null}

        {itemId ? (
          <button
            type="button"
            className="mybids2-secondary-small"
            disabled={watchingItemId === itemId}
            onClick={() => onWatchItem(row)}
          >
            {watchingItemId === itemId ? "Saving..." : "Watch item"}
          </button>
        ) : null}

        {ended && row.isWinner ? (
          <Link to="/my-wins" className="mybids2-primary-small">
            View win / payment
          </Link>
        ) : null}

        {ended && !row.isWinner ? (
          <Link to={`/buyer/item-locator?search=${encodeURIComponent(itemTitle)}`} className="mybids2-secondary-small">
            Find similar
          </Link>
        ) : null}

        {row.archived || row.canArchive ? (
          <button
            type="button"
            className="mybids2-secondary-small mybids2-archive-action"
            disabled={processing}
            aria-label={`${row.archived ? "Restore" : "Archive"} bid for ${itemTitle}`}
            onClick={() => onArchiveAction(row)}
          >
            {processing ? "Saving..." : row.archived ? "Restore" : "Archive"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function MyBidsPage() {
  const token = getAuthToken();

  const [rows, setRows] = useState<BidRow[]>([]);
  const [visibleCount, setVisibleCount] = useState(MY_BIDS_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watchingItemId, setWatchingItemId] = useState<string | null>(null);
  const [processingBidId, setProcessingBidId] = useState<string | null>(null);
  const [pendingArchiveRow, setPendingArchiveRow] = useState<BidRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<BidFilter>("ALL");
  const [sortMode, setSortMode] = useState<BidSort>("ENDING_SOON");
  const [query, setQuery] = useState("");

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
        const data = await getMyBids(filter === "ARCHIVED", signal);
        setRows(data);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;

        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load bids.");
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [token, filter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    return () => controller.abort();
  }, [load]);

  const summary = useMemo(() => {
    const liveCount = rows.filter(isLiveBid).length;
    const endedCount = rows.filter(isEndedBid).length;
    const leadingCount = rows.filter((row) => getBidPosition(row) === "Leading").length;
    const outbidCount = rows.filter((row) => getBidPosition(row) === "Outbid").length;

    const totalBidValue = rows.reduce((sum, row) => {
      const amount = Number(row.amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    return {
      total: rows.length,
      liveCount,
      endedCount,
      leadingCount,
      outbidCount,
      totalBidValue,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const nextRows = rows.filter((row) => {
      const status = normalizeStatus(row.auction?.status);
      const position = getBidPosition(row).toUpperCase();
      const searchable = [
        itemTitleFor(row),
        shopNameFor(row),
        status,
        position,
      ].join(" ").toLowerCase();

      if (filter === "LIVE" && !isLiveBid(row)) return false;
      if (filter === "ENDED" && !isEndedBid(row)) return false;
      if (filter === "LEADING" && position !== "LEADING") return false;
      if (filter === "OUTBID" && position !== "OUTBID") return false;
      if (filter === "ARCHIVED" && !row.archived) return false;
      if (q && !searchable.includes(q)) return false;

      return true;
    });

    return [...nextRows].sort((a, b) => {
      if (sortMode === "RECENT") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      if (sortMode === "HIGHEST_BID") {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }

      if (sortMode === "OUTBID_FIRST") {
        return Number(getBidPosition(b) === "Outbid") - Number(getBidPosition(a) === "Outbid");
      }

      if (sortMode === "LIVE_FIRST") {
        return Number(isLiveBid(b)) - Number(isLiveBid(a));
      }

      const aEnd = getAuctionEndDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bEnd = getAuctionEndDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aEnd - bEnd;
    });
  }, [rows, query, filter, sortMode]);

  async function handleWatchItem(row: BidRow) {
    const itemId = itemIdFor(row);

    if (!itemId) {
      setNotice("This bid does not have an item attached.");
      return;
    }

    try {
      setWatchingItemId(itemId);
      setNotice(null);
      await addToWatchlist(itemId);
      setNotice("Item added to your watchlist.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to watch item.");
    } finally {
      setWatchingItemId(null);
    }
  }

  async function confirmArchiveAction() {
    const row = pendingArchiveRow;
    if (!row) return;

    setPendingArchiveRow(null);
    setProcessingBidId(row.id);
    setNotice(null);
    setError(null);

    try {
      if (row.archived) await restoreBid(row.id);
      else await archiveBid(row.id);

      setRows((current) => current.filter((item) => item.id !== row.id));
      setNotice(
        row.archived
          ? `"${itemTitleFor(row)}" was restored to My Bids.`
          : `"${itemTitleFor(row)}" was archived.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update this bid.");
    } finally {
      setProcessingBidId(null);
    }
  }

  const filters: Array<{ value: BidFilter; label: string }> = [
    { value: "ALL", label: "All" },
    { value: "LIVE", label: "Live" },
    { value: "LEADING", label: "Leading" },
    { value: "OUTBID", label: "Outbid" },
    { value: "ENDED", label: "Ended" },
    { value: "ARCHIVED", label: "Archived" },
  ];

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount],
  );

  const hiddenBidCount = Math.max(filteredRows.length - visibleRows.length, 0);

  const hasActiveBidControls =
    filter !== "ALL" || sortMode !== "ENDING_SOON" || query.trim().length > 0;

  function clearBidControls() {
    setFilter("ALL");
    setSortMode("ENDING_SOON");
    setQuery("");
    setVisibleCount(MY_BIDS_PAGE_SIZE);
  }

  return (
    <main className="mybids2-page">
      <section className="mybids2-hero">
        <div className="mybids2-hero-copy">
          <span className="mybids2-pill">Buyer bidding center</span>
          <h1>Track your bids and auction activity.</h1>
          <p>
            Review live bids, see whether you are leading or outbid, jump back into
            auctions, and keep control of your auction activity. Use Bid again when
            you are outbid, Monitor auction when you are leading, and Open auction
            for ended or historical bid records.
          </p>

          <div className="mybids2-hero-actions">
            <Link to="/auctions">Browse auctions</Link>
            <Link to="/buyer/dashboard">Buyer dashboard</Link>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading || refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh bids"}
            </button>
          </div>
        </div>

        <aside className="mybids2-hero-panel">
          <div className="mybids2-summary-box">
            <span className="mybids2-summary-label">Total bids</span>
            <strong className="mybids2-summary-value">{summary.total}</strong>
            <small className="mybids2-summary-supporting">bid records</small>
          </div>
          <div className="mybids2-summary-box">
            <span className="mybids2-summary-label">Live</span>
            <strong className="mybids2-summary-value">{summary.liveCount}</strong>
            <small className="mybids2-summary-supporting">active auctions</small>
          </div>
          <div className="mybids2-summary-box">
            <span className="mybids2-summary-label">Leading</span>
            <strong className="mybids2-summary-value">{summary.leadingCount}</strong>
            <small className="mybids2-summary-supporting">{summary.outbidCount} outbid</small>
          </div>
          <div className="mybids2-summary-box">
            <span className="mybids2-summary-label">Bid value</span>
            <strong className="mybids2-summary-value">{formatMoney(summary.totalBidValue)}</strong>
            <small className="mybids2-summary-supporting">tracked total</small>
          </div>
        </aside>
      </section>

      <section className="mybids2-control-panel">
        <div className="mybids2-filter-tabs">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              className={filter === item.value ? "active" : ""}
              onClick={() => {
                  setFilter(item.value);
                  setVisibleCount(MY_BIDS_PAGE_SIZE);
                }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mybids2-control-row">
          <label>
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(MY_BIDS_PAGE_SIZE);
                }}
              placeholder="Search item, shop, status..."
            />
          </label>

          <label>
            <span>Sort</span>
            <select
              value={sortMode}
              onChange={(event) => {
                  setSortMode(event.target.value as BidSort);
                  setVisibleCount(MY_BIDS_PAGE_SIZE);
                }}
            >
              <option value="ENDING_SOON">Ending soon</option>
              <option value="LIVE_FIRST">Live first</option>
              <option value="OUTBID_FIRST">Outbid first</option>
              <option value="HIGHEST_BID">Highest bid</option>
              <option value="RECENT">Recently placed</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className="mybids2-clear-controls"
          onClick={clearBidControls}
          disabled={!hasActiveBidControls || loading || refreshing}
        >
          Clear filters
        </button>

        <div className="mybids2-control-summary">
          Showing {filteredRows.length} of {rows.length} bid records
          {hiddenBidCount > 0 ? ` · ${hiddenBidCount} hidden until you load more` : ""}
        </div>
      </section>

      <section className="mybids2-discovery-strip">
        <Link to="/buyer/dashboard" className="mybids2-shortcut-banner">
          Buyer dashboard <span className="mybids2-shortcut-subtitle">Return to command center</span>
        </Link>
        <Link to="/auctions" className="mybids2-shortcut-banner">
          Auctions <span className="mybids2-shortcut-subtitle">Find active auctions</span>
        </Link>
        <Link to="/my-wins" className="mybids2-shortcut-banner">
          My wins <span className="mybids2-shortcut-subtitle">Review won auctions</span>
        </Link>
        <Link to="/watchlist" className="mybids2-shortcut-banner">
          Watchlist <span className="mybids2-shortcut-subtitle">Track saved inventory</span>
        </Link>
      </section>

      {notice ? (
        <section className="mybids2-notice" role="status" aria-live="polite">
          {notice}
        </section>
      ) : null}

      {error ? (
        <section className="mybids2-error" role="alert">
          <h2>Bids could not load</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void load(true)}>
            Try again
          </button>
        </section>
      ) : null}

      {loading ? (
        <section className="mybids2-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="mybids2-skeleton" />
          ))}
        </section>
      ) : !error && filteredRows.length === 0 ? (
        <section className="mybids2-empty">
          <h2>No bids matched</h2>
          <p>
            Change your filters or browse auctions to place another bid.
          </p>
          <Link to="/auctions">Browse auctions</Link>
        </section>
      ) : (
        <>
          <section className="mybids2-grid">
            {visibleRows.map((row) => (
              <BidCard
                key={row.id}
                row={row}
                watchingItemId={watchingItemId}
                onWatchItem={handleWatchItem}
                processingBidId={processingBidId}
                onArchiveAction={setPendingArchiveRow}
              />
            ))}
          </section>

          {hiddenBidCount > 0 ? (
            <section className="mybids2-pagination-panel">
              <div>
                <strong>
                  Showing {visibleRows.length} of {filteredRows.length} bid records
                </strong>
                <p>
                  Older bid records are still available. Load more when you need
                  deeper auction history.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setVisibleCount((current) =>
                    Math.min(current + MY_BIDS_PAGE_SIZE, filteredRows.length),
                  )
                }
              >
                Show more bids ({hiddenBidCount})
              </button>
            </section>
          ) : null}
        </>
      )}

      {pendingArchiveRow ? (
        <div
          className="mybids2-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingArchiveRow(null);
          }}
        >
          <section
            className="mybids2-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mybids2-dialog-title"
            aria-describedby="mybids2-dialog-description"
            onKeyDown={(event) => {
              if (event.key === "Escape") setPendingArchiveRow(null);
            }}
          >
            <h2 id="mybids2-dialog-title">
              {pendingArchiveRow.archived ? "Restore this bid?" : "Archive this bid?"}
            </h2>
            <p id="mybids2-dialog-description">
              {pendingArchiveRow.archived
                ? "This returns the entry to your normal My Bids view."
                : "This only hides the entry from your normal view. The bid, auction, payment, settlement, and audit history are preserved."}
            </p>
            <div className="mybids2-dialog-actions">
              <button
                type="button"
                className="mybids2-secondary-small"
                autoFocus
                onClick={() => setPendingArchiveRow(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mybids2-primary-small"
                onClick={() => void confirmArchiveAction()}
              >
                {pendingArchiveRow.archived ? "Restore bid" : "Archive bid"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMyWatchlist,
  removeFromWatchlist,
  type WatchlistEntry,
} from "../services/watchlist";
import "../styles/watchlist-v2.css";

type StatusFilter = "ALL" | "AVAILABLE" | "UNAVAILABLE";
type SortKey = "NEWEST" | "PRICE_HIGH" | "PRICE_LOW" | "TITLE" | "SHOP";

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function toPriceNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value: string | number | null | undefined) {
  const amount = toPriceNumber(value);

  if (!amount) return "Price unavailable";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTrackedValue(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(toPriceNumber(value));
}

function itemImage(entry: WatchlistEntry) {
  const images = entry.item?.images;
  return Array.isArray(images) && images.length ? images[0] : "";
}

function itemId(entry: WatchlistEntry) {
  return entry.item?.id || entry.itemId || "";
}

function shopId(entry: WatchlistEntry) {
  return entry.item?.shop?.id || entry.item?.pawnShopId || "";
}

function itemTitle(entry: WatchlistEntry) {
  return normalizeLabel(entry.item?.title, "Unknown item");
}

function shopName(entry: WatchlistEntry) {
  return normalizeLabel(entry.item?.shop?.name, "Unknown shop");
}

function isAvailable(status: string | null | undefined) {
  return ["AVAILABLE", "ACTIVE"].includes(normalizeStatus(status));
}

function createdAtMs(entry: WatchlistEntry) {
  const value = entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function itemHref(entry: WatchlistEntry) {
  const id = itemId(entry);
  return id ? `/items/${encodeURIComponent(id)}` : "/marketplace";
}

function shopHref(entry: WatchlistEntry) {
  const id = shopId(entry);
  return id ? `/shops/${encodeURIComponent(id)}` : "/shops";
}

function offerHref(entry: WatchlistEntry) {
  const id = itemId(entry);
  return id ? `/offers?itemId=${encodeURIComponent(id)}` : "/offers";
}

function auctionSearchHref(entry: WatchlistEntry) {
  const title = itemTitle(entry);
  return `/auctions?search=${encodeURIComponent(title)}`;
}

function itemLocatorHref(entry: WatchlistEntry) {
  const title = itemTitle(entry);
  return `/buyer/item-locator?search=${encodeURIComponent(title)}`;
}

function WatchlistCard({
  entry,
  removingId,
  selected,
  onToggle,
  onRemove,
}: {
  entry: WatchlistEntry;
  removingId: string | null;
  selected: boolean;
  onToggle: (itemId: string) => void;
  onRemove: (entry: WatchlistEntry) => void;
}) {
  const id = itemId(entry);
  const image = itemImage(entry);
  const status = normalizeLabel(entry.item?.status, "Unknown");
  const available = isAvailable(status);
  const title = itemTitle(entry);

  return (
    <article className={selected ? "watch2-card selected" : "watch2-card"}>
      <label className="watch2-select-row">
        <input
          type="checkbox"
          checked={selected}
          disabled={!id}
          onChange={() => id && onToggle(id)}
        />
        <span>Select item</span>
      </label>

      <Link to={itemHref(entry)} className="watch2-media">
        {image ? <img src={image} alt={title} /> : <div>PawnLoop</div>}

        <span className={available ? "watch2-status available" : "watch2-status"}>
          {status}
        </span>
      </Link>

      <div className="watch2-body">
        <div className="watch2-heading">
          <div>
            <Link to={itemHref(entry)} className="watch2-title">
              {title}
            </Link>
            <p>{shopName(entry)}</p>
          </div>

          <strong>{formatPrice(entry.item?.price)}</strong>
        </div>

        <div className="watch2-badges">
          <span>{normalizeLabel(entry.item?.category, "General")}</span>
          <span>{normalizeLabel(entry.item?.condition, "Condition not listed")}</span>
          <span>{available ? "Available now" : "Needs status check"}</span>
        </div>

        <p className="watch2-description">
          {normalizeLabel(
            entry.item?.description,
            "Saved item. Open the listing to view details, shop location, offer options, and auction activity.",
          )}
        </p>

        <div className="watch2-actions">
          <Link to={itemHref(entry)} className="watch2-primary-small">
            View item
          </Link>

          <Link to={shopHref(entry)} className="watch2-secondary-small">
            View shop
          </Link>

          <Link to={offerHref(entry)} className="watch2-secondary-small">
            Make offer
          </Link>

          <Link to={auctionSearchHref(entry)} className="watch2-secondary-small">
            Check auctions
          </Link>

          <Link to={itemLocatorHref(entry)} className="watch2-secondary-small">
            Find similar
          </Link>

          {id ? (
            <button
              type="button"
              onClick={() => onRemove(entry)}
              disabled={removingId === id}
              className="watch2-remove"
            >
              {removingId === id ? "Removing..." : "Remove"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("NEWEST");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [bulkRemoving, setBulkRemoving] = useState(false);

  async function loadWatchlist(options: { silent?: boolean } = {}) {
    if (options.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const nextEntries = await getMyWatchlist();
      setEntries(nextEntries);
      setSelectedIds((current) => {
        const validIds = new Set(nextEntries.map(itemId).filter(Boolean));
        return current.filter((id) => validIds.has(id));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlist.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadWatchlist();
  }, []);

  async function handleRemove(entry: WatchlistEntry) {
    const id = itemId(entry);
    if (!id) return;

    const confirmed = window.confirm(`Remove "${itemTitle(entry)}" from your watchlist?`);
    if (!confirmed) return;

    try {
      setRemovingId(id);
      setError("");
      setNotice("");

      await removeFromWatchlist(id);

      setEntries((current) => current.filter((row) => itemId(row) !== id));
      setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
      setNotice("Item removed from watchlist.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove item.");
    } finally {
      setRemovingId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return entries
      .filter((entry) => {
        const available = isAvailable(entry.item?.status);

        if (statusFilter === "AVAILABLE" && !available) return false;
        if (statusFilter === "UNAVAILABLE" && available) return false;

        if (!normalizedQuery) return true;

        const haystack = [
          itemTitle(entry),
          shopName(entry),
          entry.item?.category || "",
          entry.item?.condition || "",
          entry.item?.status || "",
          entry.item?.description || "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortKey === "PRICE_HIGH") {
          return toPriceNumber(b.item?.price) - toPriceNumber(a.item?.price);
        }

        if (sortKey === "PRICE_LOW") {
          return toPriceNumber(a.item?.price) - toPriceNumber(b.item?.price);
        }

        if (sortKey === "TITLE") {
          return itemTitle(a).localeCompare(itemTitle(b));
        }

        if (sortKey === "SHOP") {
          return shopName(a).localeCompare(shopName(b));
        }

        return createdAtMs(b) - createdAtMs(a);
      });
  }, [entries, query, sortKey, statusFilter]);

  const visibleIds = useMemo(
    () => filteredEntries.map(itemId).filter(Boolean),
    [filteredEntries],
  );

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const hasActiveWatchlistControls =
    query.trim().length > 0 || statusFilter !== "ALL" || sortKey !== "NEWEST";

  function clearWatchlistControls() {
    setQuery("");
    setStatusFilter("ALL");
    setSortKey("NEWEST");
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const currentSet = new Set(current);

      if (allVisibleSelected) {
        visibleIds.forEach((id) => currentSet.delete(id));
      } else {
        visibleIds.forEach((id) => currentSet.add(id));
      }

      return Array.from(currentSet);
    });
  }

  async function handleBulkRemove() {
    const targets = entries.filter((entry) => selectedIds.includes(itemId(entry)));

    if (!targets.length) return;

    const confirmed = window.confirm(
      `Remove ${targets.length} selected item${targets.length === 1 ? "" : "s"} from your watchlist?`,
    );

    if (!confirmed) return;

    setBulkRemoving(true);
    setError("");
    setNotice("");

    try {
      for (const entry of targets) {
        const id = itemId(entry);
        if (id) {
          await removeFromWatchlist(id);
        }
      }

      const removedIds = new Set(targets.map(itemId));
      setEntries((current) => current.filter((entry) => !removedIds.has(itemId(entry))));
      setSelectedIds([]);
      setNotice(`Removed ${targets.length} selected item${targets.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove selected items.");
    } finally {
      setBulkRemoving(false);
    }
  }

  const stats = useMemo(() => {
    const available = entries.filter((entry) => isAvailable(entry.item?.status)).length;
    const shops = new Set(
      entries
        .map((entry) => entry.item?.shop?.id || entry.item?.pawnShopId || "")
        .filter(Boolean),
    ).size;
    const totalValue = entries.reduce(
      (sum, entry) => sum + toPriceNumber(entry.item?.price),
      0,
    );

    return {
      total: entries.length,
      available,
      unavailable: Math.max(entries.length - available, 0),
      shops,
      totalValue,
    };
  }, [entries]);

  return (
    <main className="watch2-page">
      <section className="watch2-hero">
        <div className="watch2-hero-copy">
          <span className="watch2-pill">Buyer watchlist</span>
          <h1>Track items you care about.</h1>
          <p>
            Keep an eye on saved items, search and filter your watchlist, return to
            listings quickly, open the shop, check auctions, and make offers from one
            buyer command page.
          </p>

          <div className="watch2-hero-actions">
            <Link to="/marketplace">Browse marketplace</Link>
            <Link to="/buyer/item-locator">Find an item</Link>
            <button
              type="button"
              onClick={() => void loadWatchlist({ silent: true })}
              disabled={refreshing || loading}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <aside className="watch2-hero-panel">
          <div>
            <span>Saved</span>
            <strong>{stats.total}</strong>
            <small>watchlist items</small>
          </div>
          <div>
            <span>Available</span>
            <strong>{stats.available}</strong>
            <small>active listings</small>
          </div>
          <div>
            <span>Needs check</span>
            <strong>{stats.unavailable}</strong>
            <small>sold or unavailable</small>
          </div>
          <div>
            <span>Shops</span>
            <strong>{stats.shops}</strong>
            <small>represented</small>
          </div>
          <div>
            <span>Value</span>
            <strong>{formatTrackedValue(stats.totalValue)}</strong>
            <small>tracked price total</small>
          </div>
        </aside>
      </section>

      <section className="watch2-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to="/marketplace">
          Marketplace <span>Browse all inventory</span>
        </Link>
        <Link to="/buyer/item-locator">
          Item locator <span>Find who has an item</span>
        </Link>
        <Link to="/offers">
          My offers <span>Review offer activity</span>
        </Link>
      </section>
        <section className="watch2-control-panel">
          <div className="watch2-control-head">
            <div>
              <span>Controls</span>
              <h2>Search, filter, sort, and bulk manage watchlist</h2>
              <p>
                Use this page to remove old saved items, check item/shop details,
                make offers, find similar inventory, and look for auction activity.
              </p>
            </div>

            <div className="watch2-control-actions">
              <button type="button" onClick={toggleAllVisible} disabled={!visibleIds.length}>
                {allVisibleSelected ? "Unselect visible" : "Select visible"}
              </button>
              <button
                type="button"
                onClick={clearWatchlistControls}
                disabled={!hasActiveWatchlistControls}
              >
                Clear filters
              </button>
              <button type="button" onClick={() => setSelectedIds([])} disabled={!selectedIds.length}>
                Clear selection
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void handleBulkRemove()}
                disabled={!selectedIds.length || bulkRemoving}
              >
                {bulkRemoving ? "Removing..." : `Bulk remove (${selectedIds.length})`}
              </button>
            </div>
          </div>

          <div className="watch2-filter-row">
            <label>
              Search watchlist
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title, shop, category, status..."
              />
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="ALL">All statuses</option>
                <option value="AVAILABLE">Available only</option>
                <option value="UNAVAILABLE">Unavailable / sold</option>
              </select>
            </label>

            <label>
              Sort
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="NEWEST">Newest saved</option>
                <option value="PRICE_HIGH">Price high to low</option>
                <option value="PRICE_LOW">Price low to high</option>
                <option value="TITLE">Title A-Z</option>
                <option value="SHOP">Shop A-Z</option>
              </select>
            </label>
          </div>

          <div className="watch2-control-summary">
            Showing {filteredEntries.length} of {entries.length} saved items · {selectedIds.length} selected
          </div>
        </section>


      {notice ? <section className="watch2-notice">{notice}</section> : null}

      {error ? (
        <section className="watch2-error">
          <h2>Watchlist could not load</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadWatchlist()}>
            Try again
          </button>
        </section>
      ) : null}

      {loading ? (
        <section className="watch2-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="watch2-skeleton" />
          ))}
        </section>
      ) : entries.length === 0 ? (
        <section className="watch2-empty">
          <h2>No saved items yet</h2>
          <p>
            Save items from Marketplace or Item Locator and they will appear here
            for quick tracking, offer handoff, auction discovery, and shop lookup.
          </p>
          <div className="watch2-empty-actions">
            <Link to="/marketplace">Browse marketplace</Link>
            <Link to="/buyer/item-locator">Find an item</Link>
            <Link to="/saved-searches">Create saved search</Link>
          </div>
        </section>
      ) : filteredEntries.length === 0 ? (
        <section className="watch2-empty">
          <h2>No watchlist items matched</h2>
          <p>Adjust your search, status filter, or sort controls to find saved items.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("ALL");
              setSortKey("NEWEST");
            }}
          >
            Clear filters
          </button>
        </section>
      ) : (
        <section className="watch2-grid">
          {filteredEntries.map((entry) => {
            const id = itemId(entry);

            return (
              <WatchlistCard
                key={entry.id}
                entry={entry}
                removingId={removingId}
                selected={id ? selectedIds.includes(id) : false}
                onToggle={toggleSelected}
                onRemove={handleRemove}
              />
            );
          })}
        </section>
      )}
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMyWatchlist,
  removeFromWatchlist,
  type WatchlistEntry,
} from "../services/watchlist";
import "../styles/watchlist-v2.css";

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
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

function isAvailable(status: string | null | undefined) {
  return ["AVAILABLE", "ACTIVE"].includes(String(status || "").toUpperCase());
}

function WatchlistCard({
  entry,
  removingId,
  onRemove,
}: {
  entry: WatchlistEntry;
  removingId: string | null;
  onRemove: (itemId: string) => void;
}) {
  const id = itemId(entry);
  const shop = shopId(entry);
  const image = itemImage(entry);
  const status = normalizeLabel(entry.item?.status, "Unknown");
  const available = isAvailable(status);

  return (
    <article className="watch2-card">
      <Link
        to={id ? `/items/${encodeURIComponent(id)}` : "/marketplace"}
        className="watch2-media"
      >
        {image ? <img src={image} alt={entry.item?.title || "Saved item"} /> : <div>PawnLoop</div>}

        <span className={available ? "watch2-status available" : "watch2-status"}>
          {status}
        </span>
      </Link>

      <div className="watch2-body">
        <div className="watch2-heading">
          <div>
            <Link
              to={id ? `/items/${encodeURIComponent(id)}` : "/marketplace"}
              className="watch2-title"
            >
              {normalizeLabel(entry.item?.title, "Unknown item")}
            </Link>
            <p>{normalizeLabel(entry.item?.shop?.name, "Unknown shop")}</p>
          </div>

          <strong>{formatPrice(entry.item?.price)}</strong>
        </div>

        <div className="watch2-badges">
          <span>{normalizeLabel(entry.item?.category, "General")}</span>
          <span>{normalizeLabel(entry.item?.condition, "Condition not listed")}</span>
        </div>

        <p className="watch2-description">
          {normalizeLabel(
            entry.item?.description,
            "Saved item. Open the listing to view details, shop location, and offer options.",
          )}
        </p>

        <div className="watch2-actions">
          {id ? (
            <Link to={`/items/${encodeURIComponent(id)}`} className="watch2-primary-small">
              View item
            </Link>
          ) : (
            <Link to="/marketplace" className="watch2-primary-small">
              Browse items
            </Link>
          )}

          {shop ? (
            <Link to={`/shops/${encodeURIComponent(shop)}`} className="watch2-secondary-small">
              View shop
            </Link>
          ) : (
            <Link to="/shops" className="watch2-secondary-small">
              Shops
            </Link>
          )}

          <Link to="/offers" className="watch2-secondary-small">
            Offer
          </Link>

          {id ? (
            <button
              type="button"
              onClick={() => onRemove(id)}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadWatchlist() {
    setLoading(true);
    setError(null);

    try {
      const nextEntries = await getMyWatchlist();
      setEntries(nextEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlist.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWatchlist();
  }, []);

  async function handleRemove(nextItemId: string) {
    try {
      setRemovingId(nextItemId);
      await removeFromWatchlist(nextItemId);
      setEntries((current) =>
        current.filter((entry) => itemId(entry) !== nextItemId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove item.");
    } finally {
      setRemovingId(null);
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
            Keep an eye on saved items, return to listings quickly, open the shop,
            and make offers from one clean buyer command page.
          </p>

          <div className="watch2-hero-actions">
            <Link to="/marketplace">Browse marketplace</Link>
            <Link to="/buyer/item-locator">Find an item</Link>
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
            <span>Shops</span>
            <strong>{stats.shops}</strong>
            <small>represented</small>
          </div>
          <div>
            <span>Value</span>
            <strong>{formatPrice(stats.totalValue)}</strong>
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
            for quick tracking.
          </p>
          <Link to="/marketplace">Browse marketplace</Link>
        </section>
      ) : (
        <section className="watch2-grid">
          {entries.map((entry) => (
            <WatchlistCard
              key={entry.id}
              entry={entry}
              removingId={removingId}
              onRemove={handleRemove}
            />
          ))}
        </section>
      )}
    </main>
  );
}

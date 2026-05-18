import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addSavedSearch } from "../services/savedSearches";
import { getMarketplaceItemsPaged, type Item } from "../services/items";
import {
  ITEM_CATEGORY_OPTIONS,
  ITEM_CONDITION_OPTIONS,
} from "../constants/itemOptions";
import "../styles/marketplace-v2.css";

type ViewMode = "grid" | "list" | "map";

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

function itemHref(item: Item) {
  return `/items/${encodeURIComponent(item.id)}`;
}

function itemShopName(item: Item) {
  return normalizeLabel(item.shop?.name, "Pawnshop");
}

function itemImage(item: Item) {
  return Array.isArray(item.images) && item.images.length ? item.images[0] : "";
}

function mapPosition(index: number) {
  const positions = [
    [23, 35],
    [47, 27],
    [69, 42],
    [36, 62],
    [61, 70],
    [78, 61],
    [29, 76],
    [52, 50],
  ];

  return positions[index % positions.length];
}

function StatusBadge({ item }: { item: Item }) {
  const status = normalizeLabel(item.status, "Available");
  const category = normalizeLabel(item.category, "General");

  return (
    <div className="mp2-badges">
      <span>{status}</span>
      <span>{category}</span>
    </div>
  );
}

function ItemCard({ item, compact = false }: { item: Item; compact?: boolean }) {
  const image = itemImage(item);
  const shopName = itemShopName(item);

  return (
    <article className={compact ? "mp2-item-card mp2-item-card-list" : "mp2-item-card"}>
      <Link to={itemHref(item)} className="mp2-item-media" aria-label={`View ${item.title}`}>
        {image ? <img src={image} alt={item.title} /> : <div className="mp2-item-placeholder">PawnLoop</div>}
        <span className="mp2-media-chip">Local inventory</span>
      </Link>

      <div className="mp2-item-body">
        <div className="mp2-item-heading">
          <div>
            <Link to={itemHref(item)} className="mp2-item-title">
              {normalizeLabel(item.title, "Untitled item")}
            </Link>
            <p>{shopName}</p>
          </div>
          <strong>{formatPrice(item.price)}</strong>
        </div>

        <StatusBadge item={item} />

        <p className="mp2-item-description">
          {normalizeLabel(item.description, "Available from a participating pawnshop. Open the item to view full details, pickup options, and shop information.")}
        </p>

        <div className="mp2-item-actions">
          <Link to={itemHref(item)} className="mp2-primary-small">
            View item
          </Link>
          <Link to="/offers" className="mp2-secondary-small">
            Make offer
          </Link>
          <Link to="/watchlist" className="mp2-secondary-small">
            Watch
          </Link>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ clearFilters }: { clearFilters: () => void }) {
  return (
    <section className="mp2-empty">
      <h2>No marketplace items found</h2>
      <p>
        Try clearing filters, expanding your price range, or searching a different
        item category.
      </p>
      <button type="button" onClick={clearFilters}>
        Clear filters
      </button>
    </section>
  );
}

function MarketplaceMap({
  items,
  selectedItemId,
  setSelectedItemId,
}: {
  items: Item[];
  selectedItemId: string | null;
  setSelectedItemId: (id: string) => void;
}) {
  const mapItems = items.slice(0, 8);

  return (
    <section className="mp2-map-shell">
      <div className="mp2-map-stage">
        <div className="mp2-map-user">You</div>

        {mapItems.map((item, index) => {
          const [x, y] = mapPosition(index);
          const selected = selectedItemId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={selected ? "mp2-map-pin selected" : "mp2-map-pin"}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => setSelectedItemId(item.id)}
              title={item.title}
            >
              <strong>{formatPrice(item.price)}</strong>
              <span>{itemShopName(item)}</span>
            </button>
          );
        })}

        <div className="mp2-map-card">
          <strong>Map-ready browsing</strong>
          <span>
            This view is ready for real coordinates once nearby item/shop endpoints
            are added.
          </span>
          <Link to="/shops">Browse shops</Link>
        </div>
      </div>

      <aside className="mp2-map-list">
        <div className="mp2-map-list-heading">
          <h3>Items in this area</h3>
          <span>{mapItems.length} shown</span>
        </div>

        {mapItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={selectedItemId === item.id ? "mp2-map-row active" : "mp2-map-row"}
            onClick={() => setSelectedItemId(item.id)}
          >
            <span>
              <strong>{normalizeLabel(item.title, "Untitled item")}</strong>
              <small>{itemShopName(item)}</small>
            </span>
            <b>{formatPrice(item.price)}</b>
          </button>
        ))}
      </aside>
    </section>
  );
}

export default function MarketplacePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [totalItems, setTotalItems] = useState(0);

  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");

  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [conditionFilter, setConditionFilter] = useState("ALL");
  const [shopFilter, setShopFilter] = useState("ALL");
  const [distanceFilter, setDistanceFilter] = useState("25");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [locationLabel, setLocationLabel] = useState("your area");
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setAppliedQuery(query);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const result = await getMarketplaceItemsPaged({
          query: appliedQuery,
          category: categoryFilter,
          condition: conditionFilter,
          shopId: shopFilter,
          minPrice,
          maxPrice,
          sort,
        });

        if (!cancelled) {
          setItems(result.items);
          setTotalItems(result.total);
          setSelectedItemId((current) => current || result.items[0]?.id || null);
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setTotalItems(0);
          setError(
            err instanceof Error ? err.message : "Failed to load marketplace.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    appliedQuery,
    categoryFilter,
    conditionFilter,
    shopFilter,
    minPrice,
    maxPrice,
    sort,
  ]);

  const shopOptions = useMemo(() => {
    return Array.from(
      new Map(
        items
          .filter((item) => item.pawnShopId || item.shop?.id)
          .map((item) => [
            String(item.pawnShopId || item.shop?.id),
            {
              id: String(item.pawnShopId || item.shop?.id),
              name: itemShopName(item),
            },
          ]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const stats = useMemo(() => {
    const totalValue = items.reduce(
      (sum, item) => sum + toPriceNumber(item.price),
      0,
    );

    const shopCount = new Set(
      items
        .map((item) => String(item.pawnShopId || item.shop?.id || ""))
        .filter(Boolean),
    ).size;

    return {
      total: totalItems,
      matching: items.length,
      shops: shopCount,
      totalValue,
      avgPrice: items.length ? totalValue / items.length : 0,
    };
  }, [items, totalItems]);

  const hasActiveFilters = Boolean(
    query.trim() ||
      categoryFilter !== "ALL" ||
      conditionFilter !== "ALL" ||
      shopFilter !== "ALL" ||
      distanceFilter !== "25" ||
      minPrice.trim() ||
      maxPrice.trim() ||
      sort !== "newest",
  );

  async function handleSaveSearch() {
    const parts = [
      query.trim() ? `Search: ${query.trim()}` : "",
      categoryFilter !== "ALL" ? `Category: ${categoryFilter}` : "",
      conditionFilter !== "ALL" ? `Condition: ${conditionFilter}` : "",
      shopFilter !== "ALL" ? `Shop: ${shopFilter}` : "",
      distanceFilter !== "25" ? `Radius: ${distanceFilter} miles` : "",
      minPrice.trim() ? `Min: ${minPrice.trim()}` : "",
      maxPrice.trim() ? `Max: ${maxPrice.trim()}` : "",
      sort !== "newest" ? `Sort: ${sort}` : "",
    ].filter(Boolean);

    const savedValue = parts.join(" | ");

    if (!savedValue) {
      setSaveMessage("Enter a search or filter before saving it.");
      return;
    }

    try {
      await addSavedSearch(savedValue);
      setSaveMessage("Search saved. You can track it from Saved Searches.");
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Failed to save search.",
      );
    }
  }

  function clearFilters() {
    setQuery("");
    setAppliedQuery("");
    setCategoryFilter("ALL");
    setConditionFilter("ALL");
    setShopFilter("ALL");
    setDistanceFilter("25");
    setMinPrice("");
    setMaxPrice("");
    setSort("newest");
    setSaveMessage(null);
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }

    setLocationMessage("Requesting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLabel(
          `near ${position.coords.latitude.toFixed(2)}, ${position.coords.longitude.toFixed(2)}`,
        );
        setLocationMessage("Location enabled. Real nearby ranking can now be wired to backend geo endpoints.");
      },
      () => {
        setLocationMessage("Location permission was not enabled. You can still browse by filters.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <main className="marketplace-v2">
      <section className="mp2-hero">
        <div className="mp2-hero-copy">
          <span className="mp2-pill">PawnLoop marketplace</span>
          <h1>Browse pawnshop inventory across nearby stores.</h1>
          <p>
            Search items, compare prices, save searches, and switch between
            grid, list, and map-ready views built for local discovery.
          </p>

          <div className="mp2-search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search PS5, gold chain, tools, watches..."
              aria-label="Search marketplace"
            />
            <button type="button" onClick={handleSaveSearch}>
              Save search
            </button>
            <button type="button" className="secondary" onClick={handleUseLocation}>
              Use location
            </button>
          </div>

          {saveMessage || locationMessage ? (
            <div className="mp2-message-row">
              {saveMessage ? <span>{saveMessage}</span> : null}
              {locationMessage ? <span>{locationMessage}</span> : null}
            </div>
          ) : null}
        </div>

        <aside className="mp2-hero-panel">
          <div>
            <span>Showing</span>
            <strong>{stats.matching}</strong>
            <small>items loaded</small>
          </div>
          <div>
            <span>Total</span>
            <strong>{stats.total}</strong>
            <small>matching backend results</small>
          </div>
          <div>
            <span>Shops</span>
            <strong>{stats.shops}</strong>
            <small>represented here</small>
          </div>
          <div>
            <span>Avg price</span>
            <strong>{formatPrice(stats.avgPrice)}</strong>
            <small>{locationLabel}</small>
          </div>
        </aside>
      </section>

      <section className="mp2-toolbar">
        <div className="mp2-filter-heading">
          <div>
            <h2>Find the right item faster</h2>
            <p>
              Backend filters are active for search, category, condition, shop,
              price, and sorting. Radius is ready for the upcoming nearby API.
            </p>
          </div>

          <button type="button" onClick={clearFilters} disabled={!hasActiveFilters}>
            Clear filters
          </button>
        </div>

        <div className="mp2-filter-grid">
          <label>
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="ALL">All categories</option>
              {ITEM_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Condition</span>
            <select
              value={conditionFilter}
              onChange={(event) => setConditionFilter(event.target.value)}
            >
              <option value="ALL">All conditions</option>
              {ITEM_CONDITION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Shop</span>
            <select
              value={shopFilter}
              onChange={(event) => setShopFilter(event.target.value)}
            >
              <option value="ALL">All shops</option>
              {shopOptions.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Radius</span>
            <select
              value={distanceFilter}
              onChange={(event) => setDistanceFilter(event.target.value)}
            >
              <option value="10">Within 10 miles</option>
              <option value="25">Within 25 miles</option>
              <option value="50">Within 50 miles</option>
              <option value="100">Within 100 miles</option>
            </select>
          </label>

          <label>
            <span>Min price</span>
            <input
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              inputMode="numeric"
              placeholder="$0"
            />
          </label>

          <label>
            <span>Max price</span>
            <input
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              inputMode="numeric"
              placeholder="$1,000"
            />
          </label>

          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Newest first</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="popular">Most watched</option>
              <option value="ending-soon">Auctions ending soon</option>
            </select>
          </label>

          <div className="mp2-view-toggle" aria-label="Marketplace view mode">
            {(["grid", "list", "map"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={viewMode === mode ? "active" : ""}
                onClick={() => setViewMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mp2-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to="/buyer/item-locator">
          Item locator <span>Find who has an item</span>
        </Link>
        <Link to="/shops">
          Nearby pawnshops <span>Browse stores</span>
        </Link>
        <Link to="/auctions">
          Live auctions <span>Bid on active listings</span>
        </Link>
        <Link to="/saved-searches">
          Saved searches <span>Track new matches</span>
        </Link>
      </section>

      {error ? (
        <section className="mp2-error">
          <h2>Marketplace could not load</h2>
          <p>{error}</p>
          <button type="button" onClick={clearFilters}>
            Reset filters
          </button>
        </section>
      ) : null}

      {loading ? (
        <section className="mp2-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="mp2-skeleton" />
          ))}
        </section>
      ) : items.length === 0 ? (
        <EmptyState clearFilters={clearFilters} />
      ) : viewMode === "map" ? (
        <MarketplaceMap
          items={items}
          selectedItemId={selectedItemId}
          setSelectedItemId={setSelectedItemId}
        />
      ) : (
        <section className={viewMode === "list" ? "mp2-list" : "mp2-grid"}>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} compact={viewMode === "list"} />
          ))}
        </section>
      )}
    </main>
  );
}

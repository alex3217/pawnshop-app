import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getMarketplaceItemsPaged, type Item } from "../services/items";
import { addToWatchlist } from "../services/watchlist";
import { directionsUrl, distanceMiles, formatMiles, type GeoPoint } from "../utils/geoDistance";
import "../styles/buyer-item-locator.css";

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

function shopHref(item: Item) {
  const shopId = item.shop?.id || item.pawnShopId;
  return shopId ? `/shops/${encodeURIComponent(shopId)}` : "/shops";
}

function shopName(item: Item) {
  return normalizeLabel(item.shop?.name, "Pawnshop");
}

function shopAddress(item: Item) {
  return normalizeLabel(item.shop?.address, "Shop address not listed");
}

function itemShopPoint(item: Item): GeoPoint {
  return {
    latitude: item.shop?.latitude,
    longitude: item.shop?.longitude,
  };
}

function itemDistanceMiles(item: Item, userPoint: GeoPoint | null): number | null {
  if (!userPoint) return null;
  return distanceMiles(userPoint, itemShopPoint(item));
}

function itemDistanceLabel(item: Item, userPoint: GeoPoint | null): string {
  return formatMiles(itemDistanceMiles(item, userPoint));
}

function itemDirectionsUrl(item: Item): string | null {
  return directionsUrl(itemShopPoint(item));
}


function itemImage(item: Item) {
  return Array.isArray(item.images) && item.images.length ? item.images[0] : "";
}

function mapPosition(index: number) {
  const positions = [
    [25, 35],
    [47, 28],
    [68, 41],
    [34, 63],
    [58, 72],
    [78, 61],
    [30, 78],
    [52, 51],
  ];

  return positions[index % positions.length];
}

function LocatorResultCard({
  item,
  userPoint,
  selected,
  onSelect,
  onWatchItem,
  watchingItemId,
}: {
  item: Item;
  userPoint: GeoPoint | null;
  selected: boolean;
  onSelect: () => void;
  onWatchItem: (item: Item) => void;
  watchingItemId: string | null;
}) {
  const image = itemImage(item);

  return (
    <article className={selected ? "locator-result-card selected" : "locator-result-card"}>
      <button type="button" className="locator-result-select" onClick={onSelect}>
        <div className="locator-result-image">
          {image ? <img src={image} alt={item.title} /> : <span>PawnLoop</span>}
          <b>{itemDistanceLabel(item, userPoint)}</b>
        </div>

        <div className="locator-result-body">
          <div className="locator-result-heading">
            <div>
              <h3>{normalizeLabel(item.title, "Untitled item")}</h3>
              <p>{shopName(item)}</p>
            </div>
            <strong>{formatPrice(item.price)}</strong>
          </div>

          <div className="locator-result-meta">
            <span>{normalizeLabel(item.category, "General")}</span>
            <span>{normalizeLabel(item.condition, "Condition not listed")}</span>
            <span>{normalizeLabel(item.status, "Available")}</span>
          </div>

          <p className="locator-shop-address">{shopAddress(item)}</p>
        </div>
      </button>

      <div className="locator-card-actions">
        <Link to={itemHref(item)} className="locator-primary-small">
          View item
        </Link>
        <Link to={shopHref(item)} className="locator-secondary-small">
          View shop
        </Link>
        {itemDirectionsUrl(item) ? (
          <a
            href={itemDirectionsUrl(item) || "#"}
            target="_blank"
            rel="noreferrer"
            className="locator-secondary-small"
          >
            Directions
          </a>
        ) : null}
        <button
          type="button"
          className="locator-secondary-small"
          onClick={() => onWatchItem(item)}
          disabled={watchingItemId === item.id}
        >
          {watchingItemId === item.id ? "Saving..." : "Watch"}
        </button>
      </div>
    </article>
  );
}

function LocatorMap({
  items,
  userPoint,
  selectedItemId,
  setSelectedItemId,
}: {
  items: Item[];
  userPoint: GeoPoint | null;
  selectedItemId: string | null;
  setSelectedItemId: (id: string) => void;
}) {
  const mapItems = items.slice(0, 8);

  return (
    <section className="locator-map-shell">
      <div className="locator-map-stage">
        <div className="locator-map-user">You</div>

        {mapItems.map((item, index) => {
          const [x, y] = mapPosition(index);
          const selected = selectedItemId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={selected ? "locator-map-pin selected" : "locator-map-pin"}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => setSelectedItemId(item.id)}
              title={`${item.title} at ${shopName(item)}`}
            >
              <strong>{formatPrice(item.price)}</strong>
              <span>{shopName(item)} · {itemDistanceLabel(item, userPoint)}</span>
            </button>
          );
        })}

        <div className="locator-map-note">
          <strong>Item location view</strong>
          <span>
            Pins show where matching items are available by shop using saved shop coordinates when available.
          </span>
          <Link to="/marketplace">Open marketplace</Link>
        </div>
      </div>
    </section>
  );
}

export default function BuyerItemLocatorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || searchParams.get("query") || "";
  const initialRadiusParam = searchParams.get("radius") || "25";
  const initialRadius = ["10", "25", "50", "100"].includes(initialRadiusParam)
    ? initialRadiusParam
    : "25";

  const [query, setQuery] = useState(initialQuery);
  const [appliedQuery, setAppliedQuery] = useState(initialQuery);
  const [items, setItems] = useState<Item[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState("your area");
  const [userPoint, setUserPoint] = useState<GeoPoint | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [radius, setRadius] = useState(initialRadius);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [watchingItemId, setWatchingItemId] = useState<string | null>(null);

  const radiusMiles = Number(radius) || 25;

  function locatorHandoffHref(path: string) {
    const params = new URLSearchParams();
    const searchTerm = (appliedQuery || query).trim();

    if (!searchTerm) return path;

    params.set("q", searchTerm);
    params.set("query", searchTerm);
    params.set("radius", radius);

    return `${path}?${params.toString()}`;
  }

  const rankedItems = useMemo(() => {
    let ranked = [...items];

    if (userPoint) {
      ranked = ranked.filter((item) => {
        const distance = itemDistanceMiles(item, userPoint);
        return distance === null || distance <= radiusMiles;
      });

      ranked.sort((a, b) => {
        const aDistance = itemDistanceMiles(a, userPoint);
        const bDistance = itemDistanceMiles(b, userPoint);

        if (aDistance === null && bDistance === null) return 0;
        if (aDistance === null) return 1;
        if (bDistance === null) return -1;

        return aDistance - bDistance;
      });
    }

    return ranked;
  }, [items, radiusMiles, userPoint]);

  const groupedByShop = useMemo(() => {
    const map = new Map<string, {
      name: string;
      address: string;
      count: number;
      shopHref: string;
      distanceLabel: string;
      directionsHref: string | null;
    }>();

    rankedItems.forEach((item) => {
      const key = item.shop?.id || item.pawnShopId || shopName(item);
      const existing = map.get(key);

      if (existing) {
        existing.count += 1;
        return;
      }

      map.set(key, {
        name: shopName(item),
        address: shopAddress(item),
        count: 1,
        shopHref: shopHref(item),
        distanceLabel: itemDistanceLabel(item, userPoint),
        directionsHref: itemDirectionsUrl(item),
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      if (userPoint) {
        const aItem = rankedItems.find((item) => shopHref(item) === a.shopHref) || null;
        const bItem = rankedItems.find((item) => shopHref(item) === b.shopHref) || null;
        const aDistance = aItem ? itemDistanceMiles(aItem, userPoint) : null;
        const bDistance = bItem ? itemDistanceMiles(bItem, userPoint) : null;

        if (aDistance === null && bDistance === null) return b.count - a.count;
        if (aDistance === null) return 1;
        if (bDistance === null) return -1;

        return aDistance - bDistance;
      }

      return b.count - a.count;
    });
  }, [rankedItems, userPoint]);

  useEffect(() => {
    if (!appliedQuery.trim()) {
      setItems([]);
      setTotalItems(0);
      setSelectedItemId(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const result = await getMarketplaceItemsPaged({
          query: appliedQuery,
          sort: "newest",
        });

        if (!cancelled) {
          setItems(result.items);
          setTotalItems(result.total);
          setSelectedItemId(result.items[0]?.id || null);
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setTotalItems(0);
          setSelectedItemId(null);
          setError(err instanceof Error ? err.message : "Failed to locate items.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [appliedQuery]);

  async function handleWatchItem(item: Item) {
    if (!item.id || watchingItemId) return;

    try {
      setWatchingItemId(item.id);
      setError(null);
      setNotice(null);

      await addToWatchlist(item.id);
      setNotice(`Added ${normalizeLabel(item.title, "item")} to your watchlist.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to add item to watchlist.");
    } finally {
      setWatchingItemId(null);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextQuery = query.trim();
    setAppliedQuery(nextQuery);
    setError(null);

    const nextParams = new URLSearchParams();

    if (nextQuery) {
      nextParams.set("q", nextQuery);
      nextParams.set("query", nextQuery);
    }

    nextParams.set("radius", radius);
    setSearchParams(nextParams, { replace: false });
  }

  function handleRadiusChange(nextRadius: string) {
    setRadius(nextRadius);

    const nextQuery = (appliedQuery || query).trim();
    const nextParams = new URLSearchParams();

    if (nextQuery) {
      nextParams.set("q", nextQuery);
      nextParams.set("query", nextQuery);
    }

    nextParams.set("radius", nextRadius);
    setSearchParams(nextParams, { replace: true });
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }

    setLocationMessage("Requesting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPoint({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLabel(
          `near ${position.coords.latitude.toFixed(2)}, ${position.coords.longitude.toFixed(2)}`,
        );
        setLocationMessage("Location enabled. Nearby item discovery can use saved shop coordinates.");
      },
      () => {
        setLocationMessage("Location permission was not enabled. You can still search all marketplace inventory.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <main className="item-locator-page">
      <section className="locator-hero">
        <div className="locator-hero-copy">
          <span className="locator-pill">Item locator</span>
          <h1>Search an item and see which pawnshops have it.</h1>
          <p>
            Enter a keyword like PS5, gold chain, laptop, tools, or watch. PawnLoop
            will show matching items, the shops that have them, and a coordinate-backed location view
            of where those items are located.
          </p>

          <form className="locator-search-row" onSubmit={handleSubmit}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search item keyword..."
              aria-label="Search item keyword"
            />

            <select value={radius} onChange={(event) => handleRadiusChange(event.target.value)}>
              <option value="10">10 miles</option>
              <option value="25">25 miles</option>
              <option value="50">50 miles</option>
              <option value="100">100 miles</option>
            </select>

            <button type="submit" disabled={!query.trim() || loading}>{loading ? "Locating..." : "Locate item"}</button>
            <button type="button" className="secondary" onClick={handleUseLocation}>
              Use location
            </button>
          </form>

          {locationMessage ? <div className="locator-message">{locationMessage}</div> : null}
          {notice ? <div className="locator-message">{notice}</div> : null}
        </div>

        <aside className="locator-hero-panel">
          <div>
            <span>Search</span>
            <strong>{appliedQuery || "—"}</strong>
            <small>keyword</small>
          </div>
          <div>
            <span>Showing</span>
            <strong>{rankedItems.length}</strong>
            <small>{totalItems} total matches</small>
          </div>
          <div>
            <span>Shops</span>
            <strong>{groupedByShop.length}</strong>
            <small>with matching inventory</small>
          </div>
          <div>
            <span>Radius</span>
            <strong>{radius}</strong>
            <small>miles around {locationLabel}</small>
          </div>
        </aside>
      </section>

      <section className="locator-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to={locatorHandoffHref("/marketplace")}>
          Marketplace <span>Browse all inventory</span>
        </Link>
        <Link to="/shops">
          Pawnshops <span>View local shops</span>
        </Link>
        <Link to={locatorHandoffHref("/saved-searches")}>
          Saved searches <span>Track this type of item</span>
        </Link>
      </section>

      {!appliedQuery ? (
        <section className="locator-empty">
          <h2>Search for an item to locate it</h2>
          <p>
            Try searching for “PS5”, “gold chain”, “Milwaukee”, “laptop”, “watch”,
            or anything buyers commonly look for across pawnshops.
          </p>
        </section>
      ) : error ? (
        <section className="locator-error">
          <h2>Item locator could not load</h2>
          <p>{error}</p>
        </section>
      ) : loading ? (
        <section className="locator-loading-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="locator-skeleton" />
          ))}
        </section>
      ) : rankedItems.length === 0 ? (
        <section className="locator-empty">
          <h2>No shops currently show that item</h2>
          <p>
            Try a broader keyword or save this search so you can track when shops add matching inventory.
          </p>
          <Link to={locatorHandoffHref("/saved-searches")}>Go to saved searches</Link>
        </section>
      ) : (
        <section className="locator-results-layout">
          <div className="locator-results-main">
            <div className="locator-section-title">
              <div>
                <span>Results</span>
                <h2>Matching items for “{appliedQuery}”</h2>
              </div>
              <Link to={`/marketplace?search=${encodeURIComponent(appliedQuery)}`}>
                Open in marketplace
              </Link>
            </div>

            <div className="locator-result-list">
              {rankedItems.map((item) => (
                <LocatorResultCard
                  key={item.id}
                  item={item}
                  userPoint={userPoint}
                  selected={selectedItemId === item.id}
                  onSelect={() => setSelectedItemId(item.id)}
                  onWatchItem={handleWatchItem}
                  watchingItemId={watchingItemId}
                />
              ))}
            </div>
          </div>

          <aside className="locator-side-panel">
            <LocatorMap
              items={rankedItems}
              userPoint={userPoint}
              selectedItemId={selectedItemId}
              setSelectedItemId={setSelectedItemId}
            />

            <div className="locator-shop-panel">
              <div className="locator-section-title compact">
                <div>
                  <span>Shops</span>
                  <h2>Who has it</h2>
                </div>
              </div>

              <div className="locator-shop-list">
                {groupedByShop.map((shop) => (
                  <Link key={shop.name + shop.address} to={shop.shopHref}>
                    <strong>{shop.name}</strong>
                    <span>
                      {shop.count} matching item{shop.count === 1 ? "" : "s"} · {shop.distanceLabel}
                    </span>
                    <small>{shop.address}</small>
                    {shop.directionsHref ? (
                      <small>Directions available</small>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

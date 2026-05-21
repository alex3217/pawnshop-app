import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMarketplaceShops, type Shop } from "../services/shops";
import "../styles/shops-v2.css";

type ViewMode = "grid" | "list" | "map";

const SHOPS_PAGE_SIZE = 36;

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function displayValue(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function hasValue(value: string | null | undefined) {
  return String(value || "").trim().length > 0;
}

function fakeDistance(index: number) {
  return `${(2.1 + index * 1.15).toFixed(1)} mi`;
}

function mapPosition(index: number) {
  const positions = [
    [25, 36],
    [52, 28],
    [70, 52],
    [36, 65],
    [60, 74],
    [78, 68],
    [31, 78],
    [48, 50],
  ];

  return positions[index % positions.length];
}

function ShopCard({
  shop,
  index,
  compact = false,
}: {
  shop: Shop;
  index: number;
  compact?: boolean;
}) {
  return (
    <article className={compact ? "shops2-card shops2-card-list" : "shops2-card"}>
      <div className="shops2-card-map">
        <span>{fakeDistance(index)}</span>
        <strong>{displayValue(shop.name, "Pawnshop").slice(0, 2).toUpperCase()}</strong>
      </div>

      <div className="shops2-card-body">
        <div className="shops2-card-heading">
          <div>
            <Link to={`/shops/${shop.id}`} className="shops2-shop-name">
              {displayValue(shop.name, "Unnamed pawnshop")}
            </Link>
            <p>{displayValue(shop.address, "Address not listed")}</p>
          </div>

          <span className="shops2-open-chip">
            {hasValue(shop.hours) ? "Hours listed" : "Call shop"}
          </span>
        </div>

        <p className="shops2-description">
          {displayValue(
            shop.description,
            "Browse this pawnshop storefront to view inventory, available items, and pickup details.",
          )}
        </p>

        <div className="shops2-meta-row">
          <span>{displayValue(shop.phone, "No phone listed")}</span>
          <span>{displayValue(shop.hours, "Hours not listed")}</span>
        </div>

        <div className="shops2-actions">
          <Link to={`/shops/${shop.id}`} className="shops2-primary-small">
            View storefront
          </Link>
          <Link to="/marketplace" className="shops2-secondary-small">
            Browse inventory
          </Link>
          <button type="button" className="shops2-secondary-small">
            Follow
          </button>
        </div>
      </div>
    </article>
  );
}

function ShopsMap({
  shops,
  selectedShopId,
  setSelectedShopId,
}: {
  shops: Shop[];
  selectedShopId: string | null;
  setSelectedShopId: (id: string) => void;
}) {
  const mapShops = shops.slice(0, 8);

  return (
    <section className="shops2-map-shell">
      <div className="shops2-map-stage">
        <div className="shops2-map-user">You</div>

        {mapShops.map((shop, index) => {
          const [x, y] = mapPosition(index);
          const selected = selectedShopId === shop.id;

          return (
            <button
              key={shop.id}
              type="button"
              className={selected ? "shops2-map-pin selected" : "shops2-map-pin"}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => setSelectedShopId(shop.id)}
              title={shop.name}
            >
              <strong>{displayValue(shop.name, "Shop").slice(0, 2).toUpperCase()}</strong>
              <span>{fakeDistance(index)}</span>
            </button>
          );
        })}

        <div className="shops2-map-card">
          <strong>Map-ready shop discovery</strong>
          <span>
            Real coordinates can replace this panel once shop geo fields and nearby endpoints are added.
          </span>
          <Link to="/marketplace">Browse inventory</Link>
        </div>
      </div>

      <aside className="shops2-map-list">
        <div className="shops2-map-list-heading">
          <h3>Pawnshops in this area</h3>
          <span>{mapShops.length} shown</span>
        </div>

        {mapShops.map((shop, index) => (
          <button
            key={shop.id}
            type="button"
            className={selectedShopId === shop.id ? "shops2-map-row active" : "shops2-map-row"}
            onClick={() => setSelectedShopId(shop.id)}
          >
            <span>
              <strong>{displayValue(shop.name, "Unnamed pawnshop")}</strong>
              <small>{displayValue(shop.address, "Address not listed")}</small>
            </span>
            <b>{fakeDistance(index)}</b>
          </button>
        ))}
      </aside>
    </section>
  );
}

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [visibleCount, setVisibleCount] = useState(SHOPS_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireHours, setRequireHours] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState("your area");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextShops = await getMarketplaceShops();

        if (!cancelled) {
          setShops(nextShops);
          setSelectedShopId(nextShops[0]?.id || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load shops.");
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
  }, []);

  const filteredShops = useMemo(() => {
    const q = normalizeText(query);
    const locationQ = normalizeText(locationQuery);

    return shops.filter((shop) => {
      const searchable = [
        shop.name,
        shop.address || "",
        shop.phone || "",
        shop.description || "",
        shop.hours || "",
      ]
        .join(" ")
        .toLowerCase();

      const locationHaystack = [shop.address || "", shop.name]
        .join(" ")
        .toLowerCase();

      if (q && !searchable.includes(q)) return false;
      if (locationQ && !locationHaystack.includes(locationQ)) return false;
      if (requirePhone && !hasValue(shop.phone)) return false;
      if (requireHours && !hasValue(shop.hours)) return false;

      return true;
    });
  }, [shops, query, locationQuery, requirePhone, requireHours]);

  const stats = useMemo(() => {
    const withPhone = filteredShops.filter((shop) => hasValue(shop.phone)).length;
    const withHours = filteredShops.filter((shop) => hasValue(shop.hours)).length;

    return {
      total: shops.length,
      filtered: filteredShops.length,
      withPhone,
      withHours,
    };
  }, [shops, filteredShops]);

  const visibleShops = useMemo(
    () => filteredShops.slice(0, visibleCount),
    [filteredShops, visibleCount],
  );

  const hiddenShopCount = Math.max(filteredShops.length - visibleShops.length, 0);

  const hasActiveFilters = Boolean(
    query.trim() || locationQuery.trim() || requirePhone || requireHours,
  );

  function clearFilters() {
    setQuery("");
    setLocationQuery("");
    setRequirePhone(false);
    setRequireHours(false);
    setLocationMessage(null);
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
        setLocationMessage(
          "Location enabled. Real nearby shop ranking can be wired to backend geo endpoints next.",
        );
      },
      () => {
        setLocationMessage(
          "Location permission was not enabled. You can still search by city, area, or address.",
        );
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <main className="shops2-page">
      <section className="shops2-hero">
        <div className="shops2-hero-copy">
          <span className="shops2-pill">Pawnshop discovery</span>
          <h1>Find pawnshops and inventory near you.</h1>
          <p>
            Browse local storefronts, follow shops, view contact details, and open
            each shop’s live inventory from one buyer-friendly place.
          </p>

          <div className="shops2-search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shops by name, phone, or description..."
            />
            <input
              value={locationQuery}
              onChange={(event) => setLocationQuery(event.target.value)}
              placeholder="City, area, or address..."
            />
            <button type="button" onClick={handleUseLocation}>
              Use location
            </button>
          </div>

          {locationMessage ? <div className="shops2-message">{locationMessage}</div> : null}
        </div>

        <aside className="shops2-hero-panel">
          <div>
            <span>Showing</span>
            <strong>{stats.filtered}</strong>
            <small>matching shops</small>
          </div>
          <div>
            <span>Total</span>
            <strong>{stats.total}</strong>
            <small>marketplace shops</small>
          </div>
          <div>
            <span>Contact</span>
            <strong>{stats.withPhone}</strong>
            <small>with phone listed</small>
          </div>
          <div>
            <span>Hours</span>
            <strong>{stats.withHours}</strong>
            <small>{locationLabel}</small>
          </div>
        </aside>
      </section>

      <section className="shops2-toolbar">
        <div className="shops2-filter-heading">
          <div>
            <h2>Browse storefronts</h2>
            <p>
              Filter by shop info, location text, contact availability, or switch to
              map-ready discovery.
            </p>
          </div>

          <button type="button" onClick={clearFilters} disabled={!hasActiveFilters}>
            Clear filters
          </button>
        </div>

        <div className="shops2-filter-grid">
          <label className="shops2-checkbox">
            <input
              type="checkbox"
              checked={requirePhone}
              onChange={(event) => setRequirePhone(event.target.checked)}
            />
            <span>Only shops with phone listed</span>
          </label>

          <label className="shops2-checkbox">
            <input
              type="checkbox"
              checked={requireHours}
              onChange={(event) => setRequireHours(event.target.checked)}
            />
            <span>Only shops with hours listed</span>
          </label>

          <div className="shops2-view-toggle" aria-label="Shop view mode">
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

      <section className="shops2-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to="/marketplace">
          Marketplace <span>Browse all inventory</span>
        </Link>
        <Link to="/auctions">
          Auctions <span>Find active bids</span>
        </Link>
        <Link to="/saved-searches">
          Saved searches <span>Track new matches</span>
        </Link>
      </section>

      {error ? (
        <section className="shops2-error">
          <h2>Shops could not load</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {loading ? (
        <section className="shops2-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="shops2-skeleton" />
          ))}
        </section>
      ) : filteredShops.length === 0 ? (
        <section className="shops2-empty">
          <h2>No shops matched your filters</h2>
          <p>Try clearing filters or searching a different city, area, or shop name.</p>
          <button type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </section>
      ) : viewMode === "map" ? (
        <ShopsMap
          shops={filteredShops}
          selectedShopId={selectedShopId}
          setSelectedShopId={setSelectedShopId}
        />
      ) : (
        <section className={viewMode === "list" ? "shops2-list" : "shops2-grid"}>
          {visibleShops.map((shop, index) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              index={index}
              compact={viewMode === "list"}
            />
          ))}
        </section>
      )}
      {hiddenShopCount > 0 ? (
        <section className="shops2-pagination-panel">
          <div>
            <strong>
              Showing {visibleShops.length} of {filteredShops.length} shops
            </strong>
            <p>
              More shop storefronts are available. Load more when you want to
              continue browsing local inventory sources.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(current + SHOPS_PAGE_SIZE, filteredShops.length),
              )
            }
          >
            Show more shops ({hiddenShopCount})
          </button>
        </section>
      ) : null}

    </main>
  );
}

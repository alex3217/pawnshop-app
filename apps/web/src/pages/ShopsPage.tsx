import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";
import { getMarketplaceShops, type Shop } from "../services/shops";
import {
  directionsUrl,
  distanceMiles,
  formatMiles,
  hasCoordinates,
  type GeoPoint,
} from "../utils/geoDistance";
import "../styles/shops-v2.css";

// PawnLoop shop action controls v1
// PawnLoop shops followed-filter polish v1
// PawnLoop complete shop filters v1

type ViewMode = "grid" | "list" | "map";
type ShopSortMode =
  | "recommended"
  | "name"
  | "nearest";

type DistanceRadius =
  | "all"
  | "5"
  | "10"
  | "25"
  | "50"
  | "100";

const FOLLOWED_SHOPS_STORAGE_KEY =
  "pawnloop.followedShopIds.v1";

function shopPhoneHref(
  phone: string | null | undefined,
): string | null {
  const value = String(phone || "").trim();

  if (!value) return null;

  const normalized =
    value.replace(/[^\d+]/g, "");

  return normalized
    ? `tel:${normalized}`
    : null;
}

function readFollowedShopIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        FOLLOWED_SHOPS_STORAGE_KEY,
      );

    if (!raw) return [];

    const parsed: unknown =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string =>
            typeof value === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeFollowedShopIds(
  shopIds: string[],
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      FOLLOWED_SHOPS_STORAGE_KEY,
      JSON.stringify(shopIds),
    );
  } catch {
    // Browsing can continue when storage is unavailable.
  }
}

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

function shopPoint(shop: Shop): GeoPoint {
  return {
    latitude: shop.latitude,
    longitude: shop.longitude,
  };
}

function shopDistanceMiles(shop: Shop, userPoint: GeoPoint | null): number | null {
  if (!userPoint) return null;
  return distanceMiles(userPoint, shopPoint(shop));
}

function distanceLabel(shop: Shop, userPoint: GeoPoint | null): string {
  return formatMiles(shopDistanceMiles(shop, userPoint));
}

function shopDirectionsUrl(shop: Shop): string | null {
  return directionsUrl(shopPoint(shop));
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
  userPoint,
  compact = false,
  isFollowed,
  onToggleFollow,
}: {
  shop: Shop;
  userPoint: GeoPoint | null;
  compact?: boolean;
  isFollowed: boolean;
  onToggleFollow: (shop: Shop) => void;
}) {
  const callHref =
    shopPhoneHref(shop.phone);

  return (
    <article className={compact ? "shops2-card shops2-card-list" : "shops2-card"}>
      <div className="shops2-card-map">
        <span>{distanceLabel(shop, userPoint)}</span>
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
            {hasValue(shop.hours)
              ? "Hours listed"
              : hasValue(shop.phone)
                ? "Phone available"
                : "Contact unavailable"}
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
          <Link
            to={`/shops/${shop.id}`}
            className="shops2-primary-small"
          >
            View storefront
          </Link>

          {callHref ? (
            <a
              href={callHref}
              className="shops2-secondary-small"
              aria-label={`Call ${shop.name}`}
            >
              Call shop
            </a>
          ) : null}

          {shopDirectionsUrl(shop) ? (
            <a
              href={shopDirectionsUrl(shop) || "#"}
              target="_blank"
              rel="noreferrer"
              className="shops2-secondary-small"
              aria-label={`Get directions to ${shop.name}`}
            >
              Directions
            </a>
          ) : null}

          <Link
            to={`/shops/${shop.id}#inventory`}
            className="shops2-secondary-small"
          >
            Browse inventory
          </Link>

          <button
            type="button"
            className={
              isFollowed
                ? "shops2-secondary-small shops2-follow-button active"
                : "shops2-secondary-small shops2-follow-button"
            }
            aria-pressed={isFollowed}
            onClick={() =>
              onToggleFollow(shop)
            }
          >
            {isFollowed
              ? "Following"
              : "Follow"}
          </button>
        </div>
      </div>
    </article>
  );
}

// PawnLoop map shop navigation v1
function ShopsMap({
  shops,
  userPoint,
  selectedShopId,
  setSelectedShopId,
}: {
  shops: Shop[];
  userPoint: GeoPoint | null;
  selectedShopId: string | null;
  setSelectedShopId: (id: string) => void;
}) {
  const navigate = useNavigate();

  const mapShops =
    shops.slice(0, 8);

  function openShop(
    shop: Shop,
  ) {
    setSelectedShopId(
      shop.id,
    );

    navigate(
      `/shops/${encodeURIComponent(
        shop.id,
      )}`,
    );
  }

  return (
    <section className="shops2-map-shell">
      <div className="shops2-map-stage">
        {/* PawnLoop map location accuracy v1 */}
        {userPoint ? (
          <div
            className="shops2-map-user"
            title="Your approximate location"
          >
            You
          </div>
        ) : (
          <div
            className="shops2-map-location-hint"
            role="status"
          >
            Enable location to calculate distances
          </div>
        )}

        {mapShops.map((shop, index) => {
          const [x, y] = mapPosition(index);
          const selected = selectedShopId === shop.id;

          return (
            <button
              key={shop.id}
              type="button"
              className={selected ? "shops2-map-pin selected" : "shops2-map-pin"}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() =>
                openShop(shop)
              }
              aria-label={`Open ${shop.name} storefront`}
              title={`Open ${shop.name} storefront`}
            >
              <strong>{displayValue(shop.name, "Shop").slice(0, 2).toUpperCase()}</strong>
              <span>{distanceLabel(shop, userPoint)}</span>
            </button>
          );
        })}

        <div className="shops2-map-card">
          <strong>Map-ready shop discovery</strong>
          <span>
            Saved shop coordinates power this location view when available.
          </span>
          <Link to="/marketplace">Browse inventory</Link>
        </div>
      </div>

      <aside className="shops2-map-list">
        <div className="shops2-map-list-heading">
          <h3>Pawnshops in this area</h3>
          <span>{mapShops.length} shown</span>
        </div>

        {mapShops.map((shop) => (
          <button
            key={shop.id}
            type="button"
            className={selectedShopId === shop.id ? "shops2-map-row active" : "shops2-map-row"}
            onClick={() =>
              openShop(shop)
            }
            aria-label={`Open ${shop.name} storefront`}
            title={`Open ${shop.name} storefront`}
          >
            <span>
              <strong>{displayValue(shop.name, "Unnamed pawnshop")}</strong>
              <small>{displayValue(shop.address, "Address not listed")}</small>
            </span>
            <b>{distanceLabel(shop, userPoint)}</b>
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
  const [requireFollowed, setRequireFollowed] = useState(false);
  const [requireCoordinates, setRequireCoordinates] = useState(false);

  const [stateFilter, setStateFilter] =
    useState("all");

  const [cityFilter, setCityFilter] =
    useState("all");

  const [distanceRadius, setDistanceRadius] =
    useState<DistanceRadius>("all");

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMode, setSortMode] =
    useState<ShopSortMode>("recommended");
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [followedShopIds, setFollowedShopIds] =
    useState<string[]>(readFollowedShopIds);
  const [actionMessage, setActionMessage] =
    useState<string | null>(null);
  const [reloadToken, setReloadToken] =
    useState(0);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState("your area");
  const [userPoint, setUserPoint] = useState<GeoPoint | null>(null);
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
  }, [reloadToken]);

  const stateOptions = useMemo(
    () =>
      Array.from(
        new Set(
          shops
            .map((shop) =>
              String(
                shop.state || "",
              ).trim(),
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [shops],
  );

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          shops
            .filter(
              (shop) =>
                stateFilter === "all" ||
                String(
                  shop.state || "",
                ).trim() === stateFilter,
            )
            .map((shop) =>
              String(
                shop.city || "",
              ).trim(),
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [shops, stateFilter],
  );

  useEffect(() => {
    setVisibleCount(SHOPS_PAGE_SIZE);
  }, [
    query,
    locationQuery,
    requirePhone,
    requireHours,
    requireFollowed,
    requireCoordinates,
    stateFilter,
    cityFilter,
    distanceRadius,
    sortMode,
  ]);

  const filteredShops = useMemo(() => {
    const q = normalizeText(query);
    const locationQ = normalizeText(locationQuery);

    return shops.filter((shop) => {
      const searchable = [
        shop.name,
        shop.address || "",
        shop.city || "",
        shop.state || "",
        shop.zip || "",
        shop.phone || "",
        shop.description || "",
        shop.hours || "",
      ]
        .join(" ")
        .toLowerCase();

      const shopState =
        String(
          shop.state || "",
        ).trim();

      const shopCity =
        String(
          shop.city || "",
        ).trim();

      const locationHaystack = [
        shop.address || "",
        shop.city || "",
        shop.state || "",
        shop.zip || "",
        shop.name,
      ]
        .join(" ")
        .toLowerCase();

      if (q && !searchable.includes(q)) return false;
      if (locationQ && !locationHaystack.includes(locationQ)) return false;
      if (
        stateFilter !== "all" &&
        shopState !== stateFilter
      ) {
        return false;
      }

      if (
        cityFilter !== "all" &&
        shopCity !== cityFilter
      ) {
        return false;
      }

      if (
        requirePhone &&
        !hasValue(shop.phone)
      ) {
        return false;
      }

      if (
        requireHours &&
        !hasValue(shop.hours)
      ) {
        return false;
      }

      if (
        requireFollowed &&
        !followedShopIds.includes(shop.id)
      ) {
        return false;
      }

      if (
        requireCoordinates &&
        !hasCoordinates(shopPoint(shop))
      ) {
        return false;
      }

      if (
        distanceRadius !== "all"
      ) {
        const distance =
          userPoint
            ? shopDistanceMiles(
                shop,
                userPoint,
              )
            : null;

        if (
          distance === null ||
          distance >
            Number(distanceRadius)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    shops,
    query,
    locationQuery,
    requirePhone,
    requireHours,
    requireFollowed,
    requireCoordinates,
    followedShopIds,
    stateFilter,
    cityFilter,
    distanceRadius,
    userPoint,
  ]);

  const stats = useMemo(() => {
    const withPhone = filteredShops.filter((shop) => hasValue(shop.phone)).length;
    const withHours = filteredShops.filter((shop) => hasValue(shop.hours)).length;

    const followed = shops.filter(
      (shop) =>
        followedShopIds.includes(shop.id),
    ).length;

    const mapReady = shops.filter(
      (shop) =>
        hasCoordinates(
          shopPoint(shop),
        ),
    ).length;

    return {
      total: shops.length,
      filtered: filteredShops.length,
      withPhone,
      withHours,
      followed,
      mapReady,
    };
  }, [
    shops,
    filteredShops,
    followedShopIds,
  ]);

  const visibleShops = useMemo(() => {
    const ranked = [...filteredShops];

    if (sortMode === "name") {
      ranked.sort((a, b) =>
        displayValue(
          a.name,
          "Unnamed pawnshop",
        ).localeCompare(
          displayValue(
            b.name,
            "Unnamed pawnshop",
          ),
        ),
      );
    } else if (
      userPoint &&
      (
        sortMode === "nearest" ||
        sortMode === "recommended"
      )
    ) {
      ranked.sort((a, b) => {
        const aDistance =
          shopDistanceMiles(
            a,
            userPoint,
          );

        const bDistance =
          shopDistanceMiles(
            b,
            userPoint,
          );

        if (
          aDistance === null &&
          bDistance === null
        ) {
          return 0;
        }

        if (aDistance === null) return 1;
        if (bDistance === null) return -1;

        return aDistance - bDistance;
      });
    }

    return ranked.slice(
      0,
      visibleCount,
    );
  }, [
    filteredShops,
    visibleCount,
    userPoint,
    sortMode,
  ]);

  const hiddenShopCount = Math.max(filteredShops.length - visibleShops.length, 0);

  const hasActiveFilters = Boolean(
    query.trim() ||
      locationQuery.trim() ||
      requirePhone ||
      requireHours ||
      requireFollowed ||
      requireCoordinates ||
      stateFilter !== "all" ||
      cityFilter !== "all" ||
      distanceRadius !== "all" ||
      sortMode !== "recommended",
  );

  function clearFilters() {
    setQuery("");
    setLocationQuery("");
    setRequirePhone(false);
    setRequireHours(false);
    setRequireFollowed(false);
    setRequireCoordinates(false);
    setStateFilter("all");
    setCityFilter("all");
    setDistanceRadius("all");
    setSortMode("recommended");
    setLocationMessage(null);
    setUserPoint(null);
    setVisibleCount(SHOPS_PAGE_SIZE);
  }

  function toggleFollow(shop: Shop) {
    setFollowedShopIds(
      (current) => {
        const isCurrentlyFollowed =
          current.includes(shop.id);

        const next =
          isCurrentlyFollowed
            ? current.filter(
                (id) =>
                  id !== shop.id,
              )
            : [
                ...current,
                shop.id,
              ];

        writeFollowedShopIds(next);

        setActionMessage(
          isCurrentlyFollowed
            ? `${shop.name} was removed from followed shops.`
            : `${shop.name} is now followed on this browser.`,
        );

        return next;
      },
    );
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
        setLocationMessage(
          "Location enabled. Nearby shop discovery can use saved shop coordinates.",
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
              type="search"
              aria-label="Search shops"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search shops by name, phone, or description..."
            />
            <input
              type="search"
              aria-label="Search by city, area, or address"
              value={locationQuery}
              onChange={(event) =>
                setLocationQuery(
                  event.target.value,
                )
              }
              placeholder="City, area, or address..."
            />
            <button
              type="button"
              aria-label="Use my current location"
              onClick={handleUseLocation}
            >
              Use location
            </button>
          </div>

          {locationMessage ? (
            <div
              className="shops2-message"
              role="status"
            >
              {locationMessage}
            </div>
          ) : null}

          {actionMessage ? (
            <div
              className="shops2-message"
              role="status"
            >
              {actionMessage}
            </div>
          ) : null}
        </div>

        <aside className="shops2-hero-panel">
          <div>
            <span>Showing</span>
            <strong>{stats.filtered}</strong>
            <small>
              {userPoint
                ? locationLabel
                : "matching shops"}
            </small>
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
            <small>with hours listed</small>
          </div>
        </aside>
      </section>

      <section className="shops2-toolbar">
        <div className="shops2-filter-heading">
          <div>
            <h2>Browse storefronts</h2>
            <p>
              Filter by shop info, location text, contact availability, or switch to
              coordinate-backed discovery.
            </p>
          </div>

          <button
            type="button"
            className="shops2-clear-filters"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
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
              onChange={(event) =>
                setRequireHours(
                  event.target.checked,
                )
              }
            />
            <span>Only shops with hours listed</span>
          </label>

          <label className="shops2-checkbox">
            <input
              type="checkbox"
              checked={requireFollowed}
              onChange={(event) =>
                setRequireFollowed(
                  event.target.checked,
                )
              }
            />
            <span>Only followed shops</span>
          </label>

          <label className="shops2-sort-field">
            <span>State</span>

            <select
              value={stateFilter}
              aria-label="Filter shops by state"
              onChange={(event) => {
                setStateFilter(
                  event.target.value,
                );
                setCityFilter("all");
              }}
            >
              <option value="all">
                All states
              </option>

              {stateOptions.map(
                (state) => (
                  <option
                    key={state}
                    value={state}
                  >
                    {state}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="shops2-sort-field">
            <span>City</span>

            <select
              value={cityFilter}
              aria-label="Filter shops by city"
              onChange={(event) =>
                setCityFilter(
                  event.target.value,
                )
              }
            >
              <option value="all">
                All cities
              </option>

              {cityOptions.map(
                (city) => (
                  <option
                    key={city}
                    value={city}
                  >
                    {city}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="shops2-checkbox">
            <input
              type="checkbox"
              checked={requireCoordinates}
              onChange={(event) =>
                setRequireCoordinates(
                  event.target.checked,
                )
              }
            />
            <span>
              Only shops with map location
            </span>
          </label>

          <label className="shops2-sort-field">
            <span>Distance</span>

            <select
              value={distanceRadius}
              aria-label="Filter shops by distance"
              disabled={!userPoint}
              onChange={(event) =>
                setDistanceRadius(
                  event.target
                    .value as DistanceRadius,
                )
              }
            >
              <option value="all">
                {userPoint
                  ? "Any distance"
                  : "Enable location first"}
              </option>
              <option value="5">
                Within 5 miles
              </option>
              <option value="10">
                Within 10 miles
              </option>
              <option value="25">
                Within 25 miles
              </option>
              <option value="50">
                Within 50 miles
              </option>
              <option value="100">
                Within 100 miles
              </option>
            </select>
          </label>

          <label className="shops2-sort-field">
            <span>Sort shops</span>

            <select
              value={sortMode}
              onChange={(event) =>
                setSortMode(
                  event.target
                    .value as ShopSortMode,
                )
              }
            >
              <option value="recommended">
                Recommended
              </option>

              <option value="name">
                Name A–Z
              </option>

              <option
                value="nearest"
                disabled={!userPoint}
              >
                {userPoint
                  ? "Nearest first"
                  : "Nearest — enable location"}
              </option>
            </select>
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

        <p
          className="shops2-follow-summary"
          role="status"
          aria-live="polite"
        >
          Showing {stats.filtered} of{" "}
          {stats.total} shops.{" "}
          {stats.mapReady}{" "}
          {stats.mapReady === 1
            ? "shop has"
            : "shops have"}{" "}
          map coordinates. Following{" "}
          {stats.followed}{" "}
          {stats.followed === 1
            ? "saved shop"
            : "saved shops"}{" "}
          on this browser.
        </p>
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

          <button
            type="button"
            onClick={() =>
              setReloadToken(
                (current) =>
                  current + 1,
              )
            }
          >
            Retry loading shops
          </button>
        </section>
      ) : null}

      {loading ? (
        <section className="shops2-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="shops2-skeleton" />
          ))}
        </section>
      ) : error ? null : filteredShops.length === 0 ? (
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
          userPoint={userPoint}
          selectedShopId={selectedShopId}
          setSelectedShopId={setSelectedShopId}
        />
      ) : (
        <section className={viewMode === "list" ? "shops2-list" : "shops2-grid"}>
          {visibleShops.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              userPoint={userPoint}
              compact={viewMode === "list"}
              isFollowed={followedShopIds.includes(
                shop.id,
              )}
              onToggleFollow={toggleFollow}
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

// File: apps/web/src/pages/AuctionsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getAuctions,
  type Auction,
} from "../services/auctions";
import { getAuthRole } from "../services/auth";
import "../styles/auctions-readable-fix.css";

type AuctionStatusFilter =
  | "SCHEDULED"
  | "LIVE"
  | "ENDED"
  | "CANCELED"
  | "ALL";

type AuctionSortKey =
  | "ENDING_SOON"
  | "NEWEST"
  | "PRICE_HIGH"
  | "PRICE_LOW"
  | "STATUS";

type RoleAction = {
  to: string;
  label: string;
  primary?: boolean;
};

const FILTERS: AuctionStatusFilter[] = [
  "LIVE",
  "SCHEDULED",
  "ENDED",
  "CANCELED",
  "ALL",
];

const POLL_MS = 30_000;
const ENDING_SOON_MS = 24 * 60 * 60 * 1000;

function normalize(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeUpper(value: unknown, fallback = "") {
  return normalize(value, fallback).toUpperCase();
}

function formatMoney(
  value: string | number | null | undefined,
) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDateTime(value?: string | null) {
  if (!value) return "Unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return date.toLocaleString();
}

function auctionEndTime(auction: Auction) {
  const value = auction.extendedEndsAt || auction.endsAt;
  const time = value ? new Date(value).getTime() : 0;

  return Number.isFinite(time) ? time : 0;
}

function auctionCurrentPrice(auction: Auction) {
  const amount = Number(
    auction.currentPrice ?? auction.startingPrice ?? 0,
  );

  return Number.isFinite(amount) ? amount : 0;
}

function auctionShopKey(auction: Auction) {
  return normalize(
    auction.shop?.id || auction.shopId,
  );
}

function auctionCategory(auction: Auction) {
  return normalize(auction.item?.category, "Uncategorized");
}

function auctionSearchText(auction: Auction) {
  return [
    auction.id,
    auction.status,
    auction.itemId,
    auction.shopId,
    auction.item?.title,
    auction.item?.description,
    auction.item?.category,
    auction.item?.condition,
    auction.shop?.name,
    auction.shop?.address,
    auction.shop?.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortAuctionRows(
  rows: Auction[],
  sortKey: AuctionSortKey,
) {
  return [...rows].sort((left, right) => {
    if (sortKey === "NEWEST") {
      const rightTime = new Date(
        right.createdAt || right.startsAt || 0,
      ).getTime();

      const leftTime = new Date(
        left.createdAt || left.startsAt || 0,
      ).getTime();

      return rightTime - leftTime;
    }

    if (sortKey === "PRICE_HIGH") {
      return (
        auctionCurrentPrice(right) -
        auctionCurrentPrice(left)
      );
    }

    if (sortKey === "PRICE_LOW") {
      return (
        auctionCurrentPrice(left) -
        auctionCurrentPrice(right)
      );
    }

    if (sortKey === "STATUS") {
      return normalizeUpper(left.status).localeCompare(
        normalizeUpper(right.status),
      );
    }

    return auctionEndTime(left) - auctionEndTime(right);
  });
}

function isAuctionStatusFilter(
  value: string | null,
): value is AuctionStatusFilter {
  return FILTERS.includes(value as AuctionStatusFilter);
}

function statusLabel(status: AuctionStatusFilter) {
  if (status === "SCHEDULED") return "Upcoming";
  if (status === "ALL") return "All";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function getStatusClass(status: unknown) {
  return normalizeUpper(status, "UNKNOWN")
    .toLowerCase()
    .replaceAll("_", "-");
}

function getRoleContext(
  role: ReturnType<typeof getAuthRole>,
): {
  eyebrow: string;
  title: string;
  description: string;
  actions: RoleAction[];
} {
  if (role === "OWNER") {
    return {
      eyebrow: "Shop Owner Access",
      title: "Manage only your shop auctions",
      description:
        "You may view all public auctions, but create, end, cancel, and fulfillment controls are limited to auctions belonging to your own shops.",
      actions: [
        {
          to: "/owner/auctions",
          label: "Manage My Auctions",
          primary: true,
        },
        {
          to: "/owner/auctions/new",
          label: "Create Auction",
        },
        {
          to: "/owner/inventory",
          label: "Open Inventory",
        },
      ],
    };
  }

  if (role === "ADMIN") {
    return {
      eyebrow: "Administrator Access",
      title: "Platform auction operations",
      description:
        "Administrators may review marketplace auctions and use the protected Admin Auction Control page for platform operations.",
      actions: [
        {
          to: "/admin/auctions",
          label: "Admin Auction Control",
          primary: true,
        },
        {
          to: "/admin/inventory",
          label: "Inventory Control",
        },
      ],
    };
  }

  if (role === "SUPER_ADMIN") {
    return {
      eyebrow: "Super Admin Access",
      title: "Platform-wide auction oversight",
      description:
        "Use the Super Admin controls for platform-wide auction review, governance, and audit oversight.",
      actions: [
        {
          to: "/super-admin/auctions",
          label: "Platform Auction Control",
          primary: true,
        },
        {
          to: "/super-admin/audit",
          label: "Open Audit Trail",
        },
      ],
    };
  }

  if (role === "CONSUMER") {
    return {
      eyebrow: "Buyer Auction Tools",
      title: "Track bids, wins, and watched items",
      description:
        "Buyers may browse and bid on eligible live auctions. Buyer accounts cannot create, end, or cancel shop auctions.",
      actions: [
        {
          to: "/my-bids",
          label: "My Bids",
          primary: true,
        },
        {
          to: "/my-wins",
          label: "My Wins",
        },
        {
          to: "/watchlist",
          label: "Watchlist",
        },
      ],
    };
  }

  return {
    eyebrow: "Marketplace Auctions",
    title: "Sign in for bidding and account tools",
    description:
      "Guests may browse public auctions. A buyer account is required to bid, and a shop-owner account is required to create auctions.",
    actions: [
      {
        to: "/login",
        label: "Login",
        primary: true,
      },
      {
        to: "/register",
        label: "Create Account",
      },
    ],
  };
}

export default function AuctionsPage() {
  const role = getAuthRole();
  const roleContext = useMemo(
    () => getRoleContext(role),
    [role],
  );

  const [searchParams, setSearchParams] =
    useSearchParams();

  const initialStatus = searchParams.get("status");

  const [statusFilter, setStatusFilter] =
    useState<AuctionStatusFilter>(
      isAuctionStatusFilter(initialStatus)
        ? initialStatus
        : "LIVE",
    );

  const [rows, setRows] = useState<Auction[]>([]);
  const [total, setTotal] = useState(0);

  const [query, setQuery] = useState("");
  const [shopFilter, setShopFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] =
    useState("ALL");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");

  const [sortKey, setSortKey] =
    useState<AuctionSortKey>("ENDING_SOON");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const inFlightRef = useRef(false);

  const syncStatusUrl = useCallback(
    (nextStatus: AuctionStatusFilter) => {
      const nextParams = new URLSearchParams(
        searchParams,
      );

      if (nextStatus === "ALL") {
        nextParams.delete("status");
      } else {
        nextParams.set("status", nextStatus);
      }

      setSearchParams(nextParams, {
        replace: true,
      });
    },
    [searchParams, setSearchParams],
  );

  const load = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
    ) => {
      if (inFlightRef.current) return;

      inFlightRef.current = true;

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      try {
        const response = await getAuctions(
          statusFilter,
        );

        const auctionRows = response.auctions || [];

        setRows(auctionRows);
        setTotal(response.total ?? auctionRows.length);
      } catch (err) {
        setRows([]);
        setTotal(0);

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load auctions.",
        );
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (statusFilter !== "LIVE") return;

    const timer = window.setInterval(() => {
      void load("refresh");
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [load, statusFilter]);

  const shopOptions = useMemo(() => {
    const shops = new Map<string, string>();

    rows.forEach((auction) => {
      const value = auctionShopKey(auction);
      if (!value) return;

      shops.set(
        value,
        normalize(
          auction.shop?.name,
          "Unknown Shop",
        ),
      );
    });

    return [...shops.entries()]
      .map(([value, label]) => ({
        value,
        label,
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label),
      );
  }, [rows]);

  const categoryOptions = useMemo(() => {
    return [
      ...new Set(
        rows.map((auction) =>
          auctionCategory(auction),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const searchNeedle = query
      .trim()
      .toLowerCase();

    const min =
      minimumPrice === ""
        ? null
        : Number(minimumPrice);

    const max =
      maximumPrice === ""
        ? null
        : Number(maximumPrice);

    const filtered = rows.filter((auction) => {
      const searchMatches =
        !searchNeedle ||
        auctionSearchText(auction).includes(
          searchNeedle,
        );

      const shopMatches =
        shopFilter === "ALL" ||
        auctionShopKey(auction) === shopFilter;

      const categoryMatches =
        categoryFilter === "ALL" ||
        auctionCategory(auction) ===
          categoryFilter;

      const price = auctionCurrentPrice(auction);

      const minimumMatches =
        min === null ||
        !Number.isFinite(min) ||
        price >= min;

      const maximumMatches =
        max === null ||
        !Number.isFinite(max) ||
        price <= max;

      return (
        searchMatches &&
        shopMatches &&
        categoryMatches &&
        minimumMatches &&
        maximumMatches
      );
    });

    return sortAuctionRows(filtered, sortKey);
  }, [
    categoryFilter,
    maximumPrice,
    minimumPrice,
    query,
    rows,
    shopFilter,
    sortKey,
  ]);

  const summary = useMemo(() => {
    const now = Date.now();

    const endingSoon = rows.filter((auction) => {
      if (
        normalizeUpper(auction.status) !== "LIVE"
      ) {
        return false;
      }

      const end = auctionEndTime(auction);

      return (
        end > now &&
        end - now <= ENDING_SOON_MS
      );
    }).length;

    return {
      visible: filteredRows.length,
      serverTotal: total,
      shops: shopOptions.length,
      categories: categoryOptions.length,
      endingSoon,
    };
  }, [
    categoryOptions.length,
    filteredRows.length,
    rows,
    shopOptions.length,
    total,
  ]);

  const hasActiveControls =
    statusFilter !== "LIVE" ||
    query.trim().length > 0 ||
    shopFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    minimumPrice !== "" ||
    maximumPrice !== "" ||
    sortKey !== "ENDING_SOON";

  function changeStatus(
    nextStatus: AuctionStatusFilter,
  ) {
    setStatusFilter(nextStatus);
    syncStatusUrl(nextStatus);
  }

  function clearControls() {
    setQuery("");
    setShopFilter("ALL");
    setCategoryFilter("ALL");
    setMinimumPrice("");
    setMaximumPrice("");
    setSortKey("ENDING_SOON");
    changeStatus("LIVE");
  }

  return (
    <div className="page-stack auctions-page">
      <section className="page-card auctions-shell">
        <header className="auctions-header">
          <div>
            <div className="auctions-kicker">
              Marketplace Discovery
            </div>

            <h1>Auctions</h1>

            <p>
              Browse current and upcoming marketplace
              auctions, compare prices, and open an
              auction for complete bidding details.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void load("refresh")}
            disabled={loading || refreshing}
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh Auctions"}
          </button>
        </header>

        <section className="auctions-role-panel">
          <div>
            <div className="auctions-role-eyebrow">
              {roleContext.eyebrow}
            </div>

            <h2>{roleContext.title}</h2>
            <p>{roleContext.description}</p>
          </div>

          <div className="auctions-role-actions">
            {roleContext.actions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className={
                  action.primary
                    ? "btn btn-primary"
                    : "btn btn-secondary"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        </section>

        <section
          className="auctions-summary-grid"
          aria-label="Auction results summary"
        >
          <article>
            <span>Visible results</span>
            <strong>{summary.visible}</strong>
          </article>

          <article>
            <span>Server matches</span>
            <strong>{summary.serverTotal}</strong>
          </article>

          <article>
            <span>Shops represented</span>
            <strong>{summary.shops}</strong>
          </article>

          <article>
            <span>Categories</span>
            <strong>{summary.categories}</strong>
          </article>

          <article>
            <span>Ending within 24h</span>
            <strong>{summary.endingSoon}</strong>
          </article>
        </section>

        <nav
          className="auctions-status-tabs"
          aria-label="Auction status filters"
        >
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={
                statusFilter === filter
                  ? "auction-status-tab active"
                  : "auction-status-tab"
              }
              aria-pressed={statusFilter === filter}
              onClick={() => changeStatus(filter)}
            >
              {statusLabel(filter)}
            </button>
          ))}
        </nav>

        <section className="auctions-filter-card">
          <label className="auctions-search-field">
            <span>Search auctions</span>

            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search item, shop, status, category, or condition..."
            />
          </label>

          <div className="auctions-filter-grid">
            <label>
              <span>Shop</span>

              <select
                value={shopFilter}
                onChange={(event) =>
                  setShopFilter(event.target.value)
                }
              >
                <option value="ALL">All shops</option>

                {shopOptions.map((shop) => (
                  <option
                    key={shop.value}
                    value={shop.value}
                  >
                    {shop.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Category</span>

              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(
                    event.target.value,
                  )
                }
              >
                <option value="ALL">
                  All categories
                </option>

                {categoryOptions.map((category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Minimum price</span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={minimumPrice}
                onChange={(event) =>
                  setMinimumPrice(
                    event.target.value,
                  )
                }
                placeholder="$0.00"
              />
            </label>

            <label>
              <span>Maximum price</span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={maximumPrice}
                onChange={(event) =>
                  setMaximumPrice(
                    event.target.value,
                  )
                }
                placeholder="No maximum"
              />
            </label>

            <label>
              <span>Sort</span>

              <select
                value={sortKey}
                onChange={(event) =>
                  setSortKey(
                    event.target
                      .value as AuctionSortKey,
                  )
                }
              >
                <option value="ENDING_SOON">
                  Ending soon
                </option>
                <option value="NEWEST">
                  Newest first
                </option>
                <option value="PRICE_HIGH">
                  Highest price
                </option>
                <option value="PRICE_LOW">
                  Lowest price
                </option>
                <option value="STATUS">
                  Status
                </option>
              </select>
            </label>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={clearControls}
              disabled={
                !hasActiveControls ||
                loading ||
                refreshing
              }
            >
              Clear Filters
            </button>
          </div>

          <div className="auctions-results-meta">
            Showing {filteredRows.length} of{" "}
            {rows.length} loaded auctions
            {total !== rows.length
              ? ` · ${total} total server matches`
              : ""}
            .
          </div>
        </section>

        {error ? (
          <div
            className="admin-notice danger"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="auctions-state-card">
            Loading auctions...
          </div>
        ) : null}

        {!loading && filteredRows.length === 0 ? (
          <section className="auctions-state-card">
            <h2>
              {statusFilter === "LIVE"
                ? "No live auctions are available."
                : statusFilter === "SCHEDULED"
                  ? "No upcoming auctions were found."
                  : statusFilter === "ENDED"
                    ? "No ended auctions were found."
                    : statusFilter === "CANCELED"
                      ? "No canceled auctions were found."
                      : "No auctions were found."}
            </h2>

            <p>
              Change the filters, refresh the page, or
              use one of the account tools below.
            </p>

            <div className="auctions-empty-actions">
              {hasActiveControls ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={clearControls}
                >
                  Clear Filters
                </button>
              ) : null}

              {roleContext.actions.slice(0, 2).map(
                (action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className={
                      action.primary
                        ? "btn btn-primary"
                        : "btn btn-secondary"
                    }
                  >
                    {action.label}
                  </Link>
                ),
              )}
            </div>
          </section>
        ) : null}

        {!loading && filteredRows.length > 0 ? (
          <section className="auctions-card-grid">
            {filteredRows.map((auction) => {
              const image =
                auction.item?.images?.[0] || "";

              const status = normalizeUpper(
                auction.status,
                "UNKNOWN",
              );

              const viewLabel =
                role === "CONSUMER" &&
                status === "LIVE"
                  ? "View & Bid"
                  : "View Auction";

              return (
                <article
                  key={auction.id}
                  className="auction-result-card"
                >
                  {image ? (
                    <img
                      src={image}
                      alt={
                        auction.item?.title ||
                        "Auction item"
                      }
                      className="auction-result-image"
                      loading="lazy"
                    />
                  ) : (
                    <div className="auction-result-image auction-result-image--empty">
                      No image
                    </div>
                  )}

                  <div className="auction-result-body">
                    <div className="auction-result-heading">
                      <div>
                        <span className="auction-result-category">
                          {auctionCategory(auction)}
                        </span>

                        <h2>
                          {auction.item?.title ||
                            "Untitled Auction"}
                        </h2>

                        <p>
                          {auction.shop?.name ||
                            "Unknown Shop"}
                        </p>
                      </div>

                      <span
                        className={`auction-status-badge ${getStatusClass(
                          status,
                        )}`}
                      >
                        {status}
                      </span>
                    </div>

                    {auction.item?.description ? (
                      <p className="auction-result-description">
                        {auction.item.description}
                      </p>
                    ) : null}

                    <dl className="auction-result-details">
                      <div>
                        <dt>Current price</dt>
                        <dd>
                          {formatMoney(
                            auction.currentPrice,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Starting price</dt>
                        <dd>
                          {formatMoney(
                            auction.startingPrice,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Minimum increment</dt>
                        <dd>
                          {formatMoney(
                            auction.minIncrement,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Starts</dt>
                        <dd>
                          {formatDateTime(
                            auction.startsAt,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Ends</dt>
                        <dd>
                          {formatDateTime(
                            auction.extendedEndsAt ||
                              auction.endsAt,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Condition</dt>
                        <dd>
                          {auction.item?.condition ||
                            "Not listed"}
                        </dd>
                      </div>
                    </dl>

                    <div className="auction-result-actions">
                      <Link
                        to={`/auctions/${auction.id}`}
                        className="btn btn-primary"
                      >
                        {viewLabel}
                      </Link>

                      {auction.item?.id ? (
                        <Link
                          to={`/items/${auction.item.id}`}
                          className="btn btn-secondary"
                        >
                          View Item
                        </Link>
                      ) : null}

                      {auction.shop?.id ? (
                        <Link
                          to={`/shops/${auction.shop.id}`}
                          className="btn btn-secondary"
                        >
                          View Shop
                        </Link>
                      ) : null}

                      {role === "OWNER" ? (
                        <Link
                          to="/owner/auctions"
                          className="btn btn-secondary"
                        >
                          My Auction Console
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </section>
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Link } from "react-router-dom";

import {
  cancelMarketplaceListing,
  getMyMarketplaceListings,
  pauseMarketplaceListing,
  publishMarketplaceListing,
  type MarketplaceListing,
  type MarketplaceListingStatus,
  type MarketplaceListingType,
} from "../services/marketplaceListings";

import "../styles/marketplace-seller-listings.css";

type StatusFilter =
  | "ALL"
  | MarketplaceListingStatus;

type TypeFilter =
  | "ALL"
  | MarketplaceListingType;

type ListingAction =
  | "publish"
  | "pause"
  | "cancel";

type SortOption =
  | "NEWEST"
  | "OLDEST"
  | "PRICE_HIGH"
  | "PRICE_LOW"
  | "TITLE_ASC";

const STATUS_OPTIONS: StatusFilter[] = [
  "ALL",
  "DRAFT",
  "ACTIVE",
  "RESERVED",
  "PAUSED",
  "SOLD",
  "EXPIRED",
  "CANCELED",
  "REMOVED",
];

const TYPE_OPTIONS: TypeFilter[] = [
  "ALL",
  "CUSTOMER_TO_CUSTOMER",
  "CUSTOMER_TO_SHOP",
  "SHOP_TO_CUSTOMER",
  "SHOP_TO_SHOP",
];

const SORT_OPTIONS: Array<{
  value: SortOption;
  label: string;
}> = [
  {
    value: "NEWEST",
    label: "Newest first",
  },
  {
    value: "OLDEST",
    label: "Oldest first",
  },
  {
    value: "PRICE_HIGH",
    label: "Price: high to low",
  },
  {
    value: "PRICE_LOW",
    label: "Price: low to high",
  },
  {
    value: "TITLE_ASC",
    label: "Title: A to Z",
  },
];

function readable(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function money(
  value: number | string,
  currency = "USD",
) {
  const amount =
    Number(value);

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency:
        currency || "USD",
      maximumFractionDigits: 2,
    },
  ).format(
    Number.isFinite(amount)
      ? amount
      : 0,
  );
}

function csvCell(value: unknown) {
  const text =
    String(value ?? "");

  return `"${text.replaceAll('"', '""')}"`;
}

function replaceListing(
  rows: MarketplaceListing[],
  updated: MarketplaceListing,
) {
  return rows.map(
    (listing) =>
      listing.id === updated.id
        ? updated
        : listing,
  );
}

function canPublish(
  status: MarketplaceListingStatus,
) {
  return (
    status === "DRAFT" ||
    status === "PAUSED"
  );
}

function canEdit(
  status: MarketplaceListingStatus,
) {
  return (
    status === "DRAFT" ||
    status === "PAUSED"
  );
}

function canPause(
  status: MarketplaceListingStatus,
) {
  return status === "ACTIVE";
}

function canCancel(
  status: MarketplaceListingStatus,
) {
  return [
    "DRAFT",
    "ACTIVE",
    "PAUSED",
  ].includes(status);
}

export default function MarketplaceSellerListingsPage() {
  const [
    listings,
    setListings,
  ] = useState<MarketplaceListing[]>([]);

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<StatusFilter>("ALL");

  const [
    typeFilter,
    setTypeFilter,
  ] = useState<TypeFilter>("ALL");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("ALL");

  const [
    sortOption,
    setSortOption,
  ] = useState<SortOption>("NEWEST");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    actionKey,
    setActionKey,
  ] = useState<string | null>(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const load = useCallback(
    async (
      refresh = false,
    ) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const rows =
          await getMyMarketplaceListings();

        setListings(rows);
      } catch (caught) {
        setListings([]);

        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load your marketplace listings.",
        );
      } finally {
        if (refresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const categoryOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            listings
              .map(
                (listing) =>
                  String(
                    listing.category || "",
                  ).trim(),
              )
              .filter(Boolean),
          ),
        ).sort(
          (left, right) =>
            left.localeCompare(right),
        ),
      [listings],
    );

  const visibleListings =
    useMemo(
      () => {
        const normalizedSearch =
          search.trim().toLowerCase();

        const filtered =
          listings.filter(
            (listing) => {
              const matchesStatus =
                statusFilter === "ALL" ||
                listing.status === statusFilter;

              const matchesType =
                typeFilter === "ALL" ||
                listing.listingType === typeFilter;

              const matchesCategory =
                categoryFilter === "ALL" ||
                String(
                  listing.category || "",
                ).trim() === categoryFilter;

              const searchableValues = [
                listing.title,
                listing.description,
                listing.category,
                listing.condition,
                listing.sellerShop?.name,
                listing.status,
                listing.listingType,
              ];

              const matchesSearch =
                !normalizedSearch ||
                searchableValues.some(
                  (value) =>
                    String(value || "")
                      .toLowerCase()
                      .includes(
                        normalizedSearch,
                      ),
                );

              return (
                matchesStatus &&
                matchesType &&
                matchesCategory &&
                matchesSearch
              );
            },
          );

        return [...filtered].sort(
          (left, right) => {
            if (sortOption === "OLDEST") {
              return (
                Date.parse(left.createdAt) -
                Date.parse(right.createdAt)
              );
            }

            if (sortOption === "PRICE_HIGH") {
              return (
                Number(right.price) -
                Number(left.price)
              );
            }

            if (sortOption === "PRICE_LOW") {
              return (
                Number(left.price) -
                Number(right.price)
              );
            }

            if (sortOption === "TITLE_ASC") {
              return left.title.localeCompare(
                right.title,
              );
            }

            return (
              Date.parse(right.createdAt) -
              Date.parse(left.createdAt)
            );
          },
        );
      },
      [
        categoryFilter,
        listings,
        search,
        sortOption,
        statusFilter,
        typeFilter,
      ],
    );

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    search.trim().length > 0 ||
    sortOption !== "NEWEST";

  const summary =
    useMemo(
      () => ({
        total:
          listings.length,

        active:
          listings.filter(
            (listing) =>
              listing.status === "ACTIVE",
          ).length,

        draft:
          listings.filter(
            (listing) =>
              listing.status === "DRAFT",
          ).length,

        reserved:
          listings.filter(
            (listing) =>
              listing.status === "RESERVED",
          ).length,

        sold:
          listings.filter(
            (listing) =>
              listing.status === "SOLD",
          ).length,
      }),
      [listings],
    );

  function clearFilters() {
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setCategoryFilter("ALL");
    setSearch("");
    setSortOption("NEWEST");
  }

  function exportVisibleListings() {
    if (visibleListings.length === 0) {
      setNotice(
        "There are no visible listings to export.",
      );
      return;
    }

    const header = [
      "Title",
      "Status",
      "Listing Type",
      "Category",
      "Condition",
      "Price",
      "Currency",
      "Quantity",
      "Offers",
      "Pickup",
      "Shipping",
      "Created",
      "Updated",
    ];

    const rows =
      visibleListings.map(
        (listing) => [
          listing.title,
          readable(listing.status),
          readable(listing.listingType),
          listing.category || "",
          listing.condition || "",
          listing.price,
          listing.currency,
          listing.quantity,
          listing.allowOffers
            ? "Allowed"
            : "Disabled",
          listing.pickupAvailable
            ? "Available"
            : "No",
          listing.shippingAvailable
            ? "Available"
            : "No",
          listing.createdAt,
          listing.updatedAt,
        ],
      );

    const csv = [
      header,
      ...rows,
    ]
      .map(
        (row) =>
          row.map(csvCell).join(","),
      )
      .join("\n");

    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8",
        },
      );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    const date =
      new Date()
        .toISOString()
        .slice(0, 10);

    link.href = url;
    link.download =
      `pawnloop-my-listings-${date}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    setNotice(
      `Exported ${visibleListings.length} listing${visibleListings.length === 1
        ? ""
        : "s"}.`,
    );
  }

  async function runAction(
    listing: MarketplaceListing,
    action: ListingAction,
  ) {
    if (
      action === "cancel" &&
      !window.confirm(
        `Cancel "${listing.title}"? This removes it from active marketplace availability.`,
      )
    ) {
      return;
    }

    const key =
      `${listing.id}:${action}`;

    setActionKey(key);
    setError("");
    setNotice("");

    try {
      let updated:
        MarketplaceListing;

      if (action === "publish") {
        updated =
          await publishMarketplaceListing(
            listing.id,
          );
      } else if (action === "pause") {
        updated =
          await pauseMarketplaceListing(
            listing.id,
          );
      } else {
        updated =
          await cancelMarketplaceListing(
            listing.id,
          );
      }

      setListings(
        (current) =>
          replaceListing(
            current,
            updated,
          ),
      );

      setNotice(
        `${listing.title} was ${action === "publish"
          ? "published"
          : action === "pause"
            ? "paused"
            : "canceled"}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Unable to ${action} this listing.`,
      );
    } finally {
      setActionKey(null);
    }
  }

  if (loading) {
    return (
      <main className="seller-listings-page">
        <section className="seller-listings-state">
          Loading your marketplace listings...
        </section>
      </main>
    );
  }

  return (
    <main className="seller-listings-page">
      <header className="seller-listings-hero">
        <div>
          <span className="seller-listings-eyebrow">
            Seller workspace
          </span>

          <h1>My Marketplace Listings</h1>

          <p>
            Review your marketplace inventory and control
            draft, active, reserved, paused, and completed listings.
          </p>
        </div>

        <div className="seller-listings-hero-actions">
          <Link to="/marketplace/listings/new">
            Create listing
          </Link>

          <button
            type="button"
            onClick={() =>
              void load(true)
            }
            disabled={
              refreshing ||
              actionKey !== null
            }
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>

          <Link to="/marketplace/buy-now">
            View Buy Now
          </Link>

          <Link to="/marketplace/sales">
            Marketplace sales
          </Link>

          <button
            type="button"
            onClick={exportVisibleListings}
            disabled={
              visibleListings.length === 0
            }
          >
            Export CSV
          </button>
        </div>
      </header>

      {error ? (
        <section
          className="seller-listings-message error"
          role="alert"
        >
          {error}
        </section>
      ) : null}

      {notice ? (
        <section
          className="seller-listings-message"
          role="status"
        >
          {notice}
        </section>
      ) : null}

      <section
        className="seller-listings-summary"
        aria-label="Marketplace listing summary"
      >
        <article>
          <span>Total listings</span>
          <strong>{summary.total}</strong>
        </article>

        <article>
          <span>Active</span>
          <strong>{summary.active}</strong>
        </article>

        <article>
          <span>Drafts</span>
          <strong>{summary.draft}</strong>
        </article>

        <article>
          <span>Reserved</span>
          <strong>{summary.reserved}</strong>
        </article>

        <article>
          <span>Sold</span>
          <strong>{summary.sold}</strong>
        </article>
      </section>

      <section className="seller-listings-controls">
        <label className="seller-listings-search">
          <span>Search listings</span>

          <input
            type="search"
            value={search}
            placeholder="Search title, category, condition, or shop"
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          <span>Status</span>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as StatusFilter,
              )
            }
          >
            {STATUS_OPTIONS.map(
              (status) => (
                <option
                  key={status}
                  value={status}
                >
                  {status === "ALL"
                    ? "All statuses"
                    : readable(status)}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          <span>Listing type</span>

          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(
                event.target.value as TypeFilter,
              )
            }
          >
            {TYPE_OPTIONS.map(
              (type) => (
                <option
                  key={type}
                  value={type}
                >
                  {type === "ALL"
                    ? "All listing types"
                    : readable(type)}
                </option>
              ),
            )}
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

            {categoryOptions.map(
              (category) => (
                <option
                  key={category}
                  value={category}
                >
                  {category}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          <span>Sort by</span>

          <select
            value={sortOption}
            onChange={(event) =>
              setSortOption(
                event.target.value as SortOption,
              )
            }
          >
            {SORT_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </label>

        <button
          type="button"
          className="seller-listings-clear-button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
        >
          Clear filters
        </button>

        <div
          className="seller-listings-visible-count"
          aria-live="polite"
        >
          <strong>
            {visibleListings.length}
          </strong>{" "}
          shown from{" "}
          <strong>
            {listings.length}
          </strong>{" "}
          total
        </div>
      </section>

      {visibleListings.length === 0 ? (
        <section
          className="seller-listings-empty"
          aria-live="polite"
        >
          <span className="seller-listings-empty-icon">
            {listings.length === 0
              ? "＋"
              : "⌕"}
          </span>

          <h2>
            {listings.length === 0
              ? "You have not created any listings yet"
              : "No listings match these filters"}
          </h2>

          <p>
            {listings.length === 0
              ? "Create your first marketplace listing to start selling, accepting offers, or connecting with pawn shops."
              : "Try a broader search, change one or more filters, or clear all filters to see your inventory again."}
          </p>

          <div className="seller-listings-empty-actions">
            <Link to="/marketplace/listings/new">
              Create listing
            </Link>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}

            <button
              type="button"
              onClick={() =>
                void load(true)
              }
              disabled={refreshing}
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
        </section>
      ) : (
        <section className="seller-listings-grid">
          {visibleListings.map(
            (listing) => {
              const image =
                listing.images?.find(Boolean) || "";

              return (
                <article
                  key={listing.id}
                  className="seller-listing-card"
                >
                  <div className="seller-listing-media">
                    {image ? (
                      <img
                        src={image}
                        alt={listing.title}
                      />
                    ) : (
                      <strong>
                        PawnLoop listing
                      </strong>
                    )}

                    <span
                      className={`seller-listing-status status-${listing.status.toLowerCase()}`}
                    >
                      {readable(listing.status)}
                    </span>
                  </div>

                  <div className="seller-listing-body">
                    <div className="seller-listing-title-row">
                      <div>
                        <span>
                          {readable(
                            listing.listingType,
                          )}
                        </span>

                        <h2>
                          {listing.title}
                        </h2>
                      </div>

                      <strong>
                        {money(
                          listing.price,
                          listing.currency,
                        )}
                      </strong>
                    </div>

                    <p>
                      {listing.description ||
                        "No listing description has been added."}
                    </p>

                    <dl>
                      <div>
                        <dt>Quantity</dt>
                        <dd>{listing.quantity}</dd>
                      </div>

                      <div>
                        <dt>Offers</dt>
                        <dd>
                          {listing.allowOffers
                            ? "Allowed"
                            : "Disabled"}
                        </dd>
                      </div>

                      <div>
                        <dt>Pickup</dt>
                        <dd>
                          {listing.pickupAvailable
                            ? "Available"
                            : "No"}
                        </dd>
                      </div>

                      <div>
                        <dt>Shipping</dt>
                        <dd>
                          {listing.shippingAvailable
                            ? "Available"
                            : "No"}
                        </dd>
                      </div>
                    </dl>

                    <div className="seller-listing-actions">
                      {canEdit(listing.status) ? (
                        <Link
                          to={`/marketplace/listings/${encodeURIComponent(listing.id)}/edit`}
                        >
                          Edit
                        </Link>
                      ) : null}

                      {canPublish(listing.status) ? (
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              listing,
                              "publish",
                            )
                          }
                          disabled={actionKey !== null}
                        >
                          {actionKey === `${listing.id}:publish`
                            ? "Publishing..."
                            : "Publish"}
                        </button>
                      ) : null}

                      {canPause(listing.status) ? (
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              listing,
                              "pause",
                            )
                          }
                          disabled={actionKey !== null}
                        >
                          {actionKey === `${listing.id}:pause`
                            ? "Pausing..."
                            : "Pause"}
                        </button>
                      ) : null}

                      {canCancel(listing.status) ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            void runAction(
                              listing,
                              "cancel",
                            )
                          }
                          disabled={actionKey !== null}
                        >
                          {actionKey === `${listing.id}:cancel`
                            ? "Canceling..."
                            : "Cancel"}
                        </button>
                      ) : null}

                      {listing.status === "RESERVED" ? (
                        <Link to="/marketplace/sales">
                          View reserved sale
                        </Link>
                      ) : null}

                      {listing.itemId ? (
                        <Link
                          to={`/items/${encodeURIComponent(listing.itemId)}`}
                        >
                          View item
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            },
          )}
        </section>
      )}
    </main>
  );
}

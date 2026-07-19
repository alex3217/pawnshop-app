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

  const visibleListings =
    useMemo(
      () =>
        listings.filter(
          (listing) =>
            (
              statusFilter === "ALL" ||
              listing.status === statusFilter
            ) &&
            (
              typeFilter === "ALL" ||
              listing.listingType === typeFilter
            ),
        ),
      [
        listings,
        statusFilter,
        typeFilter,
      ],
    );

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

        <div className="seller-listings-visible-count">
          Showing {visibleListings.length} of {listings.length}
        </div>
      </section>

      {visibleListings.length === 0 ? (
        <section className="seller-listings-empty">
          <h2>No matching listings</h2>

          <p>
            Change the filters or create and publish a marketplace listing.
          </p>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("ALL");
              setTypeFilter("ALL");
            }}
          >
            Clear filters
          </button>
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

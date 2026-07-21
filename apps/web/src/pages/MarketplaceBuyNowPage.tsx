import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  getAuthToken,
  getAuthUser,
} from "../services/auth";

import {
  getMarketplaceListings,
  type MarketplaceListing,
} from "../services/marketplaceListings";

import {
  reserveMarketplacePurchase,
} from "../services/marketplaceTransactions";

import "../styles/marketplace-buy-now.css";

const pageStyle: CSSProperties = {
  width:
    "min(1220px, calc(100% - 2rem))",

  margin:
    "0 auto",

  padding:
    "32px 0 72px",
};

const panelStyle: CSSProperties = {
  border:
    "1px solid var(--border)",

  borderRadius:
    "var(--radius-lg)",

  background:
    "var(--surface)",

  boxShadow:
    "var(--shadow-soft)",
};

const buttonStyle: CSSProperties = {
  display:
    "inline-flex",

  alignItems:
    "center",

  justifyContent:
    "center",

  minHeight:
    44,

  padding:
    "11px 17px",

  border:
    "1px solid var(--border-strong)",

  borderRadius:
    "var(--radius-sm)",

  background:
    "var(--surface-strong)",

  color:
    "var(--text-strong)",

  fontWeight:
    900,

  cursor:
    "pointer",

  textDecoration:
    "none",
};

function money(
  value: number | string,
  currency = "USD",
) {
  const amount =
    Number(value);

  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        currency || "USD",

      maximumFractionDigits:
        2,
    },
  ).format(
    Number.isFinite(amount)
      ? amount
      : 0,
  );
}

function readable(
  value: string | null | undefined,
) {
  return String(
    value || "Unknown",
  )
    .toLowerCase()
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function listingImage(
  listing: MarketplaceListing,
) {
  return (
    listing.images.find(
      (image) =>
        typeof image ===
          "string" &&
        Boolean(image),
    ) || ""
  );
}

function isConsumerPurchaseListing(
  listing: MarketplaceListing,
) {
  return (
    listing.listingType ===
      "CUSTOMER_TO_CUSTOMER" ||
    listing.listingType ===
      "SHOP_TO_CUSTOMER"
  );
}

export default function MarketplaceBuyNowPage() {
  const navigate =
    useNavigate();

  const [
    listings,
    setListings,
  ] =
    useState<
      MarketplaceListing[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    reservingListingId,
    setReservingListingId,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    notice,
    setNotice,
  ] =
    useState("");

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("all");

  const [
    conditionFilter,
    setConditionFilter,
  ] = useState("all");

  const [
    fulfillmentFilter,
    setFulfillmentFilter,
  ] = useState<
    "all" | "pickup" | "shipping"
  >("all");

  const [
    minimumPrice,
    setMinimumPrice,
  ] = useState("");

  const [
    maximumPrice,
    setMaximumPrice,
  ] = useState("");

  const [
    sortOption,
    setSortOption,
  ] = useState<
    "newest" | "price-low" | "price-high"
  >("newest");

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
        const result =
          await getMarketplaceListings({
            page:
              1,

            limit:
              48,
          });

        setListings(
          result.rows,
        );
      } catch (caught) {
        setListings([]);

        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Buy Now listings.",
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

  const eligibleListings =
    useMemo(
      () =>
        listings.filter(
          (listing) =>
            listing.status ===
              "ACTIVE" &&
            listing.quantity >
              0 &&
            isConsumerPurchaseListing(
              listing,
            ),
        ),

      [listings],
    );

  const categories =
    useMemo(
      () =>
        Array.from(
          new Set(
            eligibleListings
              .map(
                (listing) =>
                  String(
                    listing.category ||
                    "",
                  ).trim(),
              )
              .filter(Boolean),
          ),
        ).sort(
          (a, b) =>
            a.localeCompare(b),
        ),

      [eligibleListings],
    );

  const conditions =
    useMemo(
      () =>
        Array.from(
          new Set(
            eligibleListings
              .map(
                (listing) =>
                  String(
                    listing.condition ||
                    "",
                  ).trim(),
              )
              .filter(Boolean),
          ),
        ).sort(
          (a, b) =>
            a.localeCompare(b),
        ),

      [eligibleListings],
    );

  const filteredListings =
    useMemo(
      () => {
        const normalizedSearch =
          searchQuery
            .trim()
            .toLowerCase();

        const parsedMinimum =
          Number(minimumPrice);

        const parsedMaximum =
          Number(maximumPrice);

        const hasMinimum =
          minimumPrice.trim() !==
            "" &&
          Number.isFinite(
            parsedMinimum,
          );

        const hasMaximum =
          maximumPrice.trim() !==
            "" &&
          Number.isFinite(
            parsedMaximum,
          );

        const next =
          eligibleListings.filter(
            (listing) => {
              const price =
                Number(
                  listing.price,
                );

              const searchable =
                [
                  listing.title,
                  listing.description,
                  listing.category,
                  listing.condition,
                  listing.seller?.name,
                  listing.sellerShop?.name,
                ]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase();

              if (
                normalizedSearch &&
                !searchable.includes(
                  normalizedSearch,
                )
              ) {
                return false;
              }

              if (
                categoryFilter !==
                  "all" &&
                listing.category !==
                  categoryFilter
              ) {
                return false;
              }

              if (
                conditionFilter !==
                  "all" &&
                listing.condition !==
                  conditionFilter
              ) {
                return false;
              }

              if (
                fulfillmentFilter ===
                  "pickup" &&
                !listing.pickupAvailable
              ) {
                return false;
              }

              if (
                fulfillmentFilter ===
                  "shipping" &&
                !listing.shippingAvailable
              ) {
                return false;
              }

              if (
                hasMinimum &&
                price <
                  parsedMinimum
              ) {
                return false;
              }

              if (
                hasMaximum &&
                price >
                  parsedMaximum
              ) {
                return false;
              }

              return true;
            },
          );

        next.sort(
          (a, b) => {
            if (
              sortOption ===
              "price-low"
            ) {
              return (
                Number(a.price) -
                Number(b.price)
              );
            }

            if (
              sortOption ===
              "price-high"
            ) {
              return (
                Number(b.price) -
                Number(a.price)
              );
            }

            const aDate =
              new Date(
                a.publishedAt ||
                a.createdAt,
              ).getTime();

            const bDate =
              new Date(
                b.publishedAt ||
                b.createdAt,
              ).getTime();

            return bDate - aDate;
          },
        );

        return next;
      },

      [
        eligibleListings,
        searchQuery,
        categoryFilter,
        conditionFilter,
        fulfillmentFilter,
        minimumPrice,
        maximumPrice,
        sortOption,
      ],
    );

  const hasActiveFilters =
    Boolean(
      searchQuery.trim() ||
      categoryFilter !==
        "all" ||
      conditionFilter !==
        "all" ||
      fulfillmentFilter !==
        "all" ||
      minimumPrice.trim() ||
      maximumPrice.trim() ||
      sortOption !==
        "newest",
    );

  function clearFilters() {
    setSearchQuery("");
    setCategoryFilter("all");
    setConditionFilter("all");
    setFulfillmentFilter("all");
    setMinimumPrice("");
    setMaximumPrice("");
    setSortOption("newest");
  }

  const currentUser =
    getAuthUser();

  async function buyNow(
    listing: MarketplaceListing,
  ) {
    const token =
      getAuthToken();

    if (!token) {
      const returnPath =
        "/marketplace/buy-now";

      navigate(
        `/login?next=${encodeURIComponent(returnPath)}`,
      );

      return;
    }

    const user =
      getAuthUser();

    if (
      user?.id &&
      user.id ===
        listing.sellerUserId
    ) {
      setNotice(
        "You cannot purchase your own marketplace listing.",
      );

      return;
    }

    setReservingListingId(
      listing.id,
    );

    setError("");
    setNotice("");

    try {
      const transaction =
        await reserveMarketplacePurchase({
          listingId:
            listing.id,

          quantity:
            1,
        });

      navigate(
        `/marketplace/transactions/${encodeURIComponent(transaction.id)}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to reserve this marketplace listing.",
      );

      await load(true);
    } finally {
      setReservingListingId(
        null,
      );
    }
  }

  if (loading) {
    return (
      <main className="marketplace-buy-now-page" style={pageStyle}>
        <section
          aria-live="polite"
          style={{
            ...panelStyle,

            padding:
              36,

            textAlign:
              "center",

            color:
              "var(--muted)",
          }}
        >
          Loading Buy Now listings...
        </section>
      </main>
    );
  }

  return (
    <main className="marketplace-buy-now-page" style={pageStyle}>
      <header
        style={{
          ...panelStyle,

          padding:
            "28px clamp(20px, 4vw, 42px)",

          marginBottom:
            22,

          display:
            "flex",

          justifyContent:
            "space-between",

          alignItems:
            "center",

          gap:
            20,

          flexWrap:
            "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin:
                "0 0 8px",

              color:
                "var(--accent)",

              fontWeight:
                900,

              letterSpacing:
                "0.08em",

              textTransform:
                "uppercase",

              fontSize:
                12,
            }}
          >
            Direct marketplace checkout
          </p>

          <h1
            style={{
              marginBottom:
                10,

              fontSize:
                "clamp(32px, 6vw, 54px)",
            }}
          >
            Buy Now
          </h1>

          <p
            style={{
              margin:
                0,

              color:
                "var(--muted)",

              maxWidth:
                720,
            }}
          >
            Reserve an active marketplace listing and continue directly to secure checkout.
          </p>
        </div>

        <div
          style={{
            display:
              "flex",

            gap:
              12,

            flexWrap:
              "wrap",
          }}
        >
          <button
            type="button"
            onClick={() =>
              void load(true)
            }
            disabled={
              refreshing ||
              reservingListingId !==
                null
            }
            style={{
              ...buttonStyle,

              opacity:
                refreshing
                  ? 0.65
                  : 1,
            }}
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh listings"}
          </button>

          <Link
            to="/marketplace"
            style={buttonStyle}
          >
            Browse all items
          </Link>
        </div>
      </header>

      {error ? (
        <section
          role="alert"
          style={{
            ...panelStyle,

            padding:
              18,

            marginBottom:
              20,

            color:
              "var(--danger)",

            fontWeight:
              800,
          }}
        >
          {error}
        </section>
      ) : null}

      {notice ? (
        <section
          role="status"
          style={{
            ...panelStyle,

            padding:
              18,

            marginBottom:
              20,

            color:
              "var(--text-strong)",

            fontWeight:
              800,
          }}
        >
          {notice}
        </section>
      ) : null}

      <section
        className="marketplace-buy-now-filters"
        style={{
          ...panelStyle,
          padding: 22,
          marginBottom: 20,
        }}
      >
        <div className="marketplace-buy-now-filter-heading">
          <div>
            <h2>Find the right listing</h2>
            <p>
              Search and narrow direct-purchase inventory before checkout.
            </p>
          </div>

          <button
            type="button"
            style={buttonStyle}
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </button>
        </div>

        <div className="marketplace-buy-now-filter-grid">
          <label>
            <span>Search</span>
            <input
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(
                  event.target.value,
                )
              }
              placeholder="Item, category, shop, or seller"
              type="search"
            />
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
              <option value="all">
                All categories
              </option>

              {categories.map(
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
            <span>Condition</span>
            <select
              value={conditionFilter}
              onChange={(event) =>
                setConditionFilter(
                  event.target.value,
                )
              }
            >
              <option value="all">
                All conditions
              </option>

              {conditions.map(
                (condition) => (
                  <option
                    key={condition}
                    value={condition}
                  >
                    {condition}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Fulfillment</span>
            <select
              value={fulfillmentFilter}
              onChange={(event) =>
                setFulfillmentFilter(
                  event.target.value as
                    | "all"
                    | "pickup"
                    | "shipping",
                )
              }
            >
              <option value="all">
                Pickup or shipping
              </option>
              <option value="pickup">
                Pickup available
              </option>
              <option value="shipping">
                Shipping available
              </option>
            </select>
          </label>

          <label>
            <span>Minimum price</span>
            <input
              value={minimumPrice}
              onChange={(event) =>
                setMinimumPrice(
                  event.target.value,
                )
              }
              placeholder="$0"
              type="number"
              min="0"
              inputMode="decimal"
            />
          </label>

          <label>
            <span>Maximum price</span>
            <input
              value={maximumPrice}
              onChange={(event) =>
                setMaximumPrice(
                  event.target.value,
                )
              }
              placeholder="No maximum"
              type="number"
              min="0"
              inputMode="decimal"
            />
          </label>

          <label>
            <span>Sort results</span>
            <select
              value={sortOption}
              onChange={(event) =>
                setSortOption(
                  event.target.value as
                    | "newest"
                    | "price-low"
                    | "price-high",
                )
              }
            >
              <option value="newest">
                Newest first
              </option>
              <option value="price-low">
                Price: low to high
              </option>
              <option value="price-high">
                Price: high to low
              </option>
            </select>
          </label>
        </div>

        <p className="marketplace-buy-now-result-count">
          Showing {filteredListings.length} of{" "}
          {eligibleListings.length} Buy Now listings
        </p>
      </section>

      {filteredListings.length ===
      0 ? (
        <section
          className="marketplace-buy-now-empty"
          style={{
            ...panelStyle,
            padding:
              38,
            textAlign:
              "center",
          }}
        >
          <h2>
            {eligibleListings.length ===
            0
              ? "No Buy Now listings are available"
              : "No listings match your filters"}
          </h2>

          <p
            style={{
              color:
                "var(--muted)",
            }}
          >
            {eligibleListings.length ===
            0
              ? "New direct-purchase listings will appear here after sellers publish them."
              : "Change or clear your filters to see more marketplace inventory."}
          </p>

          <div className="marketplace-buy-now-empty-actions">
            {hasActiveFilters ? (
              <button
                type="button"
                style={buttonStyle}
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}

            <Link
              to="/marketplace"
              style={buttonStyle}
            >
              Browse marketplace items
            </Link>

            <Link
              to="/auctions"
              style={buttonStyle}
            >
              View auctions
            </Link>

            <Link
              to="/buyer/sell-item"
              style={buttonStyle}
            >
              Sell or list an item
            </Link>
          </div>
        </section>
      ) : (
        <section
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(270px, 1fr))",

            gap:
              18,
          }}
        >
          {filteredListings.map(
            (listing) => {
              const image =
                listingImage(
                  listing,
                );

              const ownListing =
                Boolean(
                  currentUser?.id &&
                  currentUser.id ===
                    listing.sellerUserId,
                );

              const reserving =
                reservingListingId ===
                listing.id;

              return (
                <article
                  key={listing.id}
                  style={{
                    ...panelStyle,

                    overflow:
                      "hidden",

                    display:
                      "flex",

                    flexDirection:
                      "column",
                  }}
                >
                  <div
                    style={{
                      minHeight:
                        220,

                      background:
                        "var(--bg-soft)",

                      display:
                        "grid",

                      placeItems:
                        "center",

                      overflow:
                        "hidden",
                    }}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt={
                          listing.title
                        }
                        style={{
                          width:
                            "100%",

                          height:
                            220,

                          objectFit:
                            "cover",
                        }}
                      />
                    ) : (
                      <strong
                        style={{
                          color:
                            "var(--muted)",
                        }}
                      >
                        PawnLoop listing
                      </strong>
                    )}
                  </div>

                  <div
                    style={{
                      padding:
                        20,

                      display:
                        "flex",

                      flexDirection:
                        "column",

                      gap:
                        13,

                      flex:
                        1,
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin:
                            "0 0 6px",

                          color:
                            "var(--accent)",

                          fontSize:
                            12,

                          fontWeight:
                            900,

                          textTransform:
                            "uppercase",

                          letterSpacing:
                            "0.06em",
                        }}
                      >
                        {readable(
                          listing.listingType,
                        )}
                      </p>

                      <h2
                        style={{
                          fontSize:
                            22,

                          marginBottom:
                            7,
                        }}
                      >
                        {listing.title}
                      </h2>

                      <strong
                        style={{
                          color:
                            "var(--text-strong)",

                          fontSize:
                            24,
                        }}
                      >
                        {money(
                          listing.price,
                          listing.currency,
                        )}
                      </strong>
                    </div>

                    <p
                      style={{
                        color:
                          "var(--muted)",

                        margin:
                          0,

                        flex:
                          1,
                      }}
                    >
                      {listing.description ||
                        "Active marketplace listing available for direct purchase."}
                    </p>

                    <div
                      style={{
                        color:
                          "var(--muted)",

                        fontSize:
                          14,

                        fontWeight:
                          700,
                      }}
                    >
                      <div>
                        Seller:{" "}
                        {listing.sellerShop?.name ||
                          listing.seller?.name ||
                          "Marketplace seller"}
                      </div>

                      <div>
                        Available quantity:{" "}
                        {listing.quantity}
                      </div>

                      <div>
                        Fulfillment:{" "}
                        {[
                          listing.pickupAvailable
                            ? "Pickup"
                            : "",

                          listing.shippingAvailable
                            ? "Shipping"
                            : "",
                        ]
                          .filter(
                            Boolean,
                          )
                          .join(
                            " or ",
                          ) ||
                          "Confirm with seller"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void buyNow(
                          listing,
                        )
                      }
                      disabled={
                        ownListing ||
                        reserving ||
                        reservingListingId !==
                          null
                      }
                      style={{
                        ...buttonStyle,

                        width:
                          "100%",

                        borderColor:
                          ownListing
                            ? "var(--border)"
                            : "var(--accent)",

                        background:
                          ownListing
                            ? "var(--surface-strong)"
                            : "var(--accent)",

                        color:
                          ownListing
                            ? "var(--muted)"
                            : "white",

                        opacity:
                          reservingListingId !==
                            null
                            ? 0.65
                            : 1,
                      }}
                    >
                      {ownListing
                        ? "Your listing"
                        : reserving
                          ? "Reserving..."
                          : getAuthToken()
                            ? "Buy now"
                            : "Sign in to buy"}
                    </button>

                    {listing.itemId ? (
                      <Link
                        to={`/items/${encodeURIComponent(listing.itemId)}`}
                        style={{
                          ...buttonStyle,

                          width:
                            "100%",
                        }}
                      >
                        View item details
                      </Link>
                    ) : null}
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

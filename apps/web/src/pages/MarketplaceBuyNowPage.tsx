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
      <main style={pageStyle}>
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
    <main style={pageStyle}>
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

      {eligibleListings.length ===
      0 ? (
        <section
          style={{
            ...panelStyle,

            padding:
              38,

            textAlign:
              "center",
          }}
        >
          <h2>
            No Buy Now listings are available
          </h2>

          <p
            style={{
              color:
                "var(--muted)",
            }}
          >
            New direct-purchase listings will appear here after sellers publish them.
          </p>

          <Link
            to="/marketplace"
            style={buttonStyle}
          >
            Browse marketplace items
          </Link>
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
          {eligibleListings.map(
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
                        View linked item
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

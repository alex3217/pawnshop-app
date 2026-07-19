import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getMyMarketplaceListings,
  updateMarketplaceListing,
  type MarketplaceListing,
} from "../services/marketplaceListings";

import "../styles/create-marketplace-listing.css";

function parseImages(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((image) => image.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function toLocalDateTime(
  value?: string | null,
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  const local =
    new Date(
      date.getTime() -
      date.getTimezoneOffset() * 60_000,
    );

  return local
    .toISOString()
    .slice(0, 16);
}

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

function canEdit(
  listing: MarketplaceListing,
) {
  return (
    listing.status === "DRAFT" ||
    listing.status === "PAUSED"
  );
}

export default function EditMarketplaceListingPage() {
  const navigate =
    useNavigate();

  const params =
    useParams<{
      id: string;
    }>();

  const listingId =
    String(
      params.id || "",
    ).trim();

  const [
    listing,
    setListing,
  ] = useState<MarketplaceListing | null>(null);

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    category,
    setCategory,
  ] = useState("");

  const [
    condition,
    setCondition,
  ] = useState("");

  const [
    price,
    setPrice,
  ] = useState("");

  const [
    quantity,
    setQuantity,
  ] = useState("1");

  const [
    imageUrls,
    setImageUrls,
  ] = useState("");

  const [
    allowOffers,
    setAllowOffers,
  ] = useState(true);

  const [
    pickupAvailable,
    setPickupAvailable,
  ] = useState(true);

  const [
    shippingAvailable,
    setShippingAvailable,
  ] = useState(false);

  const [
    expiresAt,
    setExpiresAt,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    let active =
      true;

    async function loadListing() {
      setLoading(true);
      setError("");

      if (!listingId) {
        setError(
          "Marketplace listing ID is missing.",
        );

        setLoading(false);
        return;
      }

      try {
        const rows =
          await getMyMarketplaceListings();

        if (!active) {
          return;
        }

        const found =
          rows.find(
            (row) =>
              row.id === listingId,
          );

        if (!found) {
          setError(
            "Marketplace listing was not found in your seller account.",
          );

          return;
        }

        setListing(found);

        setTitle(
          found.title || "",
        );

        setDescription(
          found.description || "",
        );

        setCategory(
          found.category || "",
        );

        setCondition(
          found.condition || "",
        );

        setPrice(
          String(
            found.price || "",
          ),
        );

        setQuantity(
          String(
            found.quantity || 1,
          ),
        );

        setImageUrls(
          Array.isArray(
            found.images,
          )
            ? found.images.join("\n")
            : "",
        );

        setAllowOffers(
          found.allowOffers,
        );

        setPickupAvailable(
          found.pickupAvailable,
        );

        setShippingAvailable(
          found.shippingAvailable,
        );

        setExpiresAt(
          toLocalDateTime(
            found.expiresAt,
          ),
        );
      } catch (caught) {
        if (!active) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load this marketplace listing.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadListing();

    return () => {
      active =
        false;
    };
  }, [listingId]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (
      !listing ||
      !canEdit(listing)
    ) {
      setError(
        "Only draft or paused listings can be edited.",
      );

      return;
    }

    if (
      !pickupAvailable &&
      !shippingAvailable
    ) {
      setError(
        "Select pickup, shipping, or both.",
      );

      return;
    }

    const parsedPrice =
      Number(price);

    const parsedQuantity =
      Number(quantity);

    if (
      !Number.isFinite(
        parsedPrice,
      ) ||
      parsedPrice <= 0
    ) {
      setError(
        "Enter a valid price greater than 0.",
      );

      return;
    }

    if (
      !Number.isInteger(
        parsedQuantity,
      ) ||
      parsedQuantity < 1
    ) {
      setError(
        "Quantity must be a positive whole number.",
      );

      return;
    }

    let normalizedExpiresAt:
      string |
      null =
        null;

    if (expiresAt) {
      const expiration =
        new Date(expiresAt);

      if (
        Number.isNaN(
          expiration.getTime(),
        )
      ) {
        setError(
          "Enter a valid expiration date.",
        );

        return;
      }

      normalizedExpiresAt =
        expiration.toISOString();
    }

    setSubmitting(true);

    try {
      await updateMarketplaceListing(
        listing.id,
        {
          title,

          description:
            description.trim() ||
            null,

          category:
            category.trim() ||
            null,

          condition:
            condition.trim() ||
            null,

          price:
            parsedPrice,

          currency:
            listing.currency ||
            "USD",

          quantity:
            parsedQuantity,

          images:
            parseImages(
              imageUrls,
            ),

          allowOffers,
          pickupAvailable,
          shippingAvailable,

          expiresAt:
            normalizedExpiresAt,
        },
      );

      navigate(
        "/marketplace/listings/mine",
        {
          replace: true,
        },
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update marketplace listing.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="create-marketplace-listing-page">
        <section className="create-listing-panel">
          Loading marketplace listing...
        </section>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="create-marketplace-listing-page">
        <section
          className="create-listing-message"
          role="alert"
        >
          {error ||
            "Marketplace listing could not be loaded."}
        </section>

        <Link to="/marketplace/listings/mine">
          Return to My Listings
        </Link>
      </main>
    );
  }

  if (!canEdit(listing)) {
    return (
      <main className="create-marketplace-listing-page">
        <header className="create-listing-hero">
          <div>
            <span>
              Seller workspace
            </span>

            <h1>
              Listing cannot be edited
            </h1>

            <p>
              Only draft and paused listings can be changed.
              This listing is currently {readable(listing.status)}.
            </p>
          </div>

          <Link to="/marketplace/listings/mine">
            Return to My Listings
          </Link>
        </header>
      </main>
    );
  }

  return (
    <main className="create-marketplace-listing-page">
      <header className="create-listing-hero">
        <div>
          <span>
            {readable(listing.listingType)}
          </span>

          <h1>
            Edit Marketplace Listing
          </h1>

          <p>
            Update this {readable(listing.status)} listing
            before publishing it again.
          </p>
        </div>

        <div className="create-listing-hero-actions">
          <Link to="/marketplace/listings/mine">
            My Listings
          </Link>

          {listing.itemId ? (
            <Link
              to={`/items/${encodeURIComponent(listing.itemId)}`}
            >
              View linked item
            </Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <section
          className="create-listing-message"
          role="alert"
        >
          {error}
        </section>
      ) : null}

      <form
        className="create-listing-form"
        onSubmit={handleSubmit}
      >
        <section className="create-listing-panel">
          <h2>
            Listing details
          </h2>

          <div className="create-listing-field-grid">
            <label className="wide">
              <span>
                Listing title
              </span>

              <input
                value={title}
                onChange={(event) =>
                  setTitle(
                    event.target.value,
                  )
                }
                maxLength={180}
                required
              />
            </label>

            <label>
              <span>
                Category
              </span>

              <input
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Condition
              </span>

              <input
                value={condition}
                onChange={(event) =>
                  setCondition(
                    event.target.value,
                  )
                }
              />
            </label>

            <label className="wide">
              <span>
                Description
              </span>

              <textarea
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value,
                  )
                }
                rows={6}
              />
            </label>
          </div>
        </section>

        <section className="create-listing-panel">
          <h2>
            Pricing and quantity
          </h2>

          <div className="create-listing-field-grid">
            <label>
              <span>
                Price
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(event) =>
                  setPrice(
                    event.target.value,
                  )
                }
                required
              />
            </label>

            <label>
              <span>
                Quantity
              </span>

              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    event.target.value,
                  )
                }
                required
              />
            </label>

            <label>
              <span>
                Optional expiration
              </span>

              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) =>
                  setExpiresAt(
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        </section>

        <section className="create-listing-panel">
          <h2>
            Photos
          </h2>

          <label>
            <span>
              Image URLs
            </span>

            <textarea
              value={imageUrls}
              onChange={(event) =>
                setImageUrls(
                  event.target.value,
                )
              }
              rows={5}
              placeholder="Enter one image URL per line"
            />
          </label>
        </section>

        <section className="create-listing-panel">
          <h2>
            Purchase options
          </h2>

          <div className="create-listing-checkbox-grid">
            <label>
              <input
                type="checkbox"
                checked={allowOffers}
                onChange={(event) =>
                  setAllowOffers(
                    event.target.checked,
                  )
                }
              />

              <span>
                Allow buyer offers
              </span>
            </label>

            <label>
              <input
                type="checkbox"
                checked={pickupAvailable}
                onChange={(event) =>
                  setPickupAvailable(
                    event.target.checked,
                  )
                }
              />

              <span>
                Pickup available
              </span>
            </label>

            <label>
              <input
                type="checkbox"
                checked={shippingAvailable}
                onChange={(event) =>
                  setShippingAvailable(
                    event.target.checked,
                  )
                }
              />

              <span>
                Shipping available
              </span>
            </label>
          </div>
        </section>

        <footer className="create-listing-submit-row">
          <Link to="/marketplace/listings/mine">
            Cancel
          </Link>

          <button
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Saving changes..."
              : "Save changes"}
          </button>
        </footer>
      </form>
    </main>
  );
}

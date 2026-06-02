import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { createOffer } from "../services/offers";
import { getItemById, type Item } from "../services/items";
import { directionsUrl, distanceMiles, formatMiles, type GeoPoint } from "../utils/geoDistance";
import { addToWatchlist } from "../services/watchlist";
import "../styles/item-detail-v2.css";

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

function shopIdFor(item: Item) {
  return item.shop?.id || item.pawnShopId || "";
}

function shopHrefFor(item: Item) {
  const shopId = shopIdFor(item);
  return shopId ? `/shops/${encodeURIComponent(shopId)}` : "/shops";
}

function itemShopPoint(item: Item): GeoPoint {
  return {
    latitude: item.shop?.latitude,
    longitude: item.shop?.longitude,
  };
}

function itemShopDistanceMiles(item: Item, userPoint: GeoPoint | null): number | null {
  if (!userPoint) return null;
  return distanceMiles(userPoint, itemShopPoint(item));
}

function itemShopDistanceLabel(item: Item, userPoint: GeoPoint | null): string {
  return formatMiles(itemShopDistanceMiles(item, userPoint));
}

function itemDirectionsUrl(item: Item): string | null {
  return directionsUrl(itemShopPoint(item));
}


function itemImages(item: Item) {
  return Array.isArray(item.images) ? item.images.filter(Boolean) : [];
}

function isAvailable(status: string | null | undefined) {
  return ["AVAILABLE", "ACTIVE"].includes(String(status || "").toUpperCase());
}

export default function ItemDetailPage() {
  const { id = "" } = useParams();

  const [item, setItem] = useState<Item | null>(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [userPoint, setUserPoint] = useState<GeoPoint | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) {
        setError("Missing item id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextItem = await getItemById(id);

        if (!cancelled) {
          setItem(nextItem);
          setSelectedImage(itemImages(nextItem)[0] || "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load item.");
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
  }, [id]);

  const images = useMemo(() => (item ? itemImages(item) : []), [item]);

  const suggestedOffer = useMemo(() => {
    if (!item) return "";
    const price = toPriceNumber(item.price);
    if (!price) return "";
    return String(Math.max(1, Math.round(price * 0.9)));
  }, [item]);

  async function handleSaveItem() {
    if (!item?.id || savingWatchlist) return;

    try {
      setSavingWatchlist(true);
      setNotice(null);
      await addToWatchlist(item.id);
      setNotice("Item saved to your watchlist.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to save item.");
    } finally {
      setSavingWatchlist(false);
    }
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
        setLocationMessage("Location enabled. Shop distance is now shown from your current area.");
      },
      () => {
        setLocationMessage("Location permission was not enabled. You can still open directions to the shop.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  async function handleOfferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!item?.id || submittingOffer) return;

    const amount = Number(offerAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice("Enter a valid offer amount.");
      return;
    }

    try {
      setSubmittingOffer(true);
      setNotice(null);

      await createOffer({
        itemId: item.id,
        amount,
        message: offerMessage.trim() || undefined,
      });

      setNotice("Offer sent to the shop.");
      setOfferAmount("");
      setOfferMessage("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to send offer.");
    } finally {
      setSubmittingOffer(false);
    }
  }

  if (loading) {
    return (
      <main className="item-detail-v2">
        <section className="item-detail-state">Loading item...</section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="item-detail-v2">
        <section className="item-detail-state item-detail-error">
          <h1>Item could not load</h1>
          <p>{error}</p>
          <Link to="/marketplace">Back to marketplace</Link>
        </section>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="item-detail-v2">
        <section className="item-detail-state">
          <h1>Item not found</h1>
          <p>This listing could not be found.</p>
          <Link to="/marketplace">Back to marketplace</Link>
        </section>
      </main>
    );
  }

  const shopName = normalizeLabel(item.shop?.name, "Unknown pawnshop");
  const shopAddress = normalizeLabel(item.shop?.address, "Shop address not listed");
  const shopPhone = normalizeLabel(item.shop?.phone, "Shop phone not listed");
  const shopDirectionsHref = itemDirectionsUrl(item);
  const shopDistanceText = userPoint ? itemShopDistanceLabel(item, userPoint) : "Enable location to show distance";
  const available = isAvailable(item.status);

  return (
    <main className="item-detail-v2">
      <section className="item-detail-hero">
        <div className="item-detail-gallery">
          <div className="item-detail-main-image">
            {selectedImage ? (
              <img src={selectedImage} alt={item.title} />
            ) : (
              <div className="item-detail-placeholder">PawnLoop</div>
            )}

            <span className={available ? "item-detail-status available" : "item-detail-status"}>
              {normalizeLabel(item.status, "Status unavailable")}
            </span>
          </div>

          {images.length > 1 ? (
            <div className="item-detail-thumbs">
              {images.slice(0, 5).map((image) => (
                <button
                  key={image}
                  type="button"
                  className={selectedImage === image ? "active" : ""}
                  onClick={() => setSelectedImage(image)}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="item-detail-summary">
          <Link to="/marketplace" className="item-detail-back">
            ← Back to marketplace
          </Link>

          <span className="item-detail-pill">Marketplace item</span>

          <h1>{normalizeLabel(item.title, "Untitled item")}</h1>

          <div className="item-detail-price-row">
            <strong>{formatPrice(item.price)}</strong>
            <span>{available ? "Available now" : "Check availability"}</span>
          </div>

          <div className="item-detail-badges">
            <span>{normalizeLabel(item.category, "Uncategorized")}</span>
            <span>{normalizeLabel(item.condition, "Condition not listed")}</span>
            <span>{shopName}</span>
          </div>

          <p className="item-detail-description">
            {normalizeLabel(
              item.description,
              "This shop has not added a full description yet. Contact or visit the storefront for more information.",
            )}
          </p>

          {notice ? <div className="item-detail-notice">{notice}</div> : null}
          {locationMessage ? <div className="item-detail-notice">{locationMessage}</div> : null}

          <div className="item-detail-actions">
            <button type="button" onClick={handleSaveItem} disabled={savingWatchlist}>
              {savingWatchlist ? "Saving..." : "Watch item"}
            </button>

            <Link to={shopHrefFor(item)}>View shop</Link>
            <button type="button" onClick={handleUseLocation}>
              Use my location
            </button>
            <Link to="/buyer/item-locator">Find similar</Link>
          </div>
        </div>
      </section>

      <section className="item-detail-content-grid">
        <form className="item-detail-offer-card" onSubmit={handleOfferSubmit}>
          <div className="item-detail-section-title">
            <span>Make offer</span>
            <h2>Send an offer to the shop</h2>
            <p>
              Submit your best offer. The shop can accept, reject, or counter.
            </p>
          </div>

          <label>
            <span>Offer amount</span>
            <input
              value={offerAmount}
              onChange={(event) => setOfferAmount(event.target.value)}
              placeholder={suggestedOffer ? `$${suggestedOffer}` : "$100"}
              inputMode="decimal"
            />
          </label>

          <label>
            <span>Message</span>
            <textarea
              value={offerMessage}
              onChange={(event) => setOfferMessage(event.target.value)}
              placeholder="Optional message to the shop..."
              rows={4}
            />
          </label>

          <button type="submit" disabled={submittingOffer}>
            {submittingOffer ? "Sending..." : "Send offer"}
          </button>
        </form>

        <aside className="item-detail-shop-card">
          <div className="item-detail-section-title">
            <span>Shop</span>
            <h2>{shopName}</h2>
            <p>Review the shop details before visiting or making an offer.</p>
          </div>

          <div className="item-detail-shop-list">
            <div>
              <span>Address</span>
              <strong>{shopAddress}</strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{shopPhone}</strong>
            </div>
            <div>
              <span>Pickup</span>
              <strong>Confirm pickup with the shop</strong>
            </div>
            <div>
              <span>Distance</span>
              <strong>{shopDistanceText}</strong>
            </div>
          </div>

          <div className="item-detail-map-card">
            <div className="item-detail-map-user">Shop</div>
            <div className="item-detail-map-note">
              <strong>Shop location</strong>
              <span>{shopDistanceText}</span>
            </div>
          </div>

          <div className="item-detail-shop-actions">
            <Link to={shopHrefFor(item)}>Open storefront</Link>
            {shopDirectionsHref ? (
              <a href={shopDirectionsHref} target="_blank" rel="noreferrer">
                Directions
              </a>
            ) : null}
            <Link to="/shops">Browse shops</Link>
          </div>
        </aside>

        <section className="item-detail-trust-card">
          <div className="item-detail-section-title">
            <span>Buyer confidence</span>
            <h2>Before you buy</h2>
          </div>

          <div className="item-detail-trust-grid">
            <div>
              <strong>Condition</strong>
              <span>{normalizeLabel(item.condition, "Ask shop for condition details")}</span>
            </div>
            <div>
              <strong>Status</strong>
              <span>{normalizeLabel(item.status, "Ask shop for availability")}</span>
            </div>
            <div>
              <strong>Pickup</strong>
              <span>Confirm pickup window, ID requirements, and payment details.</span>
            </div>
            <div>
              <strong>Protection</strong>
              <span>Use platform offer and watchlist tools to track activity.</span>
            </div>
          </div>
        </section>

        <section className="item-detail-next-card">
          <div className="item-detail-section-title">
            <span>Next steps</span>
            <h2>Keep shopping</h2>
          </div>

          <div className="item-detail-next-grid">
            <Link to="/marketplace">Marketplace</Link>
            <Link to="/buyer/item-locator">Item locator</Link>
            <Link to="/watchlist">Watchlist</Link>
            <Link to="/offers">My offers</Link>
          </div>
        </section>
      </section>
    </main>
  );
}

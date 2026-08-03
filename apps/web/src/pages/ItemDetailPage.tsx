import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createOffer } from "../services/offers";
import {
  getAuthRole,
  isAuthenticated,
} from "../services/auth";
import {
  getItemById,
  getItemPriceComparison,
  getMarketplaceIntelligence,
  type Item,
  type ItemPriceComparisonReason,
  type ItemPriceComparisonResponse,
  type MarketplaceIntelligence,
} from "../services/items";
import { directionsUrl, distanceMiles, formatMiles, type GeoPoint } from "../utils/geoDistance";
import { addToWatchlist } from "../services/watchlist";
import { recordRecentlyViewed, RECENTLY_VIEWED_ENABLED_KEY } from "../services/recentlyViewed.mjs";
import { getBuyerPreferences } from "../services/buyerPreferences";
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


function dealScoreLabel(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return "More local pricing data is needed";
  }

  if (score >= 80) return "Excellent local value";
  if (score >= 65) return "Good local value";
  if (score >= 45) return "Near the local market";
  return "Priced above the local market";
}

function priceComparisonReasonMessage(
  reason: ItemPriceComparisonReason,
) {
  switch (reason) {
    case "SHOP_LOCATION_UNAVAILABLE":
      return "This shop has not added coordinates yet, so nearby pricing cannot be calculated.";
    case "NO_COMPARABLES":
      return "No recent comparable items were found within the selected local area.";
    case "INSUFFICIENT_SAMPLE":
      return "Some comparable items were found, but more shops and listings are needed for a reliable deal score.";
    default:
      return null;
  }
}


type PriceComparisonView =
  | "cards"
  | "table"
  | "compare";

type FulfillmentPreference =
  | "pickup"
  | "shipping"
  | "local-delivery";

type OfferFeedback = {
  kind: "error" | "success";
  source: "amount-validation" | "submission";
  message: string;
};

const fulfillmentMessageLines: Record<FulfillmentPreference, string> = {
  pickup: "Preferred fulfillment: Pick up at shop.",
  shipping: "Preferred fulfillment request: Shipping, subject to shop confirmation.",
  "local-delivery": "Preferred fulfillment request: Local delivery, subject to shop confirmation.",
};

const buyerChecklistItems = [
  "I reviewed the item condition",
  "I reviewed the photos and description",
  "I understand the pickup requirements",
  "I understand the payment and buyer-protection terms",
] as const;

function qualityScoreForCondition(
  condition: string | null | undefined,
) {
  switch (
    String(condition || "")
      .trim()
      .toUpperCase()
  ) {
    case "NEW":
      return 100;
    case "LIKE NEW":
      return 92;
    case "EXCELLENT":
      return 84;
    case "GOOD":
      return 72;
    case "FAIR":
      return 55;
    case "POOR":
      return 35;
    case "FOR PARTS":
      return 15;
    default:
      return 50;
  }
}

function valueScoreFromBenchmark(
  price: string | number | null | undefined,
  benchmark: number | null | undefined,
) {
  const numericPrice = Number(price);
  const numericBenchmark = Number(benchmark);

  if (
    !Number.isFinite(numericPrice)
    || numericPrice <= 0
    || !Number.isFinite(numericBenchmark)
    || numericBenchmark <= 0
  ) {
    return null;
  }

  const discountPercentage =
    ((numericBenchmark - numericPrice) / numericBenchmark) * 100;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(50 + 2 * discountPercentage),
    ),
  );
}

function priceDifferenceFromBenchmark(
  price: string | number | null | undefined,
  benchmark: number | null | undefined,
) {
  const numericPrice = Number(price);
  const numericBenchmark = Number(benchmark);

  if (
    !Number.isFinite(numericPrice)
    || !Number.isFinite(numericBenchmark)
  ) {
    return "Unavailable";
  }

  const difference = numericPrice - numericBenchmark;

  if (Math.abs(difference) < 0.005) {
    return "At local median";
  }

  return difference < 0
    ? `${formatPrice(Math.abs(difference))} below median`
    : `${formatPrice(difference)} above median`;
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
  const navigate = useNavigate();

  const [item, setItem] = useState<Item | null>(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxOpenerRef = useRef<HTMLButtonElement | null>(null);
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [fulfillmentPreference, setFulfillmentPreference] =
    useState<FulfillmentPreference>("pickup");
  const [buyerChecklist, setBuyerChecklist] = useState<boolean[]>(
    () => buyerChecklistItems.map(() => false),
  );
  const [loading, setLoading] = useState(true);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [offerFeedback, setOfferFeedback] =
    useState<OfferFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [userPoint, setUserPoint] = useState<GeoPoint | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [priceComparison, setPriceComparison] =
    useState<ItemPriceComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonReloadKey, setComparisonReloadKey] = useState(0);
  const [marketIntelligence, setMarketIntelligence] = useState<MarketplaceIntelligence | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(true);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  const [comparisonView, setComparisonView] =
    useState<PriceComparisonView>("cards");
  const [
    selectedComparableIds,
    setSelectedComparableIds,
  ] = useState<string[]>([]);

  const offerFormRef =
    useRef<HTMLFormElement | null>(null);
  const offerAmountInputRef =
    useRef<HTMLInputElement | null>(null);
  const offerMessageInputRef =
    useRef<HTMLTextAreaElement | null>(null);
  const activeItemIdRef = useRef(id);
  const offerSubmissionTokenRef = useRef(0);

  useLayoutEffect(() => {
    activeItemIdRef.current = id;
  }, [id]);

  const reviewedChecklistCount = buyerChecklist.filter(Boolean).length;
  const isBuyerChecklistComplete =
    reviewedChecklistCount === buyerChecklistItems.length;
  const hasAmountValidationError =
    offerFeedback?.kind === "error"
    && offerFeedback.source === "amount-validation";

  function clearOfferFeedbackForEdit() {
    setOfferFeedback(null);
  }

  function handleFulfillmentPreferenceChange(
    preference: FulfillmentPreference,
  ) {
    clearOfferFeedbackForEdit();
    setFulfillmentPreference(preference);
  }

  function focusOfferAmount() {
    offerFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    window.requestAnimationFrame(() => {
      offerAmountInputRef.current?.focus();
    });
  }

  function focusOfferMessage(prefill: string) {
    clearOfferFeedbackForEdit();

    if (!offerMessage.trim()) {
      setOfferMessage(prefill);
    }

    offerFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    window.requestAnimationFrame(() => {
      offerMessageInputRef.current?.focus();
    });
  }

  useEffect(() => {
    offerSubmissionTokenRef.current += 1;
    setSubmittingOffer(false);
    setOfferFeedback(null);
    setFulfillmentPreference("pickup");
    setBuyerChecklist(buyerChecklistItems.map(() => false));
    setLightboxOpen(false);
    touchStartX.current = null;

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

  useEffect(() => {
    if (!item || getAuthRole() !== "CONSUMER") return;
    const controller = new AbortController();
    void getBuyerPreferences(controller.signal).then((preferences) => {
      try { localStorage.setItem(RECENTLY_VIEWED_ENABLED_KEY, String(preferences.recentlyViewedEnabled)); } catch { /* Storage unavailable means recording safely no-ops. */ }
      if (preferences.recentlyViewedEnabled) recordRecentlyViewed({
        itemId: item.id, title: normalizeLabel(item.title, "Untitled item"),
        imageUrl: item.images?.[0] || null, priceLabel: formatPrice(item.price),
        shopName: item.shop?.name || null, href: `/items/${encodeURIComponent(item.id)}`,
        viewedAt: new Date().toISOString(),
      });
    }).catch(() => { /* Do not record until the privacy preference is known. */ });
    return () => controller.abort();
  }, [item]);


  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadComparison() {
      if (!id) {
        setPriceComparison(null);
        setComparisonError("Missing item id.");
        setComparisonLoading(false);
        return;
      }

      setComparisonLoading(true);
      setComparisonError(null);
      setPriceComparison(null);

      try {
        const response = await getItemPriceComparison(
          id,
          controller.signal,
        );

        if (!cancelled) {
          setPriceComparison(response);
        }
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setComparisonError(
            err instanceof Error
              ? err.message
              : "Local pricing could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) {
          setComparisonLoading(false);
        }
      }
    }

    void loadComparison();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, comparisonReloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    if (!id) { setIntelligenceLoading(false); return () => controller.abort(); }
    setIntelligenceLoading(true); setIntelligenceError(null);
    getMarketplaceIntelligence(id, controller.signal).then(setMarketIntelligence).catch((cause) => { if (!controller.signal.aborted) setIntelligenceError(cause instanceof Error ? cause.message : "Marketplace Intelligence could not load."); }).finally(() => { if (!controller.signal.aborted) setIntelligenceLoading(false); });
    return () => controller.abort();
  }, [id]);


  useEffect(() => {
    if (
      !item
      || window.location.hash !== "#make-offer"
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      offerFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      offerAmountInputRef.current?.focus();

      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [item]);

  const images = useMemo(() => (item ? itemImages(item) : []), [item]);
  const selectedImageIndex = Math.max(images.indexOf(selectedImage), 0);
  const selectRelative = useCallback((delta: number) => {
    if (!images.length) return;

    const next =
      (selectedImageIndex + delta + images.length) % images.length;
    setSelectedImage(images[next]);
  }, [images, selectedImageIndex]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    window.setTimeout(() => lightboxOpenerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;

    lightboxRef.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
      if (images.length > 1 && event.key === "ArrowLeft") selectRelative(-1);
      if (images.length > 1 && event.key === "ArrowRight") selectRelative(1);
    };

    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [closeLightbox, images.length, lightboxOpen, selectRelative]);

  const suggestedOffer = useMemo(() => {
    if (!item) return "";
    const price = toPriceNumber(item.price);
    if (!price) return "";
    return String(Math.max(1, Math.round(price * 0.9)));
  }, [item]);


  function offerReturnPath() {
    return `/items/${encodeURIComponent(id)}#make-offer`;
  }

  function focusOfferForm() {
    offerFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    window.setTimeout(() => {
      offerAmountInputRef.current?.focus();
    }, 300);
  }

  function handleOpenOfferForm() {
    if (!isAuthenticated()) {
      navigate(
        `/login?next=${encodeURIComponent(offerReturnPath())}`,
      );
      return;
    }

    const role = getAuthRole();

    if (role !== "CONSUMER" && role !== "ADMIN") {
      setNotice(
        "Offers must be submitted from a buyer account.",
      );
      return;
    }

    if (!item || !isAvailable(item.status)) {
      setNotice(
        "This item is not currently available for offers.",
      );
      return;
    }

    setNotice(null);
    focusOfferForm();
  }

  function toggleComparableSelection(
    comparableId: string,
  ) {
    const alreadySelected =
      selectedComparableIds.includes(comparableId);

    if (
      !alreadySelected
      && selectedComparableIds.length >= 3
    ) {
      setNotice(
        "Select up to three nearby items to compare with this item.",
      );
      return;
    }

    setSelectedComparableIds((current) =>
      current.includes(comparableId)
        ? current.filter((idValue) =>
            idValue !== comparableId
          )
        : [...current, comparableId],
    );
  }

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

    if (
      !item?.id
      || item.id !== activeItemIdRef.current
      || submittingOffer
    ) return;

    if (!isAuthenticated()) {
      navigate(
        `/login?next=${encodeURIComponent(offerReturnPath())}`,
      );
      return;
    }

    const role = getAuthRole();

    if (role !== "CONSUMER" && role !== "ADMIN") {
      setNotice(
        "Offers must be submitted from a buyer account.",
      );
      return;
    }

    const amount = Number(offerAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setOfferFeedback({
        kind: "error",
        source: "amount-validation",
        message: "Enter an offer amount greater than $0.",
      });
      offerAmountInputRef.current?.focus();
      return;
    }

    const submittedItemId = item.id;
    const submissionToken =
      offerSubmissionTokenRef.current + 1;
    offerSubmissionTokenRef.current = submissionToken;

    function isCurrentSubmission() {
      return activeItemIdRef.current === submittedItemId
        && offerSubmissionTokenRef.current === submissionToken;
    }

    try {
      setSubmittingOffer(true);
      setNotice(null);
      setOfferFeedback(null);

      const typedMessage = offerMessage.trim();
      const outgoingMessage = [
        fulfillmentMessageLines[fulfillmentPreference],
        typedMessage,
      ].filter(Boolean).join("\n\n");

      await createOffer({
        itemId: submittedItemId,
        amount,
        message: outgoingMessage,
      });

      if (!isCurrentSubmission()) return;

      setOfferFeedback({
        kind: "success",
        source: "submission",
        message: "Offer sent to the shop.",
      });
      setOfferAmount("");
      setOfferMessage("");
      setFulfillmentPreference("pickup");
    } catch (err) {
      if (!isCurrentSubmission()) return;

      setOfferFeedback({
        kind: "error",
        source: "submission",
        message:
          err instanceof Error
            ? err.message
            : "Failed to send offer.",
      });
    } finally {
      if (isCurrentSubmission()) {
        setSubmittingOffer(false);
      }
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
  const comparison = priceComparison?.comparison ?? null;
  const comparisonStatistics = comparison?.statistics ?? null;
  const comparisonReasonMessage = priceComparisonReasonMessage(
    priceComparison?.reason ?? null,
  );

  const selectedComparables =
    comparison?.comparables.filter((comparable) =>
      selectedComparableIds.includes(comparable.id)
    ) ?? [];

  return (
    <main className="item-detail-v2">
      <section className="item-detail-hero">
        <div className="item-detail-gallery">
          <div className="item-detail-main-image">
            {selectedImage ? (
              <button
                ref={lightboxOpenerRef}
                type="button"
                className="item-detail-main-image-button"
                onClick={() => setLightboxOpen(true)}
                aria-label={`Open ${item.title} image ${selectedImageIndex + 1} of ${images.length} full screen`}
              >
                <img
                  src={selectedImage}
                  alt={`${item.title} — image ${selectedImageIndex + 1} of ${images.length}`}
                />
              </button>
            ) : (
              <div className="item-detail-placeholder">PawnLoop</div>
            )}

            <span className={available ? "item-detail-status available" : "item-detail-status"}>
              {normalizeLabel(item.status, "Status unavailable")}
            </span>
          </div>

          {images.length > 1 ? (
            <>
              <div className="item-detail-gallery-controls">
                <button
                  type="button"
                  onClick={() => selectRelative(-1)}
                  aria-label="View previous image"
                >
                  Previous image
                </button>
                <span aria-live="polite">
                  Image {selectedImageIndex + 1} of {images.length}
                </span>
                <button
                  type="button"
                  onClick={() => selectRelative(1)}
                  aria-label="View next image"
                >
                  Next image
                </button>
              </div>
              <div
                className="item-detail-thumbs"
                role="group"
                aria-label={`${item.title} image thumbnails`}
              >
                {images.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    className={selectedImage === image ? "active" : ""}
                    onClick={() => setSelectedImage(image)}
                    aria-label={`View image ${index + 1} of ${images.length}`}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {lightboxOpen ? (
          <div
            className="item-detail-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`${item.title} image viewer`}
            tabIndex={-1}
            ref={lightboxRef}
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchStartX.current;
              const end = event.changedTouches[0]?.clientX;

              if (
                start !== null
                && end !== undefined
                && Math.abs(end - start) > 45
              ) {
                selectRelative(end > start ? -1 : 1);
              }

              touchStartX.current = null;
            }}
          >
            <button
              type="button"
              className="item-detail-lightbox-close"
              onClick={closeLightbox}
              aria-label="Close full-screen image viewer"
            >
              Close
            </button>
            {images.length > 1 ? (
              <button
                type="button"
                onClick={() => selectRelative(-1)}
                aria-label="Previous full-screen image"
              >
                ‹
              </button>
            ) : null}
            <figure>
              <img
                src={selectedImage}
                alt={`${item.title} — image ${selectedImageIndex + 1} of ${images.length}`}
              />
              <figcaption>
                Image {selectedImageIndex + 1} of {images.length}
              </figcaption>
            </figure>
            {images.length > 1 ? (
              <button
                type="button"
                onClick={() => selectRelative(1)}
                aria-label="Next full-screen image"
              >
                ›
              </button>
            ) : null}
          </div>
        ) : null}

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
            <button type="button" onClick={handleSaveItem} disabled={savingWatchlist} className="item-detail-action-force-label item-detail-primary-action item-detail-watch-action item-detail-big-button" data-label="Watch item" aria-label="Watch item" title="Watch item">
              {savingWatchlist ? "Saving..." : "Watch item"}
            </button>

            <Link to={shopHrefFor(item)} className="item-detail-action-force-label item-detail-secondary-action item-detail-shop-action item-detail-big-button" data-label="View shop" aria-label="View shop" title="View shop">View shop</Link>
            <button type="button" onClick={handleUseLocation} className="item-detail-action-force-label item-detail-big-button item-detail-location-action" data-label="Use my location" aria-label="Use my location" title="Use my location">
              Use my location
            </button>
            <button
              type="button"
              onClick={handleOpenOfferForm}
              className="item-detail-action-force-label item-detail-primary-action item-detail-offer-action item-detail-big-button"
              data-label="Make offer"
              aria-label="Make offer"
              aria-controls="item-offer-form"
              title="Make offer"
            >
              Make offer
            </button>
          </div>
        </div>
      </section>

      <section className="item-detail-content-grid">

        <section className="item-detail-price-intelligence-card" aria-live="polite">
          <div className="item-detail-section-title"><span>Marketplace Intelligence</span><h2>Observed marketplace context</h2><p>Deterministic comparisons from active public listings and completed PawnLoop transactions.</p></div>
          {intelligenceLoading ? <div className="item-detail-price-state"><strong>Loading Marketplace Intelligence…</strong></div> : null}
          {intelligenceError ? <div role="alert" className="item-detail-price-state item-detail-price-error"><strong>Marketplace Intelligence unavailable</strong><span>{intelligenceError}</span></div> : null}
          {marketIntelligence ? <div>
            <div className="item-detail-price-metrics"><div><span>Active comparables</span><strong>{marketIntelligence.comparableActiveListings}</strong></div><div><span>Completed sales</span><strong>{marketIntelligence.completedSales.sampleSize}</strong></div><div><span>Confidence</span><strong>{marketIntelligence.completedSales.confidence.level}</strong></div><div><span>Demand</span><strong>{marketIntelligence.demand.label.replaceAll("_", " ")}</strong></div></div>
            {marketIntelligence.completedSales.available ? <p>Completed-sale median: {formatPrice((marketIntelligence.completedSales.medianSalePriceCents ?? 0) / 100)} · Position: {marketIntelligence.pricePosition.replaceAll("_", " ").toLowerCase()}</p> : <p><strong>Insufficient completed-sale data.</strong> At least three comparable completed sales are required.</p>}
            <p><strong>Price history unavailable:</strong> {marketIntelligence.priceHistory.reason}</p>
            <h3>Similar listings</h3>{marketIntelligence.similarListings.length ? <div className="item-detail-next-grid">{marketIntelligence.similarListings.slice(0, 6).map((listing) => <Link key={listing.id} to={listing.itemId ? `/items/${encodeURIComponent(listing.itemId)}` : "/marketplace"}>{listing.title} · {formatPrice(listing.priceCents / 100)}</Link>)}</div> : <p>No eligible similar active listings are available.</p>}
            <p><small>{marketIntelligence.disclaimer} Limitations: {marketIntelligence.limitations.join(" ")}</small></p>
          </div> : null}
        </section>

        <section
          className="item-detail-price-intelligence-card"
          aria-live="polite"
        >
          <div className="item-detail-section-title">
            <span>Local price check</span>
            <h2>How this price compares nearby</h2>
            <p>
              PawnLoop compares recent available items from other nearby
              pawn shops with matching product details.
            </p>
          </div>

          {comparisonLoading ? (
            <div className="item-detail-price-state">
              <strong>Checking local prices...</strong>
              <span>Reviewing nearby comparable inventory.</span>
            </div>
          ) : comparisonError ? (
            <div className="item-detail-price-state item-detail-price-error">
              <strong>Local pricing could not load</strong>
              <span>{comparisonError}</span>
              <button
                type="button"
                className="item-detail-price-retry"
                onClick={() =>
                  setComparisonReloadKey((current) => current + 1)
                }
              >
                Try again
              </button>
            </div>
          ) : comparison ? (
            <>
              <div className="item-detail-price-overview">
                <div className="item-detail-price-score">
                  <span>Deal score</span>
                  <strong>{comparison.score ?? "—"}</strong>
                  <small>{dealScoreLabel(comparison.score)}</small>
                </div>

                <div className="item-detail-price-metrics">
                  <div>
                    <span>Local low</span>
                    <strong>
                      {comparisonStatistics
                        ? formatPrice(comparisonStatistics.low)
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Local median</span>
                    <strong>
                      {comparisonStatistics
                        ? formatPrice(comparisonStatistics.median)
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Local high</span>
                    <strong>
                      {comparisonStatistics
                        ? formatPrice(comparisonStatistics.high)
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <strong>
                      {Math.round(comparison.confidence)}%
                    </strong>
                  </div>
                </div>
              </div>

              {comparisonReasonMessage ? (
                <div className="item-detail-price-guidance">
                  {comparisonReasonMessage}
                </div>
              ) : null}

              <div className="item-detail-price-context">
                <span>
                  {comparison.sampleCount} comparable
                  {comparison.sampleCount === 1 ? " item" : " items"}
                </span>
                <span>
                  {comparison.shopCount} contributing
                  {comparison.shopCount === 1 ? " shop" : " shops"}
                </span>
                <span>
                  Within {priceComparison?.radiusMiles ?? 25} miles
                </span>
                <span>
                  Last {priceComparison?.freshnessDays ?? 30} days
                </span>
              </div>

              {comparison.comparables.length > 0 ? (
                <div className="item-detail-price-comparables">
                  <div className="item-detail-price-comparables-heading">
                    <div>
                      <strong>Nearby comparable items</strong>
                      <span>
                        Compare price, condition, quality, and distance.
                      </span>
                    </div>

                    <span>
                      {selectedComparableIds.length} of 3 selected
                    </span>
                  </div>

                  <div
                    className="item-detail-price-view-controls"
                    role="group"
                    aria-label="Price comparison view"
                  >
                    <button
                      type="button"
                      className={
                        comparisonView === "cards"
                          ? "active"
                          : ""
                      }
                      aria-pressed={
                        comparisonView === "cards"
                      }
                      onClick={() =>
                        setComparisonView("cards")
                      }
                    >
                      Cards
                    </button>

                    <button
                      type="button"
                      className={
                        comparisonView === "table"
                          ? "active"
                          : ""
                      }
                      aria-pressed={
                        comparisonView === "table"
                      }
                      onClick={() =>
                        setComparisonView("table")
                      }
                    >
                      Table
                    </button>

                    <button
                      type="button"
                      className={
                        comparisonView === "compare"
                          ? "active"
                          : ""
                      }
                      aria-pressed={
                        comparisonView === "compare"
                      }
                      onClick={() =>
                        setComparisonView("compare")
                      }
                    >
                      Side by side
                    </button>
                  </div>

                  <div className="item-detail-price-selection">
                    <span>
                      The current item is always included.
                      Select up to three nearby items.
                    </span>

                    <div>
                      <button
                        type="button"
                        disabled={
                          selectedComparableIds.length === 0
                        }
                        onClick={() =>
                          setComparisonView("compare")
                        }
                      >
                        Compare selected
                      </button>

                      <button
                        type="button"
                        disabled={
                          selectedComparableIds.length === 0
                        }
                        onClick={() =>
                          setSelectedComparableIds([])
                        }
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {comparisonView === "cards" ? (
                    <div className="item-detail-price-card-grid">
                      {comparison.comparables
                        .slice(0, 12)
                        .map((comparable) => {
                          const selected =
                            selectedComparableIds.includes(
                              comparable.id,
                            );

                          return (
                            <article
                              key={comparable.id}
                              className={
                                selected
                                  ? "item-detail-price-comparable-card selected"
                                  : "item-detail-price-comparable-card"
                              }
                            >
                              <div className="item-detail-price-card-top">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() =>
                                      toggleComparableSelection(
                                        comparable.id,
                                      )
                                    }
                                  />
                                  <span>
                                    {selected
                                      ? "Selected"
                                      : "Compare"}
                                  </span>
                                </label>

                                <strong>
                                  {formatPrice(comparable.price)}
                                </strong>
                              </div>

                              <Link
                                to={`/items/${encodeURIComponent(
                                  comparable.id,
                                )}`}
                              >
                                {comparable.title}
                              </Link>

                              <div className="item-detail-price-card-metrics">
                                <div>
                                  <span>Condition</span>
                                  <strong>
                                    {normalizeLabel(
                                      comparable.condition,
                                      "Not listed",
                                    )}
                                  </strong>
                                </div>

                                <div>
                                  <span>Quality</span>
                                  <strong>
                                    {qualityScoreForCondition(
                                      comparable.condition,
                                    )}
                                    /100
                                  </strong>
                                </div>

                                <div>
                                  <span>Value score</span>
                                  <strong>
                                    {valueScoreFromBenchmark(
                                      comparable.price,
                                      comparison.benchmark,
                                    ) ?? "—"}
                                  </strong>
                                </div>

                                <div>
                                  <span>Distance</span>
                                  <strong>
                                    {comparable.distanceMiles.toFixed(
                                      1,
                                    )}{" "}
                                    mi
                                  </strong>
                                </div>
                              </div>

                              <p>
                                {comparable.shopName
                                  || "Nearby pawn shop"}
                              </p>

                              <small>
                                {priceDifferenceFromBenchmark(
                                  comparable.price,
                                  comparison.benchmark,
                                )}
                              </small>
                            </article>
                          );
                        })}
                    </div>
                  ) : null}

                  {comparisonView === "table" ? (
                    <div className="item-detail-price-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Compare</th>
                            <th scope="col">Item</th>
                            <th scope="col">Price</th>
                            <th scope="col">Condition</th>
                            <th scope="col">Quality</th>
                            <th scope="col">Distance</th>
                            <th scope="col">Local median</th>
                          </tr>
                        </thead>

                        <tbody>
                          <tr className="current-item">
                            <td>
                              <span className="item-detail-price-current-badge">
                                Current
                              </span>
                            </td>
                            <td>
                              <strong>{item.title}</strong>
                              <span>{shopName}</span>
                            </td>
                            <td>{formatPrice(item.price)}</td>
                            <td>
                              {normalizeLabel(
                                item.condition,
                                "Not listed",
                              )}
                            </td>
                            <td>
                              {qualityScoreForCondition(
                                item.condition,
                              )}
                              /100
                            </td>
                            <td>Current listing</td>
                            <td>
                              {priceDifferenceFromBenchmark(
                                item.price,
                                comparison.benchmark,
                              )}
                            </td>
                          </tr>

                          {comparison.comparables
                            .slice(0, 20)
                            .map((comparable) => (
                              <tr key={comparable.id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={`Compare ${comparable.title}`}
                                    checked={
                                      selectedComparableIds.includes(
                                        comparable.id,
                                      )
                                    }
                                    onChange={() =>
                                      toggleComparableSelection(
                                        comparable.id,
                                      )
                                    }
                                  />
                                </td>
                                <td>
                                  <Link
                                    to={`/items/${encodeURIComponent(
                                      comparable.id,
                                    )}`}
                                  >
                                    {comparable.title}
                                  </Link>
                                  <span>
                                    {comparable.shopName
                                      || "Nearby pawn shop"}
                                  </span>
                                </td>
                                <td>
                                  {formatPrice(
                                    comparable.price,
                                  )}
                                </td>
                                <td>
                                  {normalizeLabel(
                                    comparable.condition,
                                    "Not listed",
                                  )}
                                </td>
                                <td>
                                  {qualityScoreForCondition(
                                    comparable.condition,
                                  )}
                                  /100
                                </td>
                                <td>
                                  {comparable.distanceMiles.toFixed(
                                    1,
                                  )}{" "}
                                  mi
                                </td>
                                <td>
                                  {priceDifferenceFromBenchmark(
                                    comparable.price,
                                    comparison.benchmark,
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {comparisonView === "compare" ? (
                    selectedComparables.length === 0 ? (
                      <div className="item-detail-price-state">
                        <strong>
                          Select nearby items to compare
                        </strong>
                        <span>
                          Use the Cards or Table view to select
                          up to three comparable items.
                        </span>
                      </div>
                    ) : (
                      <div className="item-detail-price-compare-grid">
                        <article className="item-detail-price-compare-card current">
                          <span>Current item</span>
                          <h3>{item.title}</h3>
                          <strong>{formatPrice(item.price)}</strong>

                          <dl>
                            <div>
                              <dt>Condition</dt>
                              <dd>
                                {normalizeLabel(
                                  item.condition,
                                  "Not listed",
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Quality</dt>
                              <dd>
                                {qualityScoreForCondition(
                                  item.condition,
                                )}
                                /100
                              </dd>
                            </div>
                            <div>
                              <dt>Value score</dt>
                              <dd>
                                {comparison.score ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt>Local median</dt>
                              <dd>
                                {priceDifferenceFromBenchmark(
                                  item.price,
                                  comparison.benchmark,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Shop</dt>
                              <dd>{shopName}</dd>
                            </div>
                          </dl>
                        </article>

                        {selectedComparables.map(
                          (comparable) => (
                            <article
                              key={comparable.id}
                              className="item-detail-price-compare-card"
                            >
                              <span>Nearby comparison</span>

                              <Link
                                to={`/items/${encodeURIComponent(
                                  comparable.id,
                                )}`}
                              >
                                <h3>{comparable.title}</h3>
                              </Link>

                              <strong>
                                {formatPrice(comparable.price)}
                              </strong>

                              <dl>
                                <div>
                                  <dt>Condition</dt>
                                  <dd>
                                    {normalizeLabel(
                                      comparable.condition,
                                      "Not listed",
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Quality</dt>
                                  <dd>
                                    {qualityScoreForCondition(
                                      comparable.condition,
                                    )}
                                    /100
                                  </dd>
                                </div>
                                <div>
                                  <dt>Value score</dt>
                                  <dd>
                                    {valueScoreFromBenchmark(
                                      comparable.price,
                                      comparison.benchmark,
                                    ) ?? "—"}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Local median</dt>
                                  <dd>
                                    {priceDifferenceFromBenchmark(
                                      comparable.price,
                                      comparison.benchmark,
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Distance</dt>
                                  <dd>
                                    {comparable.distanceMiles.toFixed(
                                      1,
                                    )}{" "}
                                    miles
                                  </dd>
                                </div>
                                <div>
                                  <dt>Shop</dt>
                                  <dd>
                                    {comparable.shopName
                                      || "Nearby pawn shop"}
                                  </dd>
                                </div>
                              </dl>
                            </article>
                          ),
                        )}
                      </div>
                    )
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="item-detail-price-state">
              <strong>Local pricing is unavailable</strong>
              <span>No comparison response was returned.</span>
            </div>
          )}
        </section>

        <form
          id="item-offer-form"
          ref={offerFormRef}
          className="item-detail-offer-card"
          onSubmit={handleOfferSubmit}
        >
          <div className="item-detail-section-title">
            <span>Make offer</span>
            <h2>Send an offer to the shop</h2>
            <p>
              Submit your best offer. The shop can accept, reject, or counter.
            </p>
          </div>

          <fieldset
            className="item-detail-fulfillment"
            aria-describedby="item-fulfillment-note"
          >
            <legend>How would you like to get this item?</legend>
            <div className="item-detail-fulfillment-options">
              <label className={fulfillmentPreference === "pickup" ? "selected" : undefined}>
                <input
                  type="radio"
                  name="fulfillment-preference"
                  value="pickup"
                  checked={fulfillmentPreference === "pickup"}
                  onChange={() => handleFulfillmentPreferenceChange("pickup")}
                />
                <span className="item-detail-fulfillment-copy">
                  <strong>Pick up at shop</strong>
                  <small>Arrange pickup directly with the pawn shop.</small>
                </span>
              </label>
              <label className={fulfillmentPreference === "shipping" ? "selected" : undefined}>
                <input
                  type="radio"
                  name="fulfillment-preference"
                  value="shipping"
                  checked={fulfillmentPreference === "shipping"}
                  onChange={() => handleFulfillmentPreferenceChange("shipping")}
                />
                <span className="item-detail-fulfillment-copy">
                  <strong>Ask about shipping</strong>
                  <small>Request only — the shop must confirm availability, price, and timing.</small>
                </span>
              </label>
              <label className={fulfillmentPreference === "local-delivery" ? "selected" : undefined}>
                <input
                  type="radio"
                  name="fulfillment-preference"
                  value="local-delivery"
                  checked={fulfillmentPreference === "local-delivery"}
                  onChange={() => handleFulfillmentPreferenceChange("local-delivery")}
                />
                <span className="item-detail-fulfillment-copy">
                  <strong>Ask about local delivery</strong>
                  <small>Request only — the shop must confirm availability, price, service area, and timing.</small>
                </span>
              </label>
            </div>
            <p id="item-fulfillment-note" className="item-detail-fulfillment-note">
              Shipping and local delivery are requests only until the shop confirms availability, cost, and timing.
            </p>
          </fieldset>

          <label>
            <span>Offer amount</span>
            <input
              ref={offerAmountInputRef}
              type="number"
              min="0.01"
              step="0.01"
              required
              value={offerAmount}
              onChange={(event) => {
                setOfferAmount(event.target.value);
                clearOfferFeedbackForEdit();
              }}
              placeholder={suggestedOffer ? `$${suggestedOffer}` : "$100"}
              inputMode="decimal"
              aria-invalid={hasAmountValidationError}
              aria-describedby={
                offerFeedback
                  ? "item-offer-feedback"
                  : undefined
              }
            />
          </label>

          <label>
            <span>Message</span>
            <textarea
              ref={offerMessageInputRef}
              value={offerMessage}
              onChange={(event) => {
                setOfferMessage(event.target.value);
                clearOfferFeedbackForEdit();
              }}
              placeholder="Optional message to the shop..."
              rows={4}
            />
          </label>

          {offerFeedback ? (
            <div
              id="item-offer-feedback"
              className={`item-detail-offer-feedback ${offerFeedback.kind}`}
              role={
                offerFeedback.kind === "error"
                  ? "alert"
                  : "status"
              }
              aria-live="polite"
            >
              {offerFeedback.message}
            </div>
          ) : null}

          <button
            type="submit"
            className="item-detail-offer-submit"
            disabled={submittingOffer}
            aria-label={
              submittingOffer
                ? "Sending offer"
                : "Send offer to shop"
            }
          >
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
            <div
              className="item-detail-map-user"
              role="img"
              aria-label="Shop location marker"
            >
              <span
                className="item-detail-map-pin"
                aria-hidden="true"
              />
              <strong aria-hidden="true">
                Shop location
              </strong>
            </div>
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

          <div className="item-detail-confidence-actions" role="group" aria-label="Buyer confidence actions">
            <button
              type="button"
              onClick={() => focusOfferMessage("I have a question about the item condition.")}
            >
              Ask about condition
            </button>
            <button type="button" onClick={handleSaveItem} disabled={savingWatchlist}>
              {savingWatchlist ? "Saving..." : "Save to watchlist"}
            </button>
            <button
              type="button"
              onClick={() => focusOfferMessage("Please confirm pickup requirements and available pickup times.")}
            >
              Discuss pickup
            </button>
            <Link to="/buyer/help">Buyer protection help</Link>
          </div>

          <fieldset className="item-detail-buyer-checklist">
            <legend>Before making an offer</legend>
            <p className="item-detail-checklist-note">
              Optional review checklist. You can make an offer at any time.
            </p>
            <p className="item-detail-checklist-progress" aria-live="polite">
              {reviewedChecklistCount} of {buyerChecklistItems.length} reviewed
            </p>
            <div className="item-detail-checklist-options">
              {buyerChecklistItems.map((label, index) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={buyerChecklist[index]}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setBuyerChecklist((current) => current.map((value, itemIndex) => (
                        itemIndex === index ? checked : value
                      )));
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {isBuyerChecklistComplete ? (
              <div
                className="item-detail-checklist-complete"
                role="status"
                aria-live="polite"
              >
                <span className="item-detail-checklist-complete-icon" aria-hidden="true">
                  ✓
                </span>
                <div className="item-detail-checklist-complete-copy">
                  <h3>Review complete</h3>
                  <p>You are ready to continue with your offer.</p>
                </div>
                <button
                  type="button"
                  className="item-detail-checklist-continue"
                  aria-controls="item-offer-form"
                  onClick={focusOfferAmount}
                >
                  Continue to make offer
                </button>
              </div>
            ) : null}
          </fieldset>
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

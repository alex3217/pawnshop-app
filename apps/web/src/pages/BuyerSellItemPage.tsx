import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  acceptBuyerItemSubmissionOffer,
  createBuyerItemSubmission,
  getMyBuyerItemSubmissionOffers,
  getMyBuyerItemSubmissions,
  rejectBuyerItemSubmissionOffer,
  scanBuyerItemSubmission,
  type BuyerItemScanResult,
  type BuyerItemSubmission,
  type BuyerItemSubmissionOffer,
} from "../services/buyerItemSubmissions";
import {
  createMarketplaceListing,
} from "../services/marketplaceListings";
import "../styles/buyer-sell-item.css";

type BuyerItemIntent = "PAWN_OFFERS" | "MARKETPLACE_LISTING" | "BOTH";

type DraftSubmission = {
  title: string;
  category: string;
  condition: string;
  estimatedValue: string;
  description: string;
  intent: BuyerItemIntent;
  radius: string;
  photos: string[];
};

function intentLabel(intent: BuyerItemIntent | string) {
  if (intent === "PAWN_OFFERS") {
    return "Get pawnshop offers";
  }

  if (intent === "MARKETPLACE_LISTING") {
    return "Create customer marketplace draft";
  }

  return "Pawn offers + marketplace draft";
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount) || amount <= 0) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function firstImage(images?: string[]) {
  return Array.isArray(images) && images.length ? images[0] : "";
}

function parseMoney(
  value: string | number | null | undefined,
) {
  const normalized = String(
    value ?? "",
  )
    .replace(/[$,]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const amount = Number(
    normalized,
  );

  return Number.isFinite(amount) &&
    amount > 0
    ? amount
    : null;
}

type BarcodeDetection = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect(
    source: HTMLVideoElement,
  ): Promise<BarcodeDetection[]>;
};

type BarcodeDetectorConstructor =
  new (options?: {
    formats?: string[];
  }) => BarcodeDetectorInstance;

function getDetectorCtor():
  BarcodeDetectorConstructor |
  null {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  return (
    window as typeof window & {
      BarcodeDetector?:
        BarcodeDetectorConstructor;
    }
  ).BarcodeDetector ?? null;
}

export default function BuyerSellItemPage() {
  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );

  const streamRef =
    useRef<MediaStream | null>(
      null,
    );

  const intervalRef =
    useRef<number | null>(
      null,
    );

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [condition, setCondition] = useState("Good");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<BuyerItemIntent>("PAWN_OFFERS");
  const [radius, setRadius] = useState("25");
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const [scanCode, setScanCode] =
    useState("");

  const [scanResult, setScanResult] =
    useState<BuyerItemScanResult | null>(
      null,
    );

  const [scanning, setScanning] =
    useState(false);

  const [cameraActive, setCameraActive] =
    useState(false);

  const [cameraMessage, setCameraMessage] =
    useState("");

  const [mySubmissions, setMySubmissions] = useState<BuyerItemSubmission[]>([]);
  const [mySubmissionOffers, setMySubmissionOffers] = useState<BuyerItemSubmissionOffer[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actioningOfferId, setActioningOfferId] = useState<string | null>(null);
  const [submittedDraft, setSubmittedDraft] = useState<DraftSubmission | null>(null);

  const wantsPawnOffers =
    intent !==
    "MARKETPLACE_LISTING";

  const wantsMarketplace =
    intent !==
    "PAWN_OFFERS";

  const scanDestination =
    intent ===
    "PAWN_OFFERS"
      ? "CUSTOMER_PAWN"
      : "CUSTOMER_MARKETPLACE";

  const marketplacePrice =
    useMemo(
      () =>
        parseMoney(
          estimatedValue,
        ),
      [
        estimatedValue,
      ],
    );

  const barcodeSupported =
    useMemo(
      () =>
        Boolean(
          getDetectorCtor(),
        ),
      [],
    );

  const canSubmit =
    useMemo(
      () =>
        Boolean(
          title.trim() &&
          category.trim() &&
          condition.trim() &&
          photoPreviews.length > 0,
        ) &&
        (
          !wantsMarketplace ||
          marketplacePrice !==
            null
        ),
      [
        title,
        category,
        condition,
        photoPreviews.length,
        wantsMarketplace,
        marketplacePrice,
      ],
    );

  const stopCamera =
    useCallback(
      () => {
        if (
          intervalRef.current
        ) {
          window.clearInterval(
            intervalRef.current,
          );

          intervalRef.current =
            null;
        }

        if (
          streamRef.current
        ) {
          for (
            const track
            of streamRef.current.getTracks()
          ) {
            track.stop();
          }

          streamRef.current =
            null;
        }

        if (
          videoRef.current
        ) {
          videoRef.current.srcObject =
            null;
        }

        setCameraActive(
          false,
        );
      },
      [],
    );

  async function loadActivity() {
    setLoadingActivity(true);

    try {
      const [submissions, offers] = await Promise.all([
        getMyBuyerItemSubmissions(),
        getMyBuyerItemSubmissionOffers(),
      ]);

      setMySubmissions(submissions);
      setMySubmissionOffers(offers);
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to load your item submissions.",
      );
    } finally {
      setLoadingActivity(false);
    }
  }

  useEffect(() => {
    void loadActivity();

    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  function handlePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const readers = files.slice(0, 6).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Failed to preview photo."));
          reader.readAsDataURL(file);
        }),
    );

    Promise.all(readers)
      .then((nextPreviews) => {
        setPhotoPreviews((current) => [...current, ...nextPreviews].slice(0, 6));
        setNotice(null);
      })
      .catch((err) => {
        setNotice(err instanceof Error ? err.message : "Failed to preview photos.");
      });
  }

  function removePhoto(index: number) {
    setPhotoPreviews((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function applyCustomerScan(
    result: BuyerItemScanResult,
  ) {
    setScanResult(
      result,
    );

    setScanCode(
      result.data.code,
    );

    if (
      result.data.title
    ) {
      setTitle(
        result.data.title,
      );
    }

    if (
      result.data.description
    ) {
      setDescription(
        result.data.description,
      );
    }

    if (
      result.data.category
    ) {
      setCategory(
        result.data.category,
      );
    }

    if (
      result.data.condition
    ) {
      setCondition(
        result.data.condition,
      );
    }

    const nextValue =
      result.data.estimatedValue ??
      result.data.price;

    if (
      nextValue !==
        undefined &&
      nextValue !==
        null &&
      String(
        nextValue,
      ).trim()
    ) {
      setEstimatedValue(
        String(
          nextValue,
        ),
      );
    }

    if (
      result.data.images.length
    ) {
      setPhotoPreviews(
        (current) =>
          current.length
            ? current
            : result.data.images.slice(
                0,
                6,
              ),
      );
    }

    setNotice(
      result.data.reviewRequired
        ? "Scan prefill loaded. Manual intake review is required before publishing this item."
        : "Scan prefill loaded. Review the item details and photos before continuing.",
    );
  }

  async function resolveCustomerScan(
    nextCode = scanCode,
    intakeSource:
      | "MANUAL"
      | "CAMERA" =
      "MANUAL",
  ) {
    const normalizedCode =
      String(
        nextCode ||
        "",
      ).trim();

    if (
      !normalizedCode
    ) {
      setNotice(
        "Enter or scan a barcode, UPC, QR code, SKU, or serial number.",
      );

      return;
    }

    setScanning(
      true,
    );

    setCameraMessage(
      "",
    );

    try {
      const result =
        await scanBuyerItemSubmission({
          code:
            normalizedCode,

          destination:
            scanDestination,

          intakeSource,

          title:
            title.trim() ||
            undefined,

          description:
            description.trim() ||
            undefined,

          category,
          condition,

          estimatedValue:
            marketplacePrice ??
            undefined,

          images:
            photoPreviews,
        });

      applyCustomerScan(
        result,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Customer item scan failed.",
      );
    } finally {
      setScanning(
        false,
      );
    }
  }

  async function handleCustomerScanSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    await resolveCustomerScan();
  }

  async function startCameraScan() {
    setNotice(
      null,
    );

    setCameraMessage(
      "",
    );

    const BarcodeDetectorCtor =
      getDetectorCtor();

    if (
      !BarcodeDetectorCtor
    ) {
      setCameraMessage(
        "Camera barcode detection is not supported in this browser. Use the manual scan field.",
      );

      return;
    }

    if (
      !navigator.mediaDevices
        ?.getUserMedia
    ) {
      setCameraMessage(
        "Camera access is unavailable. Use the manual scan field.",
      );

      return;
    }

    try {
      stopCamera();

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal:
                "environment",
            },
          },

          audio:
            false,
        });

      streamRef.current =
        stream;

      if (
        videoRef.current
      ) {
        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();
      }

      const detector =
        new BarcodeDetectorCtor({
          formats: [
            "qr_code",
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
          ],
        });

      setCameraActive(
        true,
      );

      setCameraMessage(
        "Camera scanner active. Point the rear camera at a barcode or QR code.",
      );

      intervalRef.current =
        window.setInterval(
          async () => {
            if (
              !videoRef.current
            ) {
              return;
            }

            try {
              const detections =
                await detector.detect(
                  videoRef.current,
                );

              const rawValue =
                String(
                  detections?.[0]
                    ?.rawValue ||
                  "",
                ).trim();

              if (
                rawValue
              ) {
                stopCamera();

                setScanCode(
                  rawValue,
                );

                await resolveCustomerScan(
                  rawValue,
                  "CAMERA",
                );
              }
            } catch {
              // Video frames may not be ready yet.
            }
          },
          650,
        );
    } catch (error) {
      stopCamera();

      setCameraMessage(
        "",
      );

      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to start camera scanner.",
      );
    }
  }

  function clearCustomerScan() {
    stopCamera();

    setScanCode(
      "",
    );

    setScanResult(
      null,
    );

    setCameraMessage(
      "",
    );

    setNotice(
      null,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      setNotice(
        wantsMarketplace &&
          marketplacePrice === null
          ? "Add at least one photo and enter a valid marketplace price greater than $0."
          : "Add at least one photo, a title, category, and condition before submitting.",
      );

      return;
    }

    const draft: DraftSubmission = {
      title: title.trim(),
      category,
      condition,
      estimatedValue,
      description: description.trim(),
      intent,
      radius,
      photos: photoPreviews,
    };

    try {
      setSubmitting(true);
      setNotice(null);

      let pawnRequestCreated =
        false;

      let marketplaceListingId =
        "";

      const failures:
        string[] =
        [];

      if (
        wantsPawnOffers
      ) {
        try {
          await createBuyerItemSubmission({
            title:
              draft.title,

            category:
              draft.category,

            condition:
              draft.condition,

            estimatedValue:
              marketplacePrice !==
                null
                ? String(
                    marketplacePrice,
                  )
                : undefined,

            description:
              draft.description,

            intent:
              draft.intent,

            radiusMiles:
              Number(
                draft.radius,
              ) ||
              25,

            images:
              draft.photos,
          });

          pawnRequestCreated =
            true;
        } catch (error) {
          failures.push(
            error instanceof Error
              ? `Pawn-offer request: ${error.message}`
              : "Pawn-offer request failed.",
          );
        }
      }

      if (
        wantsMarketplace &&
        marketplacePrice !==
          null
      ) {
        try {
          const listing =
            await createMarketplaceListing({
              listingType:
                "CUSTOMER_TO_CUSTOMER",

              title:
                draft.title,

              description:
                draft.description ||
                null,

              category:
                draft.category,

              condition:
                draft.condition,

              price:
                marketplacePrice,

              currency:
                "USD",

              quantity:
                1,

              images:
                draft.photos,

              allowOffers:
                true,

              pickupAvailable:
                true,

              shippingAvailable:
                false,

              metadata: {
                workflow:
                  "customer-scan-marketplace-listing-v1",

                source:
                  scanResult
                    ? "buyer-sell-item-scan"
                    : "buyer-sell-item",

                scanCode:
                  scanResult?.data.code ||
                  null,

                scanCodeType:
                  scanResult?.data.codeType ||
                  null,

                intakeId:
                  scanResult?.data.intakeId ||
                  null,

                intakeStatus:
                  scanResult?.data.intakeStatus ||
                  null,

                duplicateStatus:
                  scanResult?.data.duplicateStatus ||
                  null,

                screeningStatus:
                  scanResult?.data.screeningStatus ||
                  null,

                reviewRequired:
                  scanResult?.data.reviewRequired ||
                  false,
              },
            });

          marketplaceListingId =
            listing.id;
        } catch (error) {
          failures.push(
            error instanceof Error
              ? `Marketplace draft: ${error.message}`
              : "Marketplace draft creation failed.",
          );
        }
      }

      if (
        !pawnRequestCreated &&
        !marketplaceListingId
      ) {
        throw new Error(
          failures.join(
            " ",
          ) ||
          "No item workflow was created.",
        );
      }

      setSubmittedDraft(
        draft,
      );

      const messages:
        string[] =
        [];

      if (
        pawnRequestCreated
      ) {
        messages.push(
          "Pawnshop offer request submitted.",
        );
      }

      if (
        marketplaceListingId
      ) {
        messages.push(
          `Customer marketplace draft ${marketplaceListingId} created.`,
        );
      }

      if (
        scanResult?.data.reviewRequired &&
        marketplaceListingId
      ) {
        messages.push(
          "Manual intake review is required before publishing the marketplace draft.",
        );
      }

      if (
        failures.length
      ) {
        messages.push(
          `Some actions need attention: ${failures.join(" ")}`,
        );
      }

      setNotice(
        messages.join(
          " ",
        ),
      );

      if (
        pawnRequestCreated
      ) {
        await loadActivity();
      }
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to create the selected item workflow.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOfferDecision(
    offerId: string,
    action: "accept" | "reject",
  ) {
    try {
      setActioningOfferId(offerId);
      setNotice(null);

      if (action === "accept") {
        await acceptBuyerItemSubmissionOffer(offerId);
        setNotice("Shop offer accepted.");
      } else {
        await rejectBuyerItemSubmissionOffer(offerId);
        setNotice("Shop offer rejected.");
      }

      await loadActivity();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to update offer.");
    } finally {
      setActioningOfferId(null);
    }
  }

  function resetForm() {
    stopCamera();
    setTitle("");
    setCategory("Electronics");
    setCondition("Good");
    setEstimatedValue("");
    setDescription("");
    setIntent("PAWN_OFFERS");
    setRadius("25");
    setPhotoPreviews([]);
    setScanCode("");
    setScanResult(null);
    setCameraMessage("");
    setSubmittedDraft(null);
    setNotice(null);
  }

  return (
    <main className="sellitem-page">
      <section className="sellitem-hero">
        <div className="sellitem-hero-copy">
          <span className="sellitem-pill">Sell / Pawn Item</span>
          <h1>Scan or photograph your item and send it for offers.</h1>
          <p>
            Scan or photograph the item, then request pawnshop offers, create a
            customer-to-customer marketplace draft, or do both.
          </p>

          <div className="sellitem-hero-actions">
            <Link to="/buyer/item-locator">Find similar items</Link>
            <Link to="/marketplace">Browse marketplace</Link>
            <button type="button" onClick={() => void loadActivity()}>
              Refresh offers
            </button>
          </div>
        </div>

        <aside className="sellitem-hero-panel">
          <div>
            <span>Photos</span>
            <strong>{photoPreviews.length}</strong>
            <small>up to 6 previews</small>
          </div>
          <div>
            <span>Requests</span>
            <strong>{mySubmissions.length}</strong>
            <small>submitted items</small>
          </div>
          <div>
            <span>Shop Offers</span>
            <strong>{mySubmissionOffers.length}</strong>
            <small>pawnshop responses</small>
          </div>
          <div>
            <span>Status</span>
            <strong>{submittedDraft ? "Sent" : "New"}</strong>
            <small>owner review workflow</small>
          </div>
        </aside>
      </section>

      <section className="sellitem-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to="/buyer/item-locator">
          Item locator <span>Compare similar items</span>
        </Link>
        <Link to="/offers">
          Offers <span>Track item offers</span>
        </Link>
        <Link to="/watchlist">
          Watchlist <span>Track saved inventory</span>
        </Link>
      </section>

      {notice ? <section className="sellitem-notice">{notice}</section> : null}

      <section className="sellitem-scanner-card">
        <div className="sellitem-section-title">
          <span>Item scanner</span>
          <h2>Scan a barcode, UPC, QR code, SKU, or serial number</h2>
          <p>
            Use your phone camera or enter the code manually. The scan creates a
            customer-scoped intake and prefills the item details below.
          </p>
        </div>

        <form
          className="sellitem-scanner-form"
          onSubmit={handleCustomerScanSubmit}
        >
          <div className="sellitem-scanner-grid">
            <label>
              <span>Manual scan value</span>
              <input
                value={scanCode}
                onChange={(event) => setScanCode(event.target.value)}
                placeholder="Example: 012345678905 or SKU: ABC-123"
                autoComplete="off"
              />
            </label>

            <div className="sellitem-scanner-destination">
              <span>Current destination</span>
              <strong>
                {scanDestination === "CUSTOMER_PAWN"
                  ? "Customer pawn / shop offers"
                  : "Customer marketplace intake"}
              </strong>
            </div>
          </div>

          <div className="sellitem-scanner-actions">
            <button
              type="submit"
              disabled={scanning || !scanCode.trim()}
            >
              {scanning ? "Resolving scan..." : "Resolve scan"}
            </button>

            {cameraActive ? (
              <button
                type="button"
                className="secondary"
                onClick={stopCamera}
              >
                Stop camera
              </button>
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => void startCameraScan()}
                disabled={!barcodeSupported || scanning}
              >
                Start camera scanner
              </button>
            )}

            <button
              type="button"
              className="secondary"
              onClick={clearCustomerScan}
              disabled={!scanCode && !scanResult && !cameraActive}
            >
              Clear scan
            </button>

            <Link to="/marketplace/listings/mine">
              My marketplace listings
            </Link>
          </div>

          <video
            ref={videoRef}
            className={
              cameraActive
                ? "sellitem-scanner-video active"
                : "sellitem-scanner-video"
            }
            muted
            playsInline
            autoPlay
          />

          <p className="sellitem-scanner-message">
            {cameraMessage ||
              (barcodeSupported
                ? "Camera barcode scanning is available in this browser."
                : "Camera barcode detection is unavailable. Manual scan entry still works.")}
          </p>

          {scanResult ? (
            <div className="sellitem-scanner-result">
              <strong>Scan prefill loaded</strong>
              <span>Code: {scanResult.data.code}</span>
              <span>Type: {scanResult.data.codeType}</span>
              <span>Intake ID: {scanResult.data.intakeId}</span>
              <span>Status: {scanResult.data.intakeStatus}</span>

              {scanResult.data.reviewRequired ? (
                <small className="sellitem-scanner-warning">
                  Manual intake review is required before this item should be
                  published.
                </small>
              ) : (
                <small>
                  Review the prefilled fields and add clear item photos.
                </small>
              )}
            </div>
          ) : null}
        </form>
      </section>

      <section className="sellitem-layout">
        <form className="sellitem-form" onSubmit={handleSubmit}>
          <div className="sellitem-section-title">
            <span>Item details</span>
            <h2>Tell shops what you have</h2>
            <p>
              Clear photos and details help pawnshop owners respond faster with realistic offers.
            </p>
          </div>

          <label className="sellitem-upload-box">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handlePhotos}
            />
            <strong>Take or upload photos</strong>
            <span>Use your phone camera or select up to 6 item photos.</span>
          </label>

          {photoPreviews.length ? (
            <div className="sellitem-photo-grid">
              {photoPreviews.map((src, index) => (
                <div key={src.slice(0, 40) + index} className="sellitem-photo">
                  <img src={src} alt={`Item preview ${index + 1}`} />
                  <button type="button" onClick={() => removePhoto(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="sellitem-field-grid">
            <label>
              <span>Item title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: PS5 console bundle"
              />
            </label>

            <label>
              <span>Estimated value</span>
              <input
                value={estimatedValue}
                onChange={(event) => setEstimatedValue(event.target.value)}
                placeholder="$300"
                inputMode="decimal"
              />
            </label>

            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>Electronics</option>
                <option>Jewelry</option>
                <option>Tools</option>
                <option>Watches</option>
                <option>Gaming</option>
                <option>Collectibles</option>
                <option>Musical Instruments</option>
                <option>Other</option>
              </select>
            </label>

            <label>
              <span>Condition</span>
              <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                <option>New</option>
                <option>Like New</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Needs Repair</option>
                <option>Not Sure</option>
              </select>
            </label>

            <label>
              <span>What do you want?</span>
              <select
                value={intent}
                onChange={(event) => {
                  setIntent(
                    event.target.value as BuyerItemIntent,
                  );

                  setScanResult(null);
                  setCameraMessage("");
                }}
              >
                <option value="PAWN_OFFERS">Get pawnshop offers</option>
                <option value="MARKETPLACE_LISTING">
                  Create customer marketplace draft
                </option>
                <option value="BOTH">
                  Pawn offers + marketplace draft
                </option>
              </select>
            </label>

            <label>
              <span>Offer radius</span>
              <select value={radius} onChange={(event) => setRadius(event.target.value)}>
                <option value="10">10 miles</option>
                <option value="25">25 miles</option>
                <option value="50">50 miles</option>
                <option value="100">100 miles</option>
              </select>
            </label>
          </div>

          <label className="sellitem-textarea-label">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Include brand, model, serial/accessory notes, condition issues, and anything a shop should know."
              rows={5}
            />
          </label>

          <div className="sellitem-actions">
            <button type="submit" disabled={submitting || !canSubmit}>
              {submitting
                ? "Saving workflow..."
                : intent === "PAWN_OFFERS"
                  ? "Submit for pawnshop offers"
                  : intent === "MARKETPLACE_LISTING"
                    ? "Create marketplace draft"
                    : "Submit offers request + draft"}
            </button>
            <button type="button" className="secondary" onClick={resetForm}>
              Reset
            </button>
          </div>
        </form>

        <aside className="sellitem-side-panel">
          <section className="sellitem-preview-card">
            <div className="sellitem-section-title">
              <span>Preview</span>
              <h2>Submission summary</h2>
            </div>

            <div className="sellitem-preview-media">
              {photoPreviews[0] ? <img src={photoPreviews[0]} alt="Item preview" /> : <span>No photo yet</span>}
            </div>

            <div className="sellitem-summary-list">
              <div>
                <span>Title</span>
                <strong>{title || "Not entered"}</strong>
              </div>
              <div>
                <span>Category</span>
                <strong>{category}</strong>
              </div>
              <div>
                <span>Condition</span>
                <strong>{condition}</strong>
              </div>
              <div>
                <span>Estimated value</span>
                <strong>{estimatedValue || "Not entered"}</strong>
              </div>
              <div>
                <span>Intent</span>
                <strong>{intentLabel(intent)}</strong>
              </div>
            </div>
          </section>

          <section className="sellitem-next-card">
            <div className="sellitem-section-title">
              <span>Shop offers</span>
              <h2>Pawnshop responses</h2>
              <p>
                Review offers from shops and accept or reject them from here.
              </p>
            </div>

            {loadingActivity ? (
              <div className="sellitem-flow-list">
                <div>Loading your submissions and shop offers...</div>
              </div>
            ) : mySubmissionOffers.length === 0 ? (
              <div className="sellitem-flow-list">
                <div>No shop offers yet.</div>
                <div>Submit an item request and nearby shops can respond.</div>
              </div>
            ) : (
              <div className="sellitem-flow-list">
                {mySubmissionOffers.map((offer) => (
                  <div key={offer.id}>
                    <strong>{offer.shop?.name || "Pawnshop"}</strong>
                    <span>{formatMoney(offer.amount)} · {offer.status}</span>
                    <small>{offer.submission?.title || "Submitted item"}</small>
                    {offer.message ? <small>{offer.message}</small> : null}

                    {String(offer.status || "").toUpperCase() === "PENDING" ? (
                      <div className="sellitem-mini-actions">
                        <button
                          type="button"
                          disabled={actioningOfferId === offer.id}
                          onClick={() => void handleOfferDecision(offer.id, "accept")}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={actioningOfferId === offer.id}
                          onClick={() => void handleOfferDecision(offer.id, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sellitem-next-card">
            <div className="sellitem-section-title">
              <span>My submissions</span>
              <h2>Submitted items</h2>
            </div>

            <div className="sellitem-flow-list">
              {mySubmissions.length === 0 ? (
                <div>No submitted items yet.</div>
              ) : (
                mySubmissions.slice(0, 5).map((submission) => (
                  <div key={submission.id}>
                    {firstImage(submission.images) ? (
                      <img
                        src={firstImage(submission.images)}
                        alt={submission.title}
                        style={{
                          width: "100%",
                          height: 120,
                          objectFit: "cover",
                          borderRadius: 12,
                          marginBottom: 8,
                        }}
                      />
                    ) : null}
                    <strong>{submission.title}</strong>
                    <span>{submission.status} · {intentLabel(submission.intent)}</span>
                    <small>{submission.category || "Category not listed"}</small>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

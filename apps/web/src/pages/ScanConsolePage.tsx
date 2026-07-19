import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  markItemSold,
  scanItem,
  type ScanIntakeDestination,
  type ScanIntakeSource,
  type ScanPayload,
  type ScanResult,
} from "../services/items";
import {
  searchItemIntakeCustomers,
  type ItemIntakeCustomer,
} from "../services/itemIntakes";
import { getMyShops, type Shop } from "../services/shops";
import "../styles/scan-console.css";

function toQueryValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function getPayload(result: ScanResult | null): ScanPayload | null {
  return (result?.data as ScanPayload | undefined) || null;
}

function getResultItem(result: ScanResult | null) {
  return getPayload(result)?.item || null;
}

type BarcodeDetection = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetection[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

function getDetectorCtor(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;

  return (
    window as typeof window & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector ?? null;
}

function getResultTitle(result: ScanResult | null, code: string) {
  const payload = getPayload(result);
  const item = payload?.item;

  return (
    item?.title ||
    payload?.title ||
    (code ? `Scanned Item ${code.toUpperCase()}` : "Scan result")
  );
}

function getResultMeta(result: ScanResult | null) {
  const payload = getPayload(result);
  const item = payload?.item;

  return {
    source: payload?.source || (item ? "existing-item-match" : "scan-console"),
    price: item?.price ?? payload?.price ?? "—",
    category: item?.category ?? payload?.category ?? "—",
    condition: item?.condition ?? payload?.condition ?? "—",
  };
}

function getIntakeMeta(result: ScanResult | null) {
  const payload = getPayload(result);
  const intake = result?.intake;

  const status = intake?.status || payload?.intakeStatus || "—";
  const duplicateStatus =
    intake?.duplicateStatus || payload?.duplicateStatus || "—";

  return {
    id: intake?.id || payload?.intakeId || "—",
    source: intake?.source || "—",
    destination: intake?.destination || payload?.destination || "—",
    status,
    duplicateStatus,
    screeningStatus:
      intake?.screeningStatus || payload?.screeningStatus || "—",
    codeType: intake?.codeType || payload?.codeType || "—",
    needsReview:
      status === "NEEDS_REVIEW" ||
      duplicateStatus === "MATCH_FOUND" ||
      duplicateStatus === "REVIEW_REQUIRED",
  };
}

type DestinationGuidance = {
  title: string;
  description: string;
  steps: string[];
};

function getDestinationGuidance(
  destination: ScanIntakeDestination,
): DestinationGuidance {
  switch (destination) {
    case "CUSTOMER_SELL":
      return {
        title: "Customer sell workflow",
        description:
          "Connect the scanned item to a customer and publish it as a sell request for shop offers.",
        steps: [
          "Choose the shop/location handling the request.",
          "Search for and select the customer.",
          "Scan with the camera or enter the item code manually.",
          "Review and approve the intake in the review queue.",
          "Publish it as a customer sell request so shops can send sell offers.",
        ],
      };

    case "CUSTOMER_PAWN":
      return {
        title: "Customer pawn workflow",
        description:
          "Connect the scanned item to a customer and publish it as a pawn request for shop offers.",
        steps: [
          "Choose the shop/location handling the request.",
          "Search for and select the customer.",
          "Scan with the camera or enter the pawn tag or item code manually.",
          "Review and approve the intake in the review queue.",
          "Publish it as a customer pawn request so shops can send pawn offers.",
        ],
      };

    case "CUSTOMER_MARKETPLACE":
      return {
        title: "Customer marketplace workflow",
        description:
          "Capture the item, complete review, and prepare a prefilled shop-managed marketplace draft.",
        steps: [
          "Choose the shop/location handling the intake.",
          "Scan with the camera or enter the item code manually.",
          "Review duplicate and screening results.",
          "Open the intake in the review queue when manual review is required.",
          "Open the prefilled marketplace form and save the listing as a draft.",
        ],
      };

    case "DEALER_LISTING":
      return {
        title: "Dealer listing workflow",
        description:
          "Capture dealer inventory information and prepare a shop-to-shop listing draft.",
        steps: [
          "Choose the shop/location handling the dealer item.",
          "Scan with the camera or enter the item code manually.",
          "Review duplicate and screening results.",
          "Open and review the intake record when required.",
          "Open the prefilled dealer listing form and save the listing as a draft.",
        ],
      };

    case "SHOP_TRANSFER":
      return {
        title: "Shop transfer workflow",
        description:
          "Capture an item that will move between shop locations.",
        steps: [
          "Choose the shop/location currently handling the item.",
          "Scan with the camera or enter the item code manually.",
          "Confirm the item and duplicate results.",
          "Open the intake in the review queue.",
          "Keep it in review until transfer publishing is available.",
        ],
      };

    case "SHOP_INVENTORY":
    default:
      return {
        title: "Shop inventory workflow",
        description:
          "Scan, review, and publish an available item into the selected shop's inventory.",
        steps: [
          "Choose the shop/location.",
          "Scan with the camera or enter the item code manually.",
          "Review duplicate and screening results.",
          "Approve the intake in the review queue.",
          "Publish the item to the shop's marketplace inventory.",
        ],
      };
  }
}

export default function ScanConsolePage() {
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [code, setCode] = useState("");
  const [scanSource, setScanSource] =
    useState<ScanIntakeSource>("MANUAL");
  const [destination, setDestination] =
    useState<ScanIntakeDestination>("SHOP_INVENTORY");

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<
    ItemIntakeCustomer[]
  >([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<ItemIntakeCustomer | null>(null);
  const [customerSearching, setCustomerSearching] =
    useState(false);
  const [customerSearchMessage, setCustomerSearchMessage] =
    useState("");

  const [result, setResult] = useState<ScanResult | null>(null);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingShops, setLoadingShops] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [selling, setSelling] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");

  const item = useMemo(() => getResultItem(result), [result]);
  const resultTitle = useMemo(() => getResultTitle(result, code), [result, code]);
  const resultMeta = useMemo(() => getResultMeta(result), [result]);
  const intakeMeta = useMemo(() => getIntakeMeta(result), [result]);

  const customerRequired =
    destination === "CUSTOMER_SELL" ||
    destination === "CUSTOMER_PAWN";

  const marketplaceDraftAvailable =
    destination === "SHOP_INVENTORY" ||
    destination === "CUSTOMER_MARKETPLACE" ||
    destination === "DEALER_LISTING";

  const destinationGuidance = useMemo(
    () => getDestinationGuidance(destination),
    [destination],
  );

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === shopId) || null,
    [shopId, shops],
  );

  const barcodeSupported = useMemo(() => Boolean(getDetectorCtor()), []);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }

      streamRef.current = null;
    }

    setCameraActive(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadShops() {
      setLoadingShops(true);
      setErr("");

      try {
        const rows = await getMyShops(controller.signal);
        setShops(rows);
        setShopId((current) => current || rows[0]?.id || "");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErr(error instanceof Error ? error.message : "Failed to load shops.");
      } finally {
        setLoadingShops(false);
      }
    }

    void loadShops();

    return () => {
      controller.abort();
      stopCamera();
    };
  }, [stopCamera]);

  async function searchCustomers() {
    const normalizedQuery = String(
      customerQuery || "",
    ).trim();

    setCustomerResults([]);
    setCustomerSearchMessage("");

    if (normalizedQuery.length < 2) {
      setCustomerSearchMessage(
        "Enter at least two characters of the customer name or email.",
      );
      return;
    }

    setCustomerSearching(true);
    setErr("");

    try {
      const result = await searchItemIntakeCustomers(
        normalizedQuery,
      );

      setCustomerResults(result.rows);

      if (result.rows.length === 0) {
        setCustomerSearchMessage(
          "No active customer accounts matched this search.",
        );
      }
    } catch (error) {
      setErr(
        error instanceof Error
          ? error.message
          : "Failed to search customers.",
      );
    } finally {
      setCustomerSearching(false);
    }
  }

  async function resolveCode(
    nextCode = code,
    sourceOverride: ScanIntakeSource = scanSource,
  ) {
    const normalizedCode = String(nextCode || "").trim();

    setErr("");
    setSuccess("");
    setResult(null);

    if (!shopId) {
      setErr("Choose a shop before scanning.");
      return;
    }

    if (!normalizedCode) {
      setErr("Enter or scan a barcode, QR code, SKU, or item code.");
      return;
    }

    if (customerRequired && !selectedCustomer?.id) {
      setErr(
        "Search for and select a customer before recording this sell or pawn intake.",
      );
      return;
    }

    setResolving(true);

    try {
      const data = await scanItem({
        shopId,
        code: normalizedCode,
        intakeSource: sourceOverride,
        destination,
        customerId: customerRequired
          ? selectedCustomer?.id
          : undefined,
      });

      const nextIntake = getIntakeMeta(data);

      setResult(data);
      setCode(normalizedCode);
      setSuccess(
        nextIntake.needsReview
          ? "Scan recorded. Manual review is required."
          : "Scan recorded successfully.",
      );
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setResolving(false);
    }
  }

  async function resolveScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await resolveCode();
  }

  async function markSold() {
    if (!item?.id) return;

    setSelling(true);
    setErr("");
    setSuccess("");

    try {
      const data = await markItemSold(item.id);
      setResult((prev) => ({
        ...(prev || {}),
        sold: data,
      }));
      setSuccess("Item marked sold.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Sell action failed.");
    } finally {
      setSelling(false);
    }
  }

  function openCreateItemWithPrefill() {
    const payload = getPayload(result);
    if (!payload) return;

    const sourceItem = payload.item ?? payload;

    const params = new URLSearchParams({
      shopId: toQueryValue(sourceItem.pawnShopId || shopId),
      title: toQueryValue(sourceItem.title),
      description: toQueryValue(sourceItem.description),
      price: toQueryValue(sourceItem.price),
      category: toQueryValue(sourceItem.category),
      condition: toQueryValue(sourceItem.condition),
      code: toQueryValue(payload.code || code),
      source: toQueryValue(payload.source || "scan-console"),
    });

    navigate(`/owner/items/new?${params.toString()}`);
  }

  function openCreateMarketplaceListingWithPrefill() {
    const payload = getPayload(result);
    if (!payload) return;

    const sourceItem = payload.item ?? payload;

    const listingType =
      destination === "DEALER_LISTING"
        ? "SHOP_TO_SHOP"
        : "SHOP_TO_CUSTOMER";

    const params = new URLSearchParams({
      listingType,
      sellerShopId: toQueryValue(
        sourceItem.pawnShopId ||
        shopId,
      ),
      itemId: toQueryValue(
        payload.item?.id,
      ),
      title: toQueryValue(
        sourceItem.title,
      ),
      description: toQueryValue(
        sourceItem.description,
      ),
      price: toQueryValue(
        sourceItem.price,
      ),
      category: toQueryValue(
        sourceItem.category,
      ),
      condition: toQueryValue(
        sourceItem.condition,
      ),
      scanCode: toQueryValue(
        payload.code ||
        code,
      ),
      intakeId: toQueryValue(
        result?.intake?.id ||
        payload.intakeId,
      ),
      reviewRequired:
        intakeMeta.needsReview
          ? "true"
          : "false",
      source: "scan-console",
    });

    for (
      const [
        key,
        value,
      ] of Array.from(
        params.entries(),
      )
    ) {
      if (!value) {
        params.delete(key);
      }
    }

    navigate(
      `/marketplace/listings/new?${params.toString()}`,
    );
  }

  async function startCameraScan() {
    setErr("");
    setSuccess("");
    setCameraMessage("");

    if (!shopId) {
      setErr("Choose a shop before starting the scanner.");
      return;
    }

    const BarcodeDetectorCtor = getDetectorCtor();

    if (!BarcodeDetectorCtor) {
      setCameraMessage(
        "Camera barcode detection is not supported in this browser yet. Use manual scan entry below.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        "Camera access is not available in this browser. Use manual scan entry below.",
      );
      return;
    }

    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new BarcodeDetectorCtor({
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

      setCameraActive(true);
      setCameraMessage("Camera scanner active. Point your phone at a barcode or QR code.");

      intervalRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;

        try {
          const detections = await detector.detect(videoRef.current);
          const first = detections?.[0];
          const rawValue = String(first?.rawValue || "").trim();

          if (rawValue) {
            stopCamera();
            setCode(rawValue);
            await resolveCode(rawValue, "CAMERA");
          }
        } catch {
          // Keep scanning. Some browsers throw while the video frame is not ready.
        }
      }, 650);
    } catch (error) {
      stopCamera();
      setCameraMessage("");
      setErr(
        error instanceof Error
          ? error.message
          : "Unable to start camera scanner.",
      );
    }
  }

  function clearResult() {
    setResult(null);
    setErr("");
    setSuccess("");
    setCode("");
  }

  return (
    <div className="scan-console-page" style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Owner tools</div>
          <h1 style={styles.title}>Mobile Scan Console</h1>
          <p style={styles.subtitle}>
            Scan barcodes, QR codes, SKUs, or pawn tags from a phone camera,
            then find existing inventory or create a prefilled item draft.
          </p>
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            onClick={() =>
              navigate("/owner/item-intakes")
            }
            style={styles.secondaryButton}
          >
            Review intakes
          </button>

          <button
            type="button"
            onClick={() => navigate("/owner/inventory")}
            style={styles.secondaryButton}
          >
            Back to inventory
          </button>
        </div>
      </section>

      {err ? (
        <div style={styles.errorCard}>
          <strong>Scanner alert</strong>
          <p style={styles.messageText}>{err}</p>
        </div>
      ) : null}

      {success ? (
        <div style={styles.successCard}>
          <strong>{success}</strong>
        </div>
      ) : null}

      <section style={styles.grid}>
        <form onSubmit={resolveScan} style={styles.card}>
          <div>
            <div style={styles.sectionLabel}>Scan setup</div>
            <h2 style={styles.sectionTitle}>Choose shop and scan item</h2>
            <p style={styles.sectionText}>
              Select the shop/location where this item belongs. You can use the
              camera scanner or type the code manually.
            </p>
          </div>

          <label style={styles.label}>
            Shop / Location
            <select
              value={shopId}
              onChange={(event) => setShopId(event.target.value)}
              disabled={loadingShops}
              style={styles.input}
            >
              <option value="">
                {loadingShops ? "Loading shops..." : "Choose shop"}
              </option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                  {shop.address ? ` — ${shop.address}` : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedShop ? (
            <div style={styles.shopHint}>
              Active shop: <strong>{selectedShop.name}</strong>
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <label style={styles.label}>
              Manual scan method
              <select
                value={scanSource}
                onChange={(event) =>
                  setScanSource(event.target.value as ScanIntakeSource)
                }
                style={styles.input}
              >
                <option value="MANUAL">Manual entry</option>
                <option value="HARDWARE_SCANNER">
                  USB / Bluetooth scanner
                </option>
              </select>
            </label>

            <label style={styles.label}>
              Intake destination
              <select
                value={destination}
                onChange={(event) => {
                  const nextDestination =
                    event.target
                      .value as ScanIntakeDestination;

                  setDestination(nextDestination);
                  setResult(null);
                  setSuccess("");
                  setErr("");

                  const nextCustomerRequired =
                    nextDestination === "CUSTOMER_SELL" ||
                    nextDestination === "CUSTOMER_PAWN";

                  if (!nextCustomerRequired) {
                    setSelectedCustomer(null);
                    setCustomerQuery("");
                    setCustomerResults([]);
                    setCustomerSearchMessage("");
                  }
                }}
                style={styles.input}
              >
                <option value="SHOP_INVENTORY">Shop inventory</option>
                <option value="CUSTOMER_SELL">Customer selling</option>
                <option value="CUSTOMER_PAWN">Customer pawn request</option>
                <option value="CUSTOMER_MARKETPLACE">
                  Customer marketplace listing
                </option>
                <option value="DEALER_LISTING">Dealer listing</option>
                <option value="SHOP_TRANSFER">Shop transfer</option>
              </select>
            </label>
          </div>

          {customerRequired ? (
            <section style={styles.infoCard}>
              <div>
                <strong>Customer required</strong>
                <p style={styles.messageText}>
                  Search active customer accounts by name or
                  email, then select the customer connected to
                  this {destination === "CUSTOMER_PAWN"
                    ? "pawn request"
                    : "sell intake"}.
                </p>
              </div>

              {selectedCustomer ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginTop: 12,
                    padding: 12,
                    border: "1px solid var(--success)",
                    borderRadius: 12,
                    background: "rgba(34,197,94,0.1)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <strong>Selected customer</strong>
                    <span>{selectedCustomer.name}</span>
                    <span>{selectedCustomer.email}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerQuery("");
                      setCustomerResults([]);
                      setCustomerSearchMessage("");
                    }}
                    disabled={resolving}
                    style={{
                      ...styles.secondaryButton,
                      ...(resolving
                        ? styles.disabledButton
                        : {}),
                    }}
                  >
                    Change customer
                  </button>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, 1fr) auto",
                      gap: 10,
                      marginTop: 12,
                    }}
                  >
                    <input
                      type="search"
                      value={customerQuery}
                      onChange={(event) => {
                        setCustomerQuery(
                          event.target.value,
                        );
                        setCustomerSearchMessage("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void searchCustomers();
                        }
                      }}
                      placeholder="Customer name or email"
                      aria-label="Search customers"
                      autoComplete="off"
                      style={styles.input}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        void searchCustomers()
                      }
                      disabled={
                        customerSearching ||
                        customerQuery.trim().length < 2
                      }
                      style={{
                        ...styles.secondaryButton,
                        ...(customerSearching ||
                        customerQuery.trim().length < 2
                          ? styles.disabledButton
                          : {}),
                      }}
                    >
                      {customerSearching
                        ? "Searching…"
                        : "Search"}
                    </button>
                  </div>

                  {customerSearchMessage ? (
                    <p
                      style={styles.messageText}
                      aria-live="polite"
                    >
                      {customerSearchMessage}
                    </p>
                  ) : null}

                  {customerResults.length > 0 ? (
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        marginTop: 12,
                      }}
                    >
                      {customerResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setCustomerQuery(
                              customer.email,
                            );
                            setCustomerResults([]);
                            setCustomerSearchMessage("");
                            setErr("");
                          }}
                          style={{
                            border:
                              "1px solid var(--border)",
                            background:
                              "var(--bg-elevated)",
                            color: "var(--text)",
                            borderRadius: 12,
                            padding: 12,
                            display: "grid",
                            gap: 4,
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <strong>{customer.name}</strong>
                          <span>{customer.email}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          <div style={styles.cameraBox}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                ...styles.video,
                display: cameraActive ? "block" : "none",
              }}
            />

            {!cameraActive ? (
              <div style={styles.cameraPlaceholder}>
                <div style={styles.cameraIcon}>▣</div>
                <strong>Phone camera scanner</strong>
                <span>
                  {barcodeSupported
                    ? "Camera barcode detection is available in this browser. Manual entry is always available."
                    : "Camera barcode detection is not supported in this browser yet. Manual entry is always available."}
                </span>
              </div>
            ) : null}
          </div>

          {cameraMessage ? (
            <div style={styles.infoCard}>{cameraMessage}</div>
          ) : null}

          <div style={styles.actions}>
            <button
              type="button"
              onClick={startCameraScan}
              disabled={cameraActive || loadingShops}
              style={{
                ...styles.primaryButton,
                ...(cameraActive || loadingShops ? styles.disabledButton : {}),
              }}
            >
              {cameraActive ? "Scanning..." : "Start camera scan"}
            </button>

            {cameraActive ? (
              <button type="button" onClick={stopCamera} style={styles.secondaryButton}>
                Stop camera
              </button>
            ) : null}
          </div>

          <label style={styles.label}>
            Manual barcode / SKU / QR value
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Scan or type code: UPC, SKU, pawn tag, QR..."
              style={styles.input}
            />
          </label>

          <div style={styles.actions}>
            <button
              type="submit"
              disabled={resolving || !shopId || !code.trim()}
              style={{
                ...styles.primaryButton,
                ...(resolving || !shopId || !code.trim()
                  ? styles.disabledButton
                  : {}),
              }}
            >
              {resolving ? "Resolving..." : "Resolve scan"}
            </button>

            <button type="button" onClick={clearResult} style={styles.secondaryButton}>
              Clear
            </button>
          </div>
        </form>

        <aside style={styles.card}>
          <div>
            <div style={styles.sectionLabel}>How it works</div>
            <h2 style={styles.sectionTitle}>
              {destinationGuidance.title}
            </h2>
            <p style={styles.sectionText}>
              {destinationGuidance.description}
            </p>
          </div>

          <ol style={styles.steps}>
            {destinationGuidance.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <div style={styles.infoCard}>
            Scanner access should be limited to staff with inventory write
            permission, such as SHOP_ADMIN or INVENTORY_MANAGER.
          </div>
        </aside>
      </section>

      {result ? (
        <section style={styles.resultCard}>
          <div style={styles.resultHeader}>
            <div>
              <div style={styles.sectionLabel}>Scan result</div>
              <h2 style={styles.resultTitle}>{resultTitle}</h2>
              <p style={styles.sectionText}>
                Source: {resultMeta.source} · Price: {String(resultMeta.price)} ·
                Category: {String(resultMeta.category)} · Condition:{" "}
                {String(resultMeta.condition)}
              </p>
            </div>

            {intakeMeta.needsReview ? (
              <span style={styles.statusPill}>Review required</span>
            ) : item?.id ? (
              <span style={styles.statusPill}>Existing item matched</span>
            ) : (
              <span style={styles.statusPill}>New item draft</span>
            )}
          </div>

          <div style={styles.infoCard}>
            <strong>Persistent intake record</strong>
            <div>
              ID: {intakeMeta.id} · Status: {intakeMeta.status} · Source:{" "}
              {intakeMeta.source}
            </div>
            <div>
              Destination: {intakeMeta.destination} · Code type:{" "}
              {intakeMeta.codeType}
            </div>
            <div>
              Duplicate: {intakeMeta.duplicateStatus} · Screening:{" "}
              {intakeMeta.screeningStatus}
            </div>
          </div>

          {intakeMeta.needsReview ? (
            <div style={styles.errorCard}>
              <strong>Manual review required</strong>
              <p style={styles.messageText}>
                This scan matched a prior intake or existing inventory record.
                Review the item before publishing, transferring, or completing
                a pawn or seller workflow.
              </p>
            </div>
          ) : null}

          <div style={styles.actions}>
            <button
              type="button"
              onClick={openCreateItemWithPrefill}
              style={styles.primaryButton}
            >
              {item?.id ? "Create similar item" : "Create item from scan"}
            </button>

            {marketplaceDraftAvailable ? (
              <button
                type="button"
                onClick={
                  openCreateMarketplaceListingWithPrefill
                }
                style={styles.secondaryButton}
              >
                {destination === "DEALER_LISTING"
                  ? "Create dealer listing draft"
                  : "Create marketplace listing draft"}
              </button>
            ) : null}

            {item?.id ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`/items/${item.id}`)}
                  style={styles.secondaryButton}
                >
                  View existing item
                </button>

                <button
                  type="button"
                  onClick={markSold}
                  disabled={selling}
                  style={{
                    ...styles.dangerButton,
                    ...(selling ? styles.disabledButton : {}),
                  }}
                >
                  {selling ? "Marking sold..." : "Mark SOLD"}
                </button>
              </>
            ) : null}
          </div>

          <details style={styles.details}>
            <summary>View raw scan response</summary>
            <pre style={styles.pre}>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
    color: "var(--text)",
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--primary)",
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 5vw, 3rem)",
    fontWeight: 900,
    color: "var(--text-strong)",
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 760,
    color: "var(--muted)",
    lineHeight: 1.6,
  },
  grid: {
    display: "grid",
    gridTemplateColumns:
      "minmax(280px, 1.4fr) minmax(260px, 0.8fr)",
    gap: 18,
  },
  card: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 18,
    padding: 18,
    display: "grid",
    gap: 16,
    boxShadow: "var(--shadow-soft)",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    color: "var(--primary)",
  },
  sectionTitle: {
    margin: "6px 0 0",
    fontSize: 22,
    fontWeight: 900,
    color: "var(--text-strong)",
  },
  sectionText: {
    margin: "8px 0 0",
    color: "var(--muted)",
    lineHeight: 1.55,
  },
  label: {
    display: "grid",
    gap: 8,
    fontSize: 13,
    fontWeight: 800,
    color: "var(--text-strong)",
  },
  input: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "11px 12px",
    width: "100%",
    colorScheme: "inherit",
  },
  shopHint: {
    border: "1px solid var(--border)",
    background: "var(--surface-strong)",
    borderRadius: 12,
    padding: "10px 12px",
    color: "var(--text)",
  },
  cameraBox: {
    minHeight: 220,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
    borderRadius: 18,
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
  },
  cameraPlaceholder: {
    display: "grid",
    gap: 8,
    textAlign: "center",
    padding: 22,
    color: "var(--muted)",
  },
  cameraIcon: {
    fontSize: 42,
    lineHeight: 1,
    color: "var(--primary)",
  },
  video: {
    width: "100%",
    maxHeight: 360,
    objectFit: "cover",
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  primaryButton: {
    border: "1px solid var(--primary)",
    background: "var(--primary)",
    color: "#08111f",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid var(--border-strong)",
    background: "var(--surface-strong)",
    color: "var(--text-strong)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid var(--danger)",
    background: "rgba(248,113,113,0.12)",
    color: "var(--danger)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.68,
    cursor: "not-allowed",
  },
  errorCard: {
    border: "1px solid var(--danger)",
    background: "rgba(248,113,113,0.1)",
    color: "var(--danger)",
    borderRadius: 18,
    padding: 16,
  },
  successCard: {
    border: "1px solid var(--success)",
    background: "rgba(34,197,94,0.1)",
    color: "var(--success)",
    borderRadius: 18,
    padding: 16,
  },
  infoCard: {
    border: "1px solid var(--border)",
    background: "var(--surface-strong)",
    color: "var(--text)",
    borderRadius: 14,
    padding: 12,
    lineHeight: 1.5,
  },
  messageText: {
    margin: "6px 0 0",
    color: "inherit",
  },
  steps: {
    margin: 0,
    paddingLeft: 20,
    color: "var(--text)",
    lineHeight: 1.8,
  },
  resultCard: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 18,
    padding: 18,
    display: "grid",
    gap: 16,
    boxShadow: "var(--shadow-soft)",
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  resultTitle: {
    margin: "6px 0 0",
    fontSize: 24,
    fontWeight: 900,
    color: "var(--text-strong)",
  },
  statusPill: {
    alignSelf: "flex-start",
    border: "1px solid var(--primary)",
    background: "var(--surface-strong)",
    color: "var(--primary)",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 900,
  },
  details: {
    borderTop: "1px solid var(--border)",
    paddingTop: 12,
    color: "var(--text)",
  },
  pre: {
    whiteSpace: "pre-wrap",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 12,
    overflow: "auto",
    color: "var(--text)",
  },
};

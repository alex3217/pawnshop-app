// File: apps/web/src/pages/CreateItemPage.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ITEM_CATEGORY_OPTIONS, ITEM_CONDITION_OPTIONS } from "../constants/itemOptions";
import { getAuthToken } from "../services/auth";
import { requestListingAssistant, type AiListingSuggestion } from "../services/aiListingAssistant";
import {
  createItem,
  scanItem,
  type ScanPayload,
  type ScanResult,
} from "../services/items";
import { getMyShops, type Shop } from "../services/shops";

type ItemPrefill = {
  pawnShopId: string;
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  source: string;
  code: string;
};

type BarcodeDetection = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetection[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;

  return (
    window as typeof window & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector ?? null;
}

function getScanPayload(result: ScanResult | null): ScanPayload | null {
  return (result?.data as ScanPayload | undefined) || null;
}

function parsePositiveNumber(value: string, fieldName: string) {
  const num = Number(value);

  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`);
  }

  return num;
}

function sanitizeText(value: string | null, fallback = "") {
  return String(value || "").trim() || fallback;
}

function sanitizePrice(value: string | null, fallback = "100") {
  const next = String(value || "").trim();

  if (!next) return fallback;

  const parsed = Number(next);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : fallback;
}

function normalizeOption(
  value: string,
  options: readonly string[],
  fallback: string,
) {
  return options.includes(value) ? value : fallback;
}

function getPrefillFromSearch(search: string): ItemPrefill {
  const params = new URLSearchParams(search);

  const category = sanitizeText(params.get("category"), "Electronics");
  const condition = sanitizeText(params.get("condition"), "Good");

  return {
    pawnShopId: sanitizeText(params.get("shopId")),
    title: sanitizeText(params.get("title")),
    description: sanitizeText(params.get("description")),
    price: sanitizePrice(params.get("price")),
    category: normalizeOption(category, ITEM_CATEGORY_OPTIONS, "Electronics"),
    condition: normalizeOption(condition, ITEM_CONDITION_OPTIONS, "Good"),
    source: sanitizeText(params.get("source")),
    code: sanitizeText(params.get("code")),
  };
}

export default function CreateItemPage() {
  const nav = useNavigate();
  const location = useLocation();
  const token = getAuthToken();

  const prefill = useMemo(
    () => getPrefillFromSearch(location.search),
    [location.search],
  );

  const [shops, setShops] = useState<Shop[]>([]);
  const [pawnShopId, setPawnShopId] = useState(prefill.pawnShopId);
  const [title, setTitle] = useState(prefill.title);
  const [description, setDescription] = useState(prefill.description);
  const [price, setPrice] = useState(prefill.price);
  const [category, setCategory] = useState(prefill.category);
  const [condition, setCondition] = useState(prefill.condition);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const [scanCode, setScanCode] = useState(prefill.code);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiListingSuggestion | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === pawnShopId) ?? null,
    [shops, pawnShopId],
  );

  const hasPrefill =
    Boolean(prefill.title) ||
    Boolean(prefill.description) ||
    Boolean(prefill.code) ||
    Boolean(prefill.source) ||
    Boolean(prefill.pawnShopId);

  useEffect(() => {
    setPawnShopId(prefill.pawnShopId);
    setTitle(prefill.title);
    setDescription(prefill.description);
    setPrice(prefill.price);
    setCategory(prefill.category);
    setCondition(prefill.condition);
    setScanCode(prefill.code);
  }, [prefill]);

  useEffect(() => {
    let cancelled = false;

    async function loadShops() {
      setLoading(true);
      setError(null);

      try {
        if (!token) {
          throw new Error("You must be logged in as an owner.");
        }

        const rows = await getMyShops();

        if (cancelled) return;

        setShops(rows);

        setPawnShopId((prev) => {
          const preferredId = prefill.pawnShopId || prev;

          if (preferredId && rows.some((shop) => shop.id === preferredId)) {
            return preferredId;
          }

          return rows[0]?.id || "";
        });

        if (rows.length === 0) {
          setError("No owner shops found. Create or claim a shop first.");
        }
      } catch (err: unknown) {
        if (cancelled) return;

        setShops([]);
        setPawnShopId("");
        setError(err instanceof Error ? err.message : "Failed to load shops");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadShops();

    return () => {
      cancelled = true;
    };
  }, [token, prefill.pawnShopId]);

  const stopScannerCamera = useCallback(() => {
    if (scanIntervalRef.current !== null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScannerCamera();
    };
  }, [stopScannerCamera]);

  function applyScanResult(result: ScanResult, scannedCode: string) {
    const payload = getScanPayload(result);

    if (!payload) {
      setScanError("The scanner returned no usable item information.");
      return;
    }

    const sourceItem = payload.item ?? payload;

    if (sourceItem.title) {
      setTitle(String(sourceItem.title).trim());
    }

    if (sourceItem.description) {
      setDescription(String(sourceItem.description).trim());
    }

    if (sourceItem.price) {
      setPrice(sanitizePrice(String(sourceItem.price), price || "100"));
    }

    if (sourceItem.category) {
      setCategory(
        normalizeOption(
          String(sourceItem.category).trim(),
          ITEM_CATEGORY_OPTIONS,
          category || "Electronics",
        ),
      );
    }

    if (sourceItem.condition) {
      setCondition(
        normalizeOption(
          String(sourceItem.condition).trim(),
          ITEM_CONDITION_OPTIONS,
          condition || "Good",
        ),
      );
    }

    setScanCode(scannedCode);
    setScanMessage(
      payload.item
        ? "Existing inventory match found. Review the populated details before saving."
        : "Barcode resolved. Review the populated details before saving.",
    );
  }

  async function resolveInlineScan(nextCode = scanCode) {
    const normalizedCode = String(nextCode || "").trim();

    setScanError(null);
    setScanMessage(null);
    setScanResult(null);

    if (!pawnShopId) {
      setScanError("Choose a shop before scanning an item.");
      return;
    }

    if (!normalizedCode) {
      setScanError("Enter or scan a barcode, UPC, EAN, QR code, SKU, or pawn tag.");
      return;
    }

    setScanLoading(true);

    try {
      const result = await scanItem({
        shopId: pawnShopId,
        code: normalizedCode,
      });

      setScanResult(result);
      applyScanResult(result, normalizedCode);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : "Unable to resolve scanned item.");
    } finally {
      setScanLoading(false);
    }
  }

  async function startInlineCameraScanner() {
    setScanError(null);
    setScanMessage(null);

    if (!pawnShopId) {
      setScanError("Choose a shop before starting the camera scanner.");
      return;
    }

    const BarcodeDetectorCtor = getBarcodeDetector();

    if (!BarcodeDetectorCtor) {
      setScanError(
        "Camera barcode detection is not supported in this browser. Use manual barcode entry or the Scan Console.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError(
        "Camera access is unavailable in this browser. Use manual barcode entry.",
      );
      return;
    }

    try {
      stopScannerCamera();

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
      setScanMessage("Camera active. Point the camera at the barcode.");

      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;

        try {
          const detections = await detector.detect(videoRef.current);
          const value = String(detections?.[0]?.rawValue || "").trim();

          if (!value) return;

          stopScannerCamera();
          setScanCode(value);
          await resolveInlineScan(value);
        } catch {
          // Continue scanning while the video frame becomes ready.
        }
      }, 650);
    } catch (err: unknown) {
      stopScannerCamera();
      setScanError(
        err instanceof Error ? err.message : "Unable to start camera scanner.",
      );
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("You must be logged in as an owner.");
      return;
    }

    if (!pawnShopId || !selectedShop) {
      setError("Please select a shop.");
      return;
    }

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!category) {
      setError("Please select a category.");
      return;
    }

    if (!condition) {
      setError("Please select a condition.");
      return;
    }

    setSaving(true);

    try {
      const parsedPrice = parsePositiveNumber(price, "Price");

      await createItem({
        pawnShopId,
        title: title.trim(),
        description: description.trim(),
        price: parsedPrice,
        images: [],
        category,
        condition,
      });

      nav("/owner/inventory");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  function clearPrefill() {
    setTitle("");
    setDescription("");
    setPrice("100");
    setCategory("Electronics");
    setCondition("Good");

    nav("/owner/items/new", { replace: true });
  }


  async function runAiListingAssistant() {
    setAiError(null);
    setError(null);

    if (!token) {
      setAiError("You must be logged in as an owner.");
      return;
    }

    if (!title.trim() && !description.trim()) {
      setAiError("Add a title or description before asking AI for help.");
      return;
    }

    setAiLoading(true);

    try {
      const suggestion = await requestListingAssistant({
        pawnShopId,
        shopName: selectedShop?.name || "",
        title,
        description,
        price,
        category,
        condition,
      });

      setAiSuggestion(suggestion);
    } catch (err: unknown) {
      setAiSuggestion(null);
      setAiError(err instanceof Error ? err.message : "AI listing assistant failed.");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiSuggestion() {
    if (!aiSuggestion) return;

    if (aiSuggestion.title.trim()) {
      setTitle(aiSuggestion.title.trim());
    }

    if (aiSuggestion.description.trim()) {
      setDescription(aiSuggestion.description.trim());
    }

    if (aiSuggestion.category.trim()) {
      setCategory(
        normalizeOption(
          aiSuggestion.category.trim(),
          ITEM_CATEGORY_OPTIONS,
          category || "Electronics",
        ),
      );
    }

    if (aiSuggestion.condition.trim()) {
      setCondition(
        normalizeOption(
          aiSuggestion.condition.trim(),
          ITEM_CONDITION_OPTIONS,
          condition || "Good",
        ),
      );
    }
  }

  const submitDisabled =
    saving ||
    loading ||
    !pawnShopId ||
    !selectedShop ||
    !title.trim() ||
    !category ||
    !condition;

  return (
    <div className="page-stack">
      <div className="page-card" style={{ display: "grid", gap: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Create Item</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Add inventory to your pawnshop marketplace.
            </p>
          </div>

          <Link className="btn" to="/owner/inventory">
            Back to Inventory
          </Link>
        </div>

        {hasPrefill ? (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(59,130,246,0.35)",
              background: "rgba(59,130,246,0.1)",
              display: "grid",
              gap: 8,
            }}
          >
            <strong>Prefilled from scan/import</strong>
            <span className="muted">
              Review the details below before saving the item.
            </span>
            <button
              type="button"
              className="btn"
              onClick={clearPrefill}
              style={{ width: "fit-content" }}
            >
              Clear Prefill
            </button>
          </div>
        ) : null}

        <section
          style={{
            padding: 16,
            borderRadius: 16,
            border: "1px solid rgba(59,130,246,0.35)",
            background: "rgba(30,64,175,0.12)",
            display: "grid",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div>
              <strong>Scan item barcode</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Use the camera, a USB/Bluetooth scanner, or enter a UPC, EAN,
                SKU, QR code, or pawn tag manually.
              </p>
            </div>

            <Link className="btn" to="/owner/scan-console">
              Open full Scan Console
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto auto",
              gap: 10,
              alignItems: "end",
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              Barcode / SKU / QR value
              <input
                value={scanCode}
                onChange={(event) => setScanCode(event.target.value)}
                placeholder="Scan or enter item code"
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void resolveInlineScan();
                  }
                }}
              />
            </label>

            <button
              type="button"
              className="btn"
              disabled={scanLoading || !pawnShopId}
              onClick={() => void resolveInlineScan()}
            >
              {scanLoading ? "Looking up..." : "Look up item"}
            </button>

            <button
              type="button"
              className="btn"
              disabled={scanLoading || !pawnShopId}
              onClick={() =>
                cameraActive
                  ? stopScannerCamera()
                  : void startInlineCameraScanner()
              }
            >
              {cameraActive ? "Stop camera" : "Start camera"}
            </button>
          </div>

          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              display: cameraActive ? "block" : "none",
              width: "100%",
              maxHeight: 360,
              objectFit: "cover",
              borderRadius: 14,
              background: "#020617",
              border: "1px solid rgba(148,163,184,0.25)",
            }}
          />

          {scanError ? (
            <div
              style={{
                color: "#fecaca",
                background: "rgba(220,38,38,0.12)",
                border: "1px solid rgba(248,113,113,0.25)",
                padding: 12,
                borderRadius: 12,
              }}
            >
              {scanError}
            </div>
          ) : null}

          {scanMessage ? (
            <div
              style={{
                color: "#bbf7d0",
                background: "rgba(22,163,74,0.12)",
                border: "1px solid rgba(74,222,128,0.25)",
                padding: 12,
                borderRadius: 12,
              }}
            >
              {scanMessage}
            </div>
          ) : null}

          {scanResult ? (
            <small className="muted">
              Scan complete. The listing form below has been populated where
              matching data was available.
            </small>
          ) : null}
        </section>

        {error ? (
          <div
            style={{
              color: "#fecaca",
              background: "rgba(220,38,38,0.12)",
              border: "1px solid rgba(248,113,113,0.25)",
              padding: 12,
              borderRadius: 12,
            }}
          >
            {error}
          </div>
        ) : null}


        <section
          style={{
            padding: 16,
            borderRadius: 16,
            border: "1px solid rgba(129,140,248,0.28)",
            background: "rgba(79,70,229,0.10)",
            display: "grid",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <strong>AI Listing Assistant</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Improve the title, description, tags, trust notes, and listing quality before saving.
              </p>
            </div>

            <button
              type="button"
              className="btn"
              onClick={runAiListingAssistant}
              disabled={aiLoading || saving || loading || (!title.trim() && !description.trim())}
            >
              {aiLoading ? "Generating..." : "Generate AI Suggestions"}
            </button>
          </div>

          {aiError ? (
            <div
              style={{
                color: "#fecaca",
                background: "rgba(220,38,38,0.12)",
                border: "1px solid rgba(248,113,113,0.25)",
                padding: 12,
                borderRadius: 12,
              }}
            >
              {aiError}
            </div>
          ) : null}

          {aiSuggestion ? (
            <div
              style={{
                display: "grid",
                gap: 12,
                padding: 14,
                borderRadius: 14,
                background: "rgba(15,23,42,0.52)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <strong>Quality Score: {Math.round(aiSuggestion.qualityScore)}/100</strong>
                <span className="muted">Source: {aiSuggestion.source || "ai"}</span>
              </div>

              <div>
                <strong>Suggested Title</strong>
                <p style={{ margin: "6px 0 0" }}>{aiSuggestion.title}</p>
              </div>

              <div>
                <strong>Suggested Description</strong>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                  {aiSuggestion.description}
                </p>
              </div>

              {aiSuggestion.tags.length ? (
                <div>
                  <strong>Tags</strong>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    {aiSuggestion.tags.join(", ")}
                  </p>
                </div>
              ) : null}

              {aiSuggestion.qualityIssues.length ? (
                <div>
                  <strong>Quality Issues</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {aiSuggestion.qualityIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {aiSuggestion.riskWarnings.length ? (
                <div>
                  <strong>Risk Warnings</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {aiSuggestion.riskWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {aiSuggestion.ownerChecklist.length ? (
                <div>
                  <strong>Owner Checklist</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {aiSuggestion.ownerChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={applyAiSuggestion}>
                  Apply AI Suggestions
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setAiSuggestion(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={fieldStyle}>
            Shop
            <select
              value={pawnShopId}
              onChange={(e) => setPawnShopId(e.target.value)}
              disabled={loading || saving}
              required
              style={inputStyle}
            >
              <option value="">
                {loading ? "Loading shops..." : "Select shop"}
              </option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Example: Yamaha keyboard"
              required
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the item, condition, accessories, and notes."
              rows={5}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <label style={fieldStyle}>
              Price
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="100"
                required
                style={inputStyle}
              />
            </label>

            <label style={fieldStyle}>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                style={inputStyle}
              >
                <option value="">Select category</option>
                {ITEM_CATEGORY_OPTIONS.map((itemCategory) => (
                  <option key={itemCategory} value={itemCategory}>
                    {itemCategory}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldStyle}>
              Condition
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                required
                style={inputStyle}
              >
                <option value="">Select condition</option>
                {ITEM_CONDITION_OPTIONS.map((itemCondition) => (
                  <option key={itemCondition} value={itemCondition}>
                    {itemCondition}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitDisabled}
            style={{
              opacity: submitDisabled ? 0.65 : 1,
              cursor: submitDisabled ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Creating Item..." : "Create Item"}
          </button>
        </form>
      </div>
    </div>
  );
}

const fieldStyle = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "#eef2ff",
  fontWeight: 700,
} satisfies CSSProperties;

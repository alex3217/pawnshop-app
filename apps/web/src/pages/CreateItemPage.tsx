// File: apps/web/src/pages/CreateItemPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ITEM_CATEGORY_OPTIONS, ITEM_CONDITION_OPTIONS } from "../constants/itemOptions";
import { getAuthToken } from "../services/auth";
import { requestListingAssistant, type AiListingSuggestion } from "../services/aiListingAssistant";
import { createItem } from "../services/items";
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

// File: apps/web/src/pages/CreateItemPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { getAuthHeaders, getAuthToken } from "../services/auth";
import {
  ITEM_CATEGORY_OPTIONS,
  ITEM_CONDITION_OPTIONS,
} from "../constants/itemOptions";

type Shop = {
  id: string;
  name: string;
};

type ShopsResponse =
  | Shop[]
  | {
      rows?: Shop[];
      shops?: Shop[];
      data?: Shop[] | { rows?: Shop[]; shops?: Shop[] };
      error?: string;
      message?: string;
    };

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

function extractApiError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const maybe = payload as { error?: unknown; message?: unknown };
  return String(maybe.error || maybe.message || "");
}

async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeShops(payload: ShopsResponse | null): Shop[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.shops)) return payload.shops;

  if (Array.isArray(payload.data)) return payload.data;

  if (payload.data && typeof payload.data === "object") {
    if (Array.isArray(payload.data.rows)) return payload.data.rows;
    if (Array.isArray(payload.data.shops)) return payload.data.shops;
  }

  return [];
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === pawnShopId) ?? null,
    [shops, pawnShopId],
  );

  const hasPrefill =
    !!prefill.title ||
    !!prefill.description ||
    !!prefill.code ||
    !!prefill.source ||
    !!prefill.pawnShopId;

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

        const res = await fetch(`${API_BASE}/shops/mine`, {
          headers: getAuthHeaders(),
          credentials: "include",
        });

        const json = await safeJson<ShopsResponse>(res);

        if (!res.ok) {
          throw new Error(
            extractApiError(json) || `Failed to load shops (${res.status})`,
          );
        }

        const rows = normalizeShops(json);

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

      const res = await fetch(`${API_BASE}/items`, {
        method: "POST",
        headers: getAuthHeaders(true),
        credentials: "include",
        body: JSON.stringify({
          pawnShopId,
          title: title.trim(),
          description: description.trim(),
          price: parsedPrice,
          images: [],
          category,
          condition,
        }),
      });

      const json = await safeJson<Record<string, unknown>>(res);

      if (!res.ok) {
        throw new Error(
          extractApiError(json) || `Failed to create item (${res.status})`,
        );
      }

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
} satisfies React.CSSProperties;

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "#eef2ff",
  fontWeight: 700,
} satisfies React.CSSProperties;

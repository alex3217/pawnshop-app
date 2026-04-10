// File: apps/web/src/pages/CreateItemPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { getAuthHeaders, getAuthToken } from "../services/auth";

type Shop = {
  id: string;
  name: string;
};

type ShopsResponse =
  | Shop[]
  | {
      rows?: Shop[];
      shops?: Shop[];
      error?: string;
      message?: string;
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
  return [];
}

function parsePositiveNumber(value: string, fieldName: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`);
  }
  return num;
}

export default function CreateItemPage() {
  const nav = useNavigate();
  const token = getAuthToken();

  const [shops, setShops] = useState<Shop[]>([]);
  const [pawnShopId, setPawnShopId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("100");
  const [category, setCategory] = useState("Electronics");
  const [condition, setCondition] = useState("Good");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === pawnShopId) ?? null,
    [shops, pawnShopId]
  );

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
        });

        const json = await safeJson<ShopsResponse>(res);

        if (!res.ok) {
          throw new Error(
            extractApiError(json) || `Failed to load shops (${res.status})`
          );
        }

        const rows = normalizeShops(json);

        if (cancelled) return;

        setShops(rows);
        setPawnShopId((prev) => {
          if (prev && rows.some((shop) => shop.id === prev)) return prev;
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
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadShops();

    return () => {
      cancelled = true;
    };
  }, [token]);

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

    setSaving(true);

    try {
      const parsedPrice = parsePositiveNumber(price, "Price");

      const res = await fetch(`${API_BASE}/items`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          pawnShopId,
          title: title.trim(),
          description: description.trim(),
          price: parsedPrice,
          images: [],
          category: category.trim(),
          condition: condition.trim(),
        }),
      });

      const json = await safeJson<Record<string, unknown>>(res);

      if (!res.ok) {
        throw new Error(
          extractApiError(json) || `Failed to create item (${res.status})`
        );
      }

      nav("/owner");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  const submitDisabled =
    saving || loading || !token || shops.length === 0 || !pawnShopId || !title.trim();

  return (
    <div className="page-stack">
      <div className="page-card form-card">
        <div className="section-title">Create Item</div>
        <div className="section-subtitle">
          Add a new item to your shop inventory so it can be listed or auctioned.
        </div>

        {loading ? <p className="muted">Loading your shops…</p> : null}

        {!loading && shops.length === 0 ? (
          <div className="list-card">
            <strong>No shops available</strong>
            <p className="muted" style={{ marginBottom: 12 }}>
              You need an owner shop before you can create inventory items.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to="/owner" className="btn btn-secondary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="stack">
          <label>
            <div style={{ marginBottom: 6 }}>Select Shop</div>
            <select
              value={pawnShopId}
              onChange={(e) => setPawnShopId(e.target.value)}
              required
              disabled={loading || shops.length === 0}
            >
              {shops.length === 0 ? (
                <option value="">No shops available</option>
              ) : null}

              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item title"
              required
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Description</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the item"
              rows={4}
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Price</div>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price"
              inputMode="decimal"
              required
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Category</div>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              required
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Condition</div>
            <input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="Condition"
              required
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitDisabled}
          >
            {saving ? "Creating..." : "Create Item"}
          </button>

          {error ? <div className="error-text">{error}</div> : null}
        </form>
      </div>
    </div>
  );
}
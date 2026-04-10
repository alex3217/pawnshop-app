// File: apps/web/src/pages/CreateAuctionPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { getAuthHeaders, getAuthToken } from "../services/auth";

type Item = {
  id: string;
  pawnShopId: string;
  title: string;
  status: string;
  isDeleted?: boolean;
};

type AuctionRow = {
  id: string;
  itemId: string;
  shopId?: string;
  status: string;
};

type AuctionsResponse =
  | {
      rows?: AuctionRow[];
      error?: string;
      message?: string;
    }
  | AuctionRow[];

type ItemsResponse =
  | Item[]
  | {
      rows?: Item[];
      items?: Item[];
      error?: string;
      message?: string;
    };

function toLocalDateTimeInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function buildInitialTimes() {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 5);
  start.setSeconds(0, 0);

  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    startsAt: toLocalDateTimeInputValue(start),
    endsAt: toLocalDateTimeInputValue(end),
  };
}

function parsePositiveNumber(value: string, fieldName: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`);
  }
  return num;
}

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

function normalizeItems(payload: ItemsResponse | null): Item[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeAuctionRows(payload: AuctionsResponse | null): AuctionRow[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function isAuctionEligibleItem(item: Item) {
  if (!item || item.isDeleted) return false;
  return String(item.status || "").toUpperCase() === "AVAILABLE";
}

export default function CreateAuctionPage() {
  const nav = useNavigate();
  const token = getAuthToken();

  const initialTimes = useMemo(() => buildInitialTimes(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [existingAuctionItemIds, setExistingAuctionItemIds] = useState<string[]>([]);
  const [itemId, setItemId] = useState("");
  const [startingPrice, setStartingPrice] = useState("100");
  const [minIncrement, setMinIncrement] = useState("10");
  const [startsAt, setStartsAt] = useState(initialTimes.startsAt);
  const [endsAt, setEndsAt] = useState(initialTimes.endsAt);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const availableItems = useMemo(() => {
    return items.filter(
      (item) =>
        isAuctionEligibleItem(item) && !existingAuctionItemIds.includes(item.id)
    );
  }, [items, existingAuctionItemIds]);

  const selectedItem = useMemo(
    () => availableItems.find((item) => item.id === itemId) ?? null,
    [availableItems, itemId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        if (!token) {
          throw new Error("You must be logged in as an owner.");
        }

        const [itemsRes, auctionsRes] = await Promise.all([
          fetch(`${API_BASE}/items/mine`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API_BASE}/auctions`, {
            headers: getAuthHeaders(),
          }),
        ]);

        const itemsJson = await safeJson<ItemsResponse>(itemsRes);
        const auctionsJson = await safeJson<AuctionsResponse>(auctionsRes);

        if (!itemsRes.ok) {
          throw new Error(
            extractApiError(itemsJson) || `Failed to load items (${itemsRes.status})`
          );
        }

        if (!auctionsRes.ok) {
          throw new Error(
            extractApiError(auctionsJson) || `Failed to load auctions (${auctionsRes.status})`
          );
        }

        const itemRows = normalizeItems(itemsJson);
        const auctionRows = normalizeAuctionRows(auctionsJson);

        if (cancelled) return;

        setItems(itemRows);
        setExistingAuctionItemIds(
          auctionRows
            .filter((auction) => Boolean(auction.itemId))
            .map((auction) => auction.itemId)
        );
      } catch (err: unknown) {
        if (cancelled) return;
        setItems([]);
        setExistingAuctionItemIds([]);
        setError(
          err instanceof Error ? err.message : "Failed to load auction form data"
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (availableItems.length === 0) {
      setItemId("");
      return;
    }

    setItemId((prev) => {
      if (prev && availableItems.some((item) => item.id === prev)) {
        return prev;
      }
      return availableItems[0].id;
    });
  }, [availableItems]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("You must be logged in as an owner.");
      return;
    }

    if (!itemId || !selectedItem) {
      setError(
        "No eligible item selected. Create a new item or choose one without an auction."
      );
      return;
    }

    if (!selectedItem.pawnShopId) {
      setError("Selected item is missing its shop relationship.");
      return;
    }

    setSaving(true);

    try {
      const parsedStartingPrice = parsePositiveNumber(startingPrice, "Starting price");
      const parsedMinIncrement = parsePositiveNumber(minIncrement, "Minimum increment");

      const startsAtDate = new Date(startsAt);
      const endsAtDate = new Date(endsAt);

      if (Number.isNaN(startsAtDate.getTime())) {
        throw new Error("Start time is invalid.");
      }

      if (Number.isNaN(endsAtDate.getTime())) {
        throw new Error("End time is invalid.");
      }

      if (endsAtDate <= startsAtDate) {
        throw new Error("End time must be after start time.");
      }

      const res = await fetch(`${API_BASE}/auctions`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          itemId,
          shopId: selectedItem.pawnShopId,
          startingPrice: parsedStartingPrice,
          minIncrement: parsedMinIncrement,
          startsAt: startsAtDate.toISOString(),
          endsAt: endsAtDate.toISOString(),
        }),
      });

      const json = await safeJson<Record<string, unknown>>(res);

      if (res.status === 409) {
        throw new Error("This item already has an auction. Choose another item.");
      }

      if (!res.ok) {
        throw new Error(
          extractApiError(json) || `Failed to create auction (${res.status})`
        );
      }

      nav("/owner/auctions");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create auction");
    } finally {
      setSaving(false);
    }
  }

  const submitDisabled = saving || loading || availableItems.length === 0 || !itemId;

  return (
    <div className="page-stack">
      <div className="page-card form-card">
        <div className="section-title">Create Auction</div>
        <div className="section-subtitle">
          Launch a new auction from one of your available inventory items.
        </div>

        {loading ? <p className="muted">Loading your items…</p> : null}

        {!loading && availableItems.length === 0 ? (
          <div className="list-card">
            <strong>No eligible items available</strong>
            <p className="muted" style={{ marginBottom: 12 }}>
              Every current item may already have an auction, or you may need to create a new item first.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to="/owner/items/new" className="btn btn-primary">
                Create Item
              </Link>
              <Link to="/owner/auctions" className="btn btn-secondary">
                View My Auctions
              </Link>
            </div>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="stack">
          <label>
            <div style={{ marginBottom: 6 }}>Select Item</div>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              required
              disabled={loading || availableItems.length === 0}
            >
              {availableItems.length === 0 ? (
                <option value="">No available items</option>
              ) : null}

              {availableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ({item.status})
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Starting Price</div>
            <input
              value={startingPrice}
              onChange={(e) => setStartingPrice(e.target.value)}
              placeholder="Starting price"
              inputMode="decimal"
              required
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Minimum Increment</div>
            <input
              value={minIncrement}
              onChange={(e) => setMinIncrement(e.target.value)}
              placeholder="Minimum increment"
              inputMode="decimal"
              required
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Starts At</div>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </label>

          <label>
            <div style={{ marginBottom: 6 }}>Ends At</div>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitDisabled}
          >
            {saving ? "Creating..." : "Create Auction"}
          </button>

          {error ? <div className="error-text">{error}</div> : null}
        </form>
      </div>
    </div>
  );
}
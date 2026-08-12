// File: apps/web/src/pages/ShopDetailPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PrimaryListingImage from "../components/PrimaryListingImage";
import { getShopItems, type Shop, type ShopItem } from "../services/shops";
import "../styles/shop-detail-readability.css";

function formatPrice(value: string | number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function toPriceNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getItemStatusTone(status: string) {
  const normalized = String(status || "").toUpperCase();
  if (["AVAILABLE", "ACTIVE"].includes(normalized)) return "available";
  if (normalized === "PENDING") return "pending";
  if (["SOLD", "INACTIVE", "REMOVED"].includes(normalized)) return "unavailable";
  return "neutral";
}

type SortOption =
  | "TITLE_ASC"
  | "PRICE_LOW_HIGH"
  | "PRICE_HIGH_LOW"
  | "STATUS_ASC";

export default function ShopDetailPage() {
  const { id = "" } = useParams();

  const [shop, setShop] = useState<Shop | null>(null);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [conditionFilter, setConditionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("TITLE_ASC");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) {
        setError("Missing shop id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const payload = await getShopItems(id);
        if (!cancelled) {
          setShop(payload.shop);
          setItems(payload.items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load shop.");
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
    if (
      loading ||
      error ||
      !shop ||
      window.location.hash !==
        "#inventory"
    ) {
      return;
    }

    const frame =
      window.requestAnimationFrame(
        () => {
          document
            .getElementById(
              "inventory",
            )
            ?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
              block: "start",
            });
        },
      );

    return () =>
      window.cancelAnimationFrame(
        frame,
      );
  }, [
    loading,
    error,
    shop,
  ]);

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((item) => normalizeLabel(item.category, "Uncategorized"))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const conditionOptions = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((item) => normalizeLabel(item.condition, "Condition not listed"))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const statusOptions = useMemo(() => {
    return Array.from(
      new Set(items.map((item) => normalizeLabel(item.status, "UNKNOWN")).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = normalizeText(query);

    const next = items.filter((item) => {
      const searchable = [
        item.title,
        item.description || "",
        item.category || "",
        item.condition || "",
        item.status || "",
      ]
        .join(" ")
        .toLowerCase();

      const itemCategory = normalizeLabel(item.category, "Uncategorized");
      const itemCondition = normalizeLabel(item.condition, "Condition not listed");
      const itemStatus = normalizeLabel(item.status, "UNKNOWN");

      if (q && !searchable.includes(q)) return false;
      if (categoryFilter !== "ALL" && itemCategory !== categoryFilter) return false;
      if (conditionFilter !== "ALL" && itemCondition !== conditionFilter) return false;
      if (statusFilter !== "ALL" && itemStatus !== statusFilter) return false;

      return true;
    });

    const sorted = [...next];

    if (sortBy === "PRICE_LOW_HIGH") {
      sorted.sort((a, b) => toPriceNumber(a.price) - toPriceNumber(b.price));
    } else if (sortBy === "PRICE_HIGH_LOW") {
      sorted.sort((a, b) => toPriceNumber(b.price) - toPriceNumber(a.price));
    } else if (sortBy === "STATUS_ASC") {
      sorted.sort((a, b) =>
        normalizeLabel(a.status, "UNKNOWN").localeCompare(
          normalizeLabel(b.status, "UNKNOWN"),
        ),
      );
    } else {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }

    return sorted;
  }, [items, query, categoryFilter, conditionFilter, statusFilter, sortBy]);

  const stats = useMemo(() => {
    const totalValue = filteredItems.reduce(
      (sum, item) => sum + toPriceNumber(item.price),
      0,
    );

    return {
      totalInventory: items.length,
      matchingInventory: filteredItems.length,
      totalValue,
    };
  }, [items, filteredItems]);

  function clearFilters() {
    setQuery("");
    setCategoryFilter("ALL");
    setConditionFilter("ALL");
    setStatusFilter("ALL");
    setSortBy("TITLE_ASC");
  }

  const hasActiveFilters =
    query.trim() ||
    categoryFilter !== "ALL" ||
    conditionFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    sortBy !== "TITLE_ASC";

  if (loading) {
    return (
      <main className="shop-detail-page">
        <div className="shop-detail-state" role="status" aria-live="polite">
          Loading shop…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="shop-detail-page">
        <div className="shop-detail-state shop-detail-error" role="alert">
          {error}
        </div>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="shop-detail-page">
        <div className="shop-detail-state">Shop not found.</div>
      </main>
    );
  }

  return (
    <main className="shop-detail-page">
      <header className="shop-detail-card shop-detail-header">
        <div>
          <p className="shop-detail-eyebrow">Shop storefront</p>
          <h1>{shop.name}</h1>
          {shop.description ? (
            <p className="shop-detail-description">{shop.description}</p>
          ) : null}
        </div>

        <dl className="shop-detail-contact-list">
          <div>
            <dt>Address</dt>
            <dd><address>{shop.address || "No address provided"}</address></dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>
              {shop.phone ? <a href={`tel:${shop.phone}`}>{shop.phone}</a> : "No phone provided"}
            </dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>{shop.hours || "Hours not listed"}</dd>
          </div>
        </dl>
      </header>

      <section
        className="shop-detail-card shop-detail-filters"
        aria-labelledby="shop-detail-filter-title"
      >
        <div className="shop-detail-filter-heading">
          <div>
            <h2 id="shop-detail-filter-title">Filter storefront inventory</h2>
            <p>Search and sort this shop’s inventory.</p>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="shop-detail-clear-button"
          >
            Clear Filters
          </button>
        </div>

        <div className="shop-detail-filter-grid">
          <label>
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items in this shop..."
            />
          </label>
          <label>
            <span>Category</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="ALL">All Categories</option>
              {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Condition</span>
            <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)}>
              <option value="ALL">All Conditions</option>
              {conditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All Statuses</option>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Sort By</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)}>
              <option value="TITLE_ASC">Title A–Z</option>
              <option value="PRICE_LOW_HIGH">Price Low → High</option>
              <option value="PRICE_HIGH_LOW">Price High → Low</option>
              <option value="STATUS_ASC">Status</option>
            </select>
          </label>
        </div>
      </section>

      <dl className="shop-detail-stats" aria-label="Inventory summary">
        <div><dt>All items</dt><dd>{stats.totalInventory}</dd></div>
        <div><dt>Matching items</dt><dd>{stats.matchingInventory}</dd></div>
        <div><dt>Visible inventory value</dt><dd>${stats.totalValue.toFixed(2)}</dd></div>
      </dl>

      <section id="inventory" className="shop-detail-inventory">
        <div className="shop-detail-section-heading">
          <h2>Available Inventory</h2>
          <Link to="/auctions" className="shop-detail-secondary-link">Browse Auctions</Link>
        </div>

        {filteredItems.length === 0 ? (
          <div className="shop-detail-state">
            {items.length === 0
              ? "This shop has no inventory yet."
              : "No items matched this storefront filter."}
          </div>
        ) : (
          <div className="shop-detail-grid">
            {filteredItems.map((item) => {
              return (
                <article key={item.id} className="shop-detail-card shop-detail-item-card">
                  <div className="shop-detail-item-media">
                    <PrimaryListingImage
                      images={item.images}
                      alt={`${item.title} photo`}
                      placeholderClassName="shop-detail-image-placeholder"
                      placeholder={(
                        <>
                          <span aria-hidden="true">◇</span>
                          <span>No image available</span>
                        </>
                      )}
                    />
                  </div>
                  <div className="shop-detail-item-body">
                    <h3>{item.title}</h3>
                    <div className="shop-detail-price">{formatPrice(item.price)}</div>
                    <div className="shop-detail-badges">
                      <span className={`shop-detail-badge shop-detail-status-${getItemStatusTone(item.status)}`}>
                        {item.status}
                      </span>
                      <span className="shop-detail-badge shop-detail-badge-neutral">
                        {normalizeLabel(item.category, "Uncategorized")}
                      </span>
                      <span className="shop-detail-badge shop-detail-badge-neutral">
                        {normalizeLabel(item.condition, "Condition not listed")}
                      </span>
                    </div>
                    {item.description ? (
                      <p className="shop-detail-item-description">{item.description}</p>
                    ) : (
                      <p className="shop-detail-item-description shop-detail-missing-description">
                        No description provided.
                      </p>
                    )}
                    <div className="shop-detail-item-actions">
                      <Link to={`/items/${item.id}`} className="shop-detail-view-item">View Item</Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

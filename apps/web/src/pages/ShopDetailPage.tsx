// File: apps/web/src/pages/ShopDetailPage.tsx

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { getShopItems, type Shop, type ShopItem } from "../services/shops";

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

function getItemStatusTone(status: string): CSSProperties {
  const normalized = String(status || "").toUpperCase();

  if (["AVAILABLE", "ACTIVE"].includes(normalized)) {
    return {
      color: "#7ef0b3",
      background: "rgba(46, 204, 113, 0.12)",
      border: "1px solid rgba(46, 204, 113, 0.24)",
    };
  }

  if (["PENDING"].includes(normalized)) {
    return {
      color: "#ffd98a",
      background: "rgba(255, 193, 7, 0.12)",
      border: "1px solid rgba(255, 193, 7, 0.24)",
    };
  }

  if (["SOLD", "INACTIVE", "REMOVED"].includes(normalized)) {
    return {
      color: "#ffb2bc",
      background: "rgba(255, 128, 143, 0.10)",
      border: "1px solid rgba(255, 128, 143, 0.18)",
    };
  }

  return {
    color: "#c7d2fe",
    background: "rgba(199, 210, 254, 0.10)",
    border: "1px solid rgba(199, 210, 254, 0.18)",
  };
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

  if (loading) return <div style={styles.card}>Loading shop...</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!shop) return <div style={styles.card}>Shop not found.</div>;

  return (
    <div style={styles.page}>
      <section style={styles.card}>
        <h2 style={styles.title}>{shop.name}</h2>
        <p style={styles.meta}>{shop.address || "No address provided"}</p>
        <p style={styles.meta}>{shop.phone || "No phone provided"}</p>
        <p style={styles.meta}>{shop.hours || "Hours not listed"}</p>
        {shop.description ? <p style={styles.description}>{shop.description}</p> : null}
      </section>

      <section style={styles.filterCard}>
        <div style={styles.filterTopRow}>
          <div>
            <div style={styles.filterTitle}>Filter storefront inventory</div>
            <div style={styles.filterSubtitle}>
              Search and sort this shop’s inventory.
            </div>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            style={{
              ...styles.clearButton,
              ...(!hasActiveFilters ? styles.disabledButton : {}),
            }}
          >
            Clear Filters
          </button>
        </div>

        <div style={styles.filterGrid}>
          <label style={styles.field}>
            <span style={styles.label}>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items in this shop..."
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={styles.input}
            >
              <option value="ALL">All Categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Condition</span>
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              style={styles.input}
            >
              <option value="ALL">All Conditions</option>
              {conditionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.input}
            >
              <option value="ALL">All Statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Sort By</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              style={styles.input}
            >
              <option value="TITLE_ASC">Title A–Z</option>
              <option value="PRICE_LOW_HIGH">Price Low → High</option>
              <option value="PRICE_HIGH_LOW">Price High → Low</option>
              <option value="STATUS_ASC">Status</option>
            </select>
          </label>
        </div>
      </section>

      <section style={styles.statsRow}>
        <div style={styles.statPill}>All items: {stats.totalInventory}</div>
        <div style={styles.statPill}>Matching: {stats.matchingInventory}</div>
        <div style={styles.statPill}>
          Visible value: ${stats.totalValue.toFixed(2)}
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Available Inventory</h3>
          <Link to="/auctions" style={styles.backLink}>
            Browse Auctions
          </Link>
        </div>

        {filteredItems.length === 0 ? (
          <div style={styles.card}>No items matched this storefront filter.</div>
        ) : (
          <div style={styles.grid}>
            {filteredItems.map((item) => (
              <article key={item.id} style={styles.card}>
                <h4 style={styles.itemTitle}>{item.title}</h4>
                <div style={styles.price}>{formatPrice(item.price)}</div>

                <div style={styles.metaRow}>
                  <span style={{ ...styles.metaPill, ...getItemStatusTone(item.status) }}>
                    {item.status}
                  </span>
                  <span style={styles.metaPill}>
                    {normalizeLabel(item.category, "Uncategorized")}
                  </span>
                  <span style={styles.metaPill}>
                    {normalizeLabel(item.condition, "Condition not listed")}
                  </span>
                </div>

                {item.description ? (
                  <p style={styles.description}>{item.description}</p>
                ) : null}

                <div style={styles.itemActions}>
                  <Link to={`/items/${item.id}`} style={styles.itemLink}>
                    View Item
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
    color: "#eef2ff",
  },
  section: {
    display: "grid",
    gap: 14,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
  },
  backLink: {
    textDecoration: "none",
    color: "#c7d2fe",
    fontWeight: 700,
  },
  card: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  itemTitle: {
    margin: "0 0 8px",
    fontSize: 20,
    fontWeight: 800,
  },
  meta: {
    color: "#a7b0d8",
    marginTop: 8,
  },
  metaRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12,
  },
  metaPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(110,168,254,0.12)",
    color: "#cfe0ff",
    border: "1px solid rgba(110,168,254,0.2)",
    fontSize: 13,
    fontWeight: 700,
  },
  description: {
    color: "#d7def7",
    lineHeight: 1.5,
  },
  price: {
    fontSize: 22,
    fontWeight: 800,
    marginTop: 8,
  },
  error: {
    color: "#ff9ead",
    fontWeight: 700,
  },
  grid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  },
  itemActions: {
    marginTop: 14,
  },
  itemLink: {
    textDecoration: "none",
    border: "none",
    color: "#08111f",
    background: "#6ea8fe",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    display: "inline-block",
  },
  filterCard: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
    display: "grid",
    gap: 16,
  },
  filterTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: 800,
  },
  filterSubtitle: {
    color: "#a7b0d8",
    fontSize: 14,
    marginTop: 6,
  },
  filterGrid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  },
  field: {
    display: "grid",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#c7d2fe",
  },
  input: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0c1330",
    color: "#eef2ff",
    padding: "12px 14px",
  },
  clearButton: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  statsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  statPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(110,168,254,0.12)",
    color: "#cfe0ff",
    border: "1px solid rgba(110,168,254,0.2)",
    fontSize: 13,
    fontWeight: 700,
  },
};
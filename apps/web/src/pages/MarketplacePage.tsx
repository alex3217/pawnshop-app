import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMarketplaceItems, type Item } from "../services/items";
import { addSavedSearch } from "../services/savedSearches";

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

export default function MarketplacePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [conditionFilter, setConditionFilter] = useState("ALL");
  const [shopFilter, setShopFilter] = useState("ALL");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextItems = await getMarketplaceItems();
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load marketplace.",
          );
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
  }, []);

  async function handleSaveSearch() {
    const nextQuery = query.trim();
    if (!nextQuery) {
      setSaveMessage("Enter a search before saving it.");
      return;
    }

    try {
      await addSavedSearch(nextQuery);
      setSaveMessage("Search saved.");
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Failed to save search.",
      );
    }
  }

  function clearFilters() {
    setQuery("");
    setCategoryFilter("ALL");
    setConditionFilter("ALL");
    setShopFilter("ALL");
    setMinPrice("");
    setMaxPrice("");
  }

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

  const shopOptions = useMemo(() => {
    return Array.from(
      new Map(
        items
          .filter((item) => item.pawnShopId || item.shop?.id)
          .map((item) => [
            String(item.pawnShopId || item.shop?.id),
            {
              id: String(item.pawnShopId || item.shop?.id),
              name: normalizeLabel(item.shop?.name, "Unknown Shop"),
            },
          ]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = normalizeText(query);
    const parsedMin = minPrice.trim() === "" ? null : Number(minPrice);
    const parsedMax = maxPrice.trim() === "" ? null : Number(maxPrice);

    return items.filter((item) => {
      const searchable = [
        item.title,
        item.description || "",
        item.category || "",
        item.condition || "",
        item.shop?.name || "",
      ]
        .join(" ")
        .toLowerCase();

      const itemCategory = normalizeLabel(item.category, "Uncategorized");
      const itemCondition = normalizeLabel(
        item.condition,
        "Condition not listed",
      );
      const itemShopId = String(item.pawnShopId || item.shop?.id || "");
      const itemPrice = toPriceNumber(item.price);

      if (q && !searchable.includes(q)) return false;
      if (categoryFilter !== "ALL" && itemCategory !== categoryFilter) {
        return false;
      }
      if (conditionFilter !== "ALL" && itemCondition !== conditionFilter) {
        return false;
      }
      if (shopFilter !== "ALL" && itemShopId !== shopFilter) {
        return false;
      }
      if (
        parsedMin !== null &&
        Number.isFinite(parsedMin) &&
        itemPrice < parsedMin
      ) {
        return false;
      }
      if (
        parsedMax !== null &&
        Number.isFinite(parsedMax) &&
        itemPrice > parsedMax
      ) {
        return false;
      }

      return true;
    });
  }, [
    items,
    query,
    categoryFilter,
    conditionFilter,
    shopFilter,
    minPrice,
    maxPrice,
  ]);

  const stats = useMemo(() => {
    const totalValue = filteredItems.reduce(
      (sum, item) => sum + toPriceNumber(item.price),
      0,
    );

    return {
      total: items.length,
      matching: filteredItems.length,
      shops: new Set(
        filteredItems.map((item) => String(item.pawnShopId || item.shop?.id || "")),
      ).size,
      totalValue,
    };
  }, [items, filteredItems]);

  const hasActiveFilters =
    query.trim() ||
    categoryFilter !== "ALL" ||
    conditionFilter !== "ALL" ||
    shopFilter !== "ALL" ||
    minPrice.trim() ||
    maxPrice.trim();

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Marketplace</h2>
          <p style={styles.subtitle}>
            Browse inventory across different pawnshop stores.
          </p>
        </div>

        <div style={styles.searchGroup}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items, shops, categories..."
            style={styles.search}
          />
          <button
            type="button"
            style={styles.saveButton}
            onClick={handleSaveSearch}
          >
            Save Search
          </button>
        </div>
      </div>

      <section style={styles.filterCard}>
        <div style={styles.filterTopRow}>
          <div>
            <div style={styles.filterTitle}>Filter inventory</div>
            <div style={styles.filterSubtitle}>
              Narrow results by category, condition, shop, or price range.
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
            <span style={styles.label}>Shop</span>
            <select
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
              style={styles.input}
            >
              <option value="ALL">All Shops</option>
              {shopOptions.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Min Price</span>
            <input
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Max Price</span>
            <input
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="1000"
              inputMode="decimal"
              style={styles.input}
            />
          </label>
        </div>
      </section>

      <section style={styles.statsRow}>
        <div style={styles.statPill}>All items: {stats.total}</div>
        <div style={styles.statPill}>Matching: {stats.matching}</div>
        <div style={styles.statPill}>Shops: {stats.shops}</div>
        <div style={styles.statPill}>
          Visible value: ${stats.totalValue.toFixed(2)}
        </div>
      </section>

      {saveMessage ? <div style={styles.notice}>{saveMessage}</div> : null}
      {loading ? <div style={styles.card}>Loading marketplace...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && filteredItems.length === 0 ? (
        <div style={styles.card}>No items matched your filters.</div>
      ) : null}

      <div style={styles.grid}>
        {filteredItems.map((item) => (
          <article key={item.id} style={styles.card}>
            <div style={styles.kicker}>{item.shop?.name || "Unknown Shop"}</div>
            <h3 style={styles.cardTitle}>{item.title}</h3>
            <div style={styles.price}>${toPriceNumber(item.price).toFixed(2)}</div>
            <div style={styles.meta}>
              <span>{normalizeLabel(item.category, "Uncategorized")}</span>
              <span>{normalizeLabel(item.condition, "Condition not listed")}</span>
              <span>{item.status}</span>
            </div>

            {item.description ? (
              <p style={styles.description}>{item.description}</p>
            ) : null}

            <div style={styles.actions}>
              <Link to={`/items/${item.id}`} style={styles.primaryLink}>
                View Item
              </Link>
              <Link to={`/shops/${item.pawnShopId}`} style={styles.secondaryLink}>
                View Shop
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
    color: "#eef2ff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  subtitle: {
    marginTop: 8,
    color: "#a7b0d8",
  },
  searchGroup: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  saveButton: {
    border: "none",
    color: "#08111f",
    background: "#7ef0b3",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
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
  notice: {
    color: "#c7f9d3",
    fontWeight: 700,
  },
  search: {
    minWidth: 320,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0c1330",
    color: "#eef2ff",
    padding: "12px 14px",
  },
  grid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  },
  card: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
  },
  kicker: {
    color: "#a7b0d8",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  cardTitle: {
    margin: "0 0 8px",
    fontSize: 20,
    fontWeight: 800,
  },
  price: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 10,
  },
  meta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    color: "#c7d2fe",
    fontSize: 13,
    marginBottom: 12,
  },
  description: {
    color: "#d7def7",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: 12,
    marginTop: 16,
    flexWrap: "wrap",
  },
  primaryLink: {
    textDecoration: "none",
    border: "none",
    color: "#08111f",
    background: "#6ea8fe",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
  },
  secondaryLink: {
    color: "#c7d2fe",
    textDecoration: "none",
    fontWeight: 700,
  },
  error: {
    color: "#ff9ead",
    fontWeight: 700,
  },
};
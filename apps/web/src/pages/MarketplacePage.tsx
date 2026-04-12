import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMarketplaceItems, type Item } from "../services/items";

export default function MarketplacePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError(err instanceof Error ? err.message : "Failed to load marketplace.");
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

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      const haystack = [
        item.title,
        item.description || "",
        item.category || "",
        item.condition || "",
        item.shop?.name || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [items, query]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Marketplace</h2>
          <p style={styles.subtitle}>
            Browse inventory across different pawnshop stores.
          </p>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items, shops, categories..."
          style={styles.search}
        />
      </div>

      {loading ? <div style={styles.card}>Loading marketplace...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && filteredItems.length === 0 ? (
        <div style={styles.card}>No items matched your search.</div>
      ) : null}

      <div style={styles.grid}>
        {filteredItems.map((item) => (
          <article key={item.id} style={styles.card}>
            <div style={styles.kicker}>{item.shop?.name || "Unknown Shop"}</div>
            <h3 style={styles.cardTitle}>{item.title}</h3>
            <div style={styles.price}>${Number(item.price || 0).toFixed(2)}</div>
            <div style={styles.meta}>
              <span>{item.category || "Uncategorized"}</span>
              <span>{item.condition || "Condition not listed"}</span>
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

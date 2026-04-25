import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { getMarketplaceShops, type Shop } from "../services/shops";

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextShops = await getMarketplaceShops();
        if (!cancelled) {
          setShops(nextShops);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load shops.");
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

  const filteredShops = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shops;

    return shops.filter((shop) => {
      const haystack = [
        shop.name,
        shop.address || "",
        shop.phone || "",
        shop.description || "",
        shop.hours || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [shops, query]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Shops</h2>
          <p style={styles.subtitle}>
            Browse pawnshop storefronts and explore inventory by store.
          </p>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shops by name, address, phone..."
          style={styles.search}
        />
      </div>

      {loading ? <div style={styles.card}>Loading shops...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && filteredShops.length === 0 ? (
        <div style={styles.card}>No shops matched your search.</div>
      ) : null}

      <div style={styles.grid}>
        {filteredShops.map((shop) => (
          <article key={shop.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{shop.name}</h3>

            <div style={styles.meta}>
              <div>{shop.address || "No address provided"}</div>
              <div>{shop.phone || "No phone listed"}</div>
              <div>{shop.hours || "Hours not listed"}</div>
            </div>

            {shop.description ? (
              <p style={styles.description}>{shop.description}</p>
            ) : null}

            <div style={styles.actions}>
              <Link to={`/shops/${shop.id}`} style={styles.primaryLink}>
                View Storefront
              </Link>
              <Link to="/marketplace" style={styles.secondaryLink}>
                Browse Inventory
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
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
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  },
  card: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
  },
  cardTitle: {
    margin: "0 0 12px",
    fontSize: 22,
    fontWeight: 800,
  },
  meta: {
    display: "grid",
    gap: 6,
    color: "#c7d2fe",
    fontSize: 14,
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

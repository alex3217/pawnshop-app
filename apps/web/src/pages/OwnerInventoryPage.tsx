import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyItems, type Item } from "../services/items";

export default function OwnerInventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextItems = await getMyItems();
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load inventory.");
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

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Owner Inventory</h2>
          <p style={styles.subtitle}>Manage the inventory tied to your pawn shops.</p>
        </div>

        <Link to="/owner/items/new" style={styles.primaryLink}>
          Create Item
        </Link>
      </div>

      {loading ? <div style={styles.card}>Loading inventory...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && items.length === 0 ? (
        <div style={styles.card}>No inventory found yet.</div>
      ) : null}

      <div style={styles.grid}>
        {items.map((item) => (
          <article key={item.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{item.title}</h3>
            <div style={styles.price}>${Number(item.price || 0).toFixed(2)}</div>
            <div style={styles.meta}>Status: {item.status}</div>
            <div style={styles.meta}>Shop ID: {item.pawnShopId}</div>
            {item.description ? (
              <p style={styles.description}>{item.description}</p>
            ) : null}
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
  cardTitle: {
    margin: "0 0 8px",
    fontSize: 20,
    fontWeight: 800,
  },
  price: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 8,
  },
  meta: {
    color: "#a7b0d8",
    marginTop: 6,
  },
  description: {
    color: "#d7def7",
    lineHeight: 1.5,
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
  error: {
    color: "#ff9ead",
    fontWeight: 700,
  },
};

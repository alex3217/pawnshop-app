import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMarketplaceItems, type Item } from "../services/items";

export default function ItemDetailPage() {
  const { id = "" } = useParams();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) {
        setError("Missing item id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextItems = await getMarketplaceItems();
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load item.");
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

  const item = useMemo(() => items.find((entry) => entry.id === id) || null, [items, id]);

  if (loading) return <div style={styles.card}>Loading item...</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!item) return <div style={styles.card}>Item not found.</div>;

  return (
    <div style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>{item.shop?.name || "Unknown Shop"}</div>
        <h2 style={styles.title}>{item.title}</h2>
        <div style={styles.price}>${Number(item.price || 0).toFixed(2)}</div>

        <div style={styles.metaRow}>
          <span style={styles.metaPill}>{item.status}</span>
          <span style={styles.metaPill}>{item.category || "Uncategorized"}</span>
          <span style={styles.metaPill}>{item.condition || "Condition not listed"}</span>
        </div>

        <p style={styles.description}>
          {item.description || "No description provided for this item yet."}
        </p>

        <div style={styles.shopBlock}>
          <div style={styles.shopTitle}>Shop</div>
          <div style={styles.shopName}>{item.shop?.name || "Unknown Shop"}</div>
          <div style={styles.shopMeta}>{item.shop?.address || "No address listed"}</div>
          <div style={styles.shopMeta}>{item.shop?.phone || "No phone listed"}</div>
        </div>

        <div style={styles.actions}>
          <Link to="/marketplace" style={styles.secondaryLink}>
            Back to Marketplace
          </Link>

          {item.pawnShopId ? (
            <Link to={`/shops/${item.pawnShopId}`} style={styles.primaryLink}>
              View Shop
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: "grid", gap: 20, color: "#eef2ff" },
  card: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
  },
  kicker: { color: "#a7b0d8", fontSize: 13, fontWeight: 700, marginBottom: 8 },
  title: { margin: 0, fontSize: 30, fontWeight: 800 },
  price: { fontSize: 28, fontWeight: 800, marginTop: 12 },
  metaRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 },
  metaPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(110,168,254,0.12)",
    color: "#cfe0ff",
    border: "1px solid rgba(110,168,254,0.2)",
    fontSize: 13,
    fontWeight: 700,
  },
  description: { color: "#d7def7", lineHeight: 1.6, marginTop: 18 },
  shopBlock: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    background: "#0c1330",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  shopTitle: { color: "#a7b0d8", fontSize: 13, fontWeight: 700, marginBottom: 8 },
  shopName: { fontSize: 20, fontWeight: 800 },
  shopMeta: { color: "#c7d2fe", marginTop: 6 },
  actions: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 },
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
    padding: "10px 2px",
  },
  error: { color: "#ff9ead", fontWeight: 700 },
};

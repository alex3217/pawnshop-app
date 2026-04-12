import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getShopItems, type Shop, type ShopItem } from "../services/shops";

export default function ShopDetailPage() {
  const { id = "" } = useParams();

  const [shop, setShop] = useState<Shop | null>(null);
  const [items, setItems] = useState<ShopItem[]>([]);
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

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Available Inventory</h3>

        {items.length === 0 ? (
          <div style={styles.card}>No items available for this shop.</div>
        ) : (
          <div style={styles.grid}>
            {items.map((item) => (
              <article key={item.id} style={styles.card}>
                <h4 style={styles.itemTitle}>{item.title}</h4>
                <div style={styles.price}>${Number(item.price || 0).toFixed(2)}</div>
                <div style={styles.meta}>{item.status}</div>
                {item.description ? (
                  <p style={styles.description}>{item.description}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
    color: "#eef2ff",
  },
  section: {
    display: "grid",
    gap: 14,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
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
};

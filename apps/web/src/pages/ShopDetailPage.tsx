// File: apps/web/src/pages/ShopDetailPage.tsx

import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { getShopItems, type Shop, type ShopItem } from "../services/shops";

function formatPrice(value: string | number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `$${num.toFixed(2)}`;
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
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Available Inventory</h3>
          <Link to="/auctions" style={styles.backLink}>
            Browse Auctions
          </Link>
        </div>

        {items.length === 0 ? (
          <div style={styles.card}>No items available for this shop.</div>
        ) : (
          <div style={styles.grid}>
            {items.map((item) => (
              <article key={item.id} style={styles.card}>
                <h4 style={styles.itemTitle}>{item.title}</h4>
                <div style={styles.price}>{formatPrice(item.price)}</div>

                <div style={styles.metaRow}>
                  <span style={{ ...styles.metaPill, ...getItemStatusTone(item.status) }}>
                    {item.status}
                  </span>
                  {item.category ? <span style={styles.metaPill}>{item.category}</span> : null}
                  {item.condition ? <span style={styles.metaPill}>{item.condition}</span> : null}
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
};
// File: apps/web/src/pages/OwnerInventoryPage.tsx

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { getMyItems, type Item } from "../services/items";

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

export default function OwnerInventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const nextItems = await getMyItems();
      setItems(nextItems);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(() => {
    return items.filter((item) =>
      ["AVAILABLE", "PENDING", "ACTIVE"].includes(
        String(item.status || "").toUpperCase()
      )
    ).length;
  }, [items]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Owner Inventory</h2>
          <p style={styles.subtitle}>Manage the inventory tied to your pawn shops.</p>
        </div>

        <div style={styles.actions}>
          <Link to="/owner/items/new" style={styles.primaryLink}>
            Create Item
          </Link>

          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            style={{
              ...styles.secondaryButton,
              ...(loading || refreshing ? styles.disabledButton : {}),
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {!loading && !error ? (
        <div style={styles.summary}>
          Total items: {items.length} · Active items: {activeCount}
        </div>
      ) : null}

      {loading ? <div style={styles.card}>Loading inventory...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && items.length === 0 ? (
        <div style={styles.card}>
          <strong>No inventory found yet.</strong>
          <p style={styles.subtitle}>Create your first item to get started.</p>
        </div>
      ) : null}

      <div style={styles.grid}>
        {items.map((item) => (
          <article key={item.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{item.title}</h3>
            <div style={styles.price}>{formatPrice(item.price)}</div>

            <div style={styles.metaRow}>
              <span style={{ ...styles.metaPill, ...getItemStatusTone(item.status) }}>
                {item.status}
              </span>
              {item.category ? <span style={styles.metaPill}>{item.category}</span> : null}
              {item.condition ? <span style={styles.metaPill}>{item.condition}</span> : null}
            </div>

            <div style={styles.meta}>Shop: {item.shop?.name || item.pawnShopId}</div>

            {item.description ? (
              <p style={styles.description}>{item.description}</p>
            ) : null}

            <div style={styles.actionRow}>
              <Link to={`/items/${item.id}`} style={styles.linkButton}>
                View Item
              </Link>
              {item.pawnShopId ? (
                <Link to={`/shops/${item.pawnShopId}`} style={styles.linkButton}>
                  View Shop
                </Link>
              ) : null}
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
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  summary: {
    color: "#c7d2fe",
    fontWeight: 700,
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
    marginTop: 12,
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
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
  linkButton: {
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#121935",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#121935",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
  error: {
    color: "#ff9ead",
    fontWeight: 700,
  },
};
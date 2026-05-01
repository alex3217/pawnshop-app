import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { deleteItem, getMyItems, markItemSold, type Item } from "../services/items";

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
  const [actionItemId, setActionItemId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
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
        String(item.status || "").toUpperCase(),
      )
    ).length;
  }, [items]);

  async function handleMarkSold(item: Item) {
    if (!item.id || actionItemId) return;

    const confirmed = window.confirm(`Mark "${item.title}" as sold?`);
    if (!confirmed) return;

    setActionItemId(item.id);
    setNotice(null);
    setError(null);

    try {
      await markItemSold(item.id);
      setNotice(`Marked "${item.title}" as sold.`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark item sold.");
    } finally {
      setActionItemId("");
    }
  }

  async function handleDelete(item: Item) {
    if (!item.id || actionItemId) return;

    const confirmed = window.confirm(`Delete/archive "${item.title}"?`);
    if (!confirmed) return;

    setActionItemId(item.id);
    setNotice(null);
    setError(null);

    try {
      await deleteItem(item.id);
      setNotice(`Deleted/archived "${item.title}".`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setActionItemId("");
    }
  }

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

      {notice ? <div style={styles.notice}>{notice}</div> : null}
      {loading ? <div style={styles.card}>Loading inventory...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && items.length === 0 ? (
        <div style={styles.card}>
          <strong>No inventory found yet.</strong>
          <p style={styles.subtitle}>Create your first item to get started.</p>
        </div>
      ) : null}

      <div style={styles.grid}>
        {items.map((item) => {
          const isActioning = actionItemId === item.id;
          const isSold = String(item.status || "").toUpperCase() === "SOLD";

          return (
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

                <Link to={`/owner/items/${item.id}/edit`} style={styles.primarySmallLink}>
                  Edit Item
                </Link>

                {item.pawnShopId ? (
                  <Link to={`/shops/${item.pawnShopId}`} style={styles.linkButton}>
                    View Shop
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={() => handleMarkSold(item)}
                  disabled={isActioning || isSold}
                  style={{
                    ...styles.smallButton,
                    ...(isActioning || isSold ? styles.disabledButton : {}),
                  }}
                >
                  {isActioning ? "Working..." : isSold ? "Sold" : "Mark Sold"}
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={isActioning}
                  style={{
                    ...styles.dangerSmallButton,
                    ...(isActioning ? styles.disabledButton : {}),
                  }}
                >
                  Delete / Archive
                </button>
              </div>
            </article>
          );
        })}
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
  primarySmallLink: {
    textDecoration: "none",
    border: "none",
    color: "#08111f",
    background: "#6ea8fe",
    padding: "9px 12px",
    borderRadius: 12,
    fontWeight: 800,
  },
  linkButton: {
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#121935",
    padding: "9px 12px",
    borderRadius: 12,
    fontWeight: 700,
  },
  smallButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#121935",
    padding: "9px 12px",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
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
  dangerSmallButton: {
    border: "1px solid rgba(248,113,113,0.35)",
    color: "#fecaca",
    background: "rgba(220,38,38,0.14)",
    padding: "9px 12px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
  notice: {
    color: "#c7f9d3",
    fontWeight: 700,
  },
  error: {
    color: "#ff9ead",
    fontWeight: 700,
  },
};

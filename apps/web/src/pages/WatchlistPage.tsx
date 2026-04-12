import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMyWatchlist,
  removeFromWatchlist,
  type WatchlistEntry,
} from "../services/watchlist";

export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadWatchlist() {
    setLoading(true);
    setError(null);

    try {
      const nextEntries = await getMyWatchlist();
      setEntries(nextEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlist.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWatchlist();
  }, []);

  async function handleRemove(itemId: string) {
    try {
      setRemovingId(itemId);
      await removeFromWatchlist(itemId);
      await loadWatchlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove item.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>My Watchlist</h2>

      {loading ? <div style={styles.card}>Loading watchlist...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && entries.length === 0 ? (
        <div style={styles.card}>You have not saved any items yet.</div>
      ) : null}

      <div style={styles.grid}>
        {entries.map((entry) => (
          <article key={entry.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{entry.item?.title || "Unknown Item"}</h3>
            <div style={styles.meta}>Shop: {entry.item?.shop?.name || "Unknown Shop"}</div>
            <div style={styles.amount}>${Number(entry.item?.price || 0).toFixed(2)}</div>
            <div style={styles.meta}>Status: {entry.item?.status || "UNKNOWN"}</div>

            <div style={styles.actions}>
              {entry.item?.id ? (
                <Link to={`/items/${entry.item.id}`} style={styles.primaryLink}>
                  View Item
                </Link>
              ) : null}

              {entry.item?.pawnShopId ? (
                <Link to={`/shops/${entry.item.pawnShopId}`} style={styles.secondaryLink}>
                  View Shop
                </Link>
              ) : null}

              {entry.item?.id ? (
                <button
                  type="button"
                  onClick={() => handleRemove(entry.item!.id)}
                  disabled={removingId === entry.item?.id}
                  style={styles.removeButton}
                >
                  {removingId === entry.item?.id ? "Removing..." : "Remove"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: "grid", gap: 20, color: "#eef2ff" },
  title: { margin: 0, fontSize: 30, fontWeight: 800 },
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
  cardTitle: { margin: "0 0 8px", fontSize: 20, fontWeight: 800 },
  amount: { fontSize: 22, fontWeight: 800, marginTop: 8 },
  meta: { color: "#a7b0d8", marginTop: 6 },
  error: { color: "#ff9ead", fontWeight: 700 },
  actions: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 },
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
  removeButton: {
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#ff9ead",
    color: "#08111f",
    fontWeight: 800,
    cursor: "pointer",
  },
};

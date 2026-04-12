import { useEffect, useState } from "react";
import {
  getMySavedSearches,
  removeSavedSearch,
  type SavedSearch,
} from "../services/savedSearches";

export default function SavedSearchesPage() {
  const [entries, setEntries] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadSavedSearches() {
    setLoading(true);
    setError(null);

    try {
      const nextEntries = await getMySavedSearches();
      setEntries(nextEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved searches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSavedSearches();
  }, []);

  async function handleRemove(id: string) {
    try {
      setRemovingId(id);
      await removeSavedSearch(id);
      await loadSavedSearches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove saved search.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Saved Searches</h2>

      {loading ? <div style={styles.card}>Loading saved searches...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && entries.length === 0 ? (
        <div style={styles.card}>You do not have any saved searches yet.</div>
      ) : null}

      <div style={styles.grid}>
        {entries.map((entry) => (
          <article key={entry.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{entry.query}</h3>
            <div style={styles.meta}>
              Saved {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "recently"}
            </div>

            <div style={styles.actions}>
              <button
                type="button"
                onClick={() => handleRemove(entry.id)}
                disabled={removingId === entry.id}
                style={styles.removeButton}
              >
                {removingId === entry.id ? "Removing..." : "Remove"}
              </button>
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
  meta: { color: "#a7b0d8", marginTop: 6 },
  error: { color: "#ff9ead", fontWeight: 700 },
  actions: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 },
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

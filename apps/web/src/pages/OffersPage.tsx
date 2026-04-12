import { useEffect, useState } from "react";
import { getMyOffers, type Offer } from "../services/offers";

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextOffers = await getMyOffers();
        if (!cancelled) {
          setOffers(nextOffers);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load offers.");
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
      <h2 style={styles.title}>My Offers</h2>

      {loading ? <div style={styles.card}>Loading offers...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && offers.length === 0 ? (
        <div style={styles.card}>You have not submitted any offers yet.</div>
      ) : null}

      <div style={styles.grid}>
        {offers.map((offer) => (
          <article key={offer.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{offer.item?.title || "Unknown Item"}</h3>
            <div style={styles.meta}>Shop: {offer.item?.shop?.name || "Unknown Shop"}</div>
            <div style={styles.amount}>Offer: ${Number(offer.amount || 0).toFixed(2)}</div>
            <div style={styles.meta}>Status: {offer.status}</div>
            {offer.message ? <p style={styles.message}>{offer.message}</p> : null}
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
  message: { color: "#d7def7", lineHeight: 1.5, marginTop: 10 },
  error: { color: "#ff9ead", fontWeight: 700 },
};

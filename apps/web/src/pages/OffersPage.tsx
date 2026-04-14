import { useEffect, useState } from "react";
import { getAuthRole } from "../services/auth";
import {
  acceptCounterOffer,
  acceptOffer,
  counterOffer,
  declineCounterOffer,
  getMyOffers,
  getOwnerOffers,
  rejectOffer,
  type Offer,
} from "../services/offers";

export default function OffersPage() {
  const role = getAuthRole();
  const isOwnerView = role === "OWNER" || role === "ADMIN";

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  async function loadOffers() {
    setLoading(true);
    setError(null);

    try {
      const nextOffers = isOwnerView ? await getOwnerOffers() : await getMyOffers();
      setOffers(nextOffers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load offers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOffers();
  }, [isOwnerView]);

  async function handleAccept(id: string) {
    try {
      setActioningId(id);
      await acceptOffer(id);
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept offer.");
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(id: string) {
    try {
      setActioningId(id);
      await rejectOffer(id);
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject offer.");
    } finally {
      setActioningId(null);
    }
  }

  async function handleCounter(offer: Offer) {
    const nextAmountRaw = window.prompt(
      "Enter counteroffer amount",
      String(offer.amount ?? "")
    );
    if (nextAmountRaw == null) return;

    const nextAmount = Number(nextAmountRaw);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setError("Counteroffer amount must be a valid number.");
      return;
    }

    const nextMessage =
      window.prompt("Optional counteroffer message", offer.counterMessage || offer.message || "") ||
      "";

    try {
      setActioningId(offer.id);
      await counterOffer({
        offerId: offer.id,
        counterAmount: nextAmount,
        counterMessage: nextMessage,
      });
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to counter offer.");
    } finally {
      setActioningId(null);
    }
  }

  async function handleAcceptCounter(id: string) {
    try {
      setActioningId(id);
      await acceptCounterOffer(id);
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept counteroffer.");
    } finally {
      setActioningId(null);
    }
  }

  async function handleDeclineCounter(id: string) {
    try {
      setActioningId(id);
      await declineCounterOffer(id);
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decline counteroffer.");
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>{isOwnerView ? "Incoming Offers" : "My Offers"}</h2>

      {loading ? <div style={styles.card}>Loading offers...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && offers.length === 0 ? (
        <div style={styles.card}>
          {isOwnerView ? "No incoming offers yet." : "You have not submitted any offers yet."}
        </div>
      ) : null}

      <div style={styles.grid}>
        {offers.map((offer) => (
          <article key={offer.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{offer.item?.title || "Unknown Item"}</h3>
            <div style={styles.meta}>Shop: {offer.item?.shop?.name || "Unknown Shop"}</div>
            <div style={styles.amount}>Offer: ${Number(offer.amount || 0).toFixed(2)}</div>
            <div style={styles.meta}>Status: {offer.status}</div>

            {offer.counterAmount ? (
              <div style={styles.counterBox}>
                Counter: ${Number(offer.counterAmount || 0).toFixed(2)}
                {offer.counterMessage ? (
                  <div style={styles.counterMessage}>{offer.counterMessage}</div>
                ) : null}
              </div>
            ) : null}

            {offer.message ? <p style={styles.message}>{offer.message}</p> : null}

            {isOwnerView && offer.status === "PENDING" ? (
              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => handleAccept(offer.id)}
                  disabled={actioningId === offer.id}
                  style={styles.acceptButton}
                >
                  {actioningId === offer.id ? "Working..." : "Accept"}
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(offer.id)}
                  disabled={actioningId === offer.id}
                  style={styles.rejectButton}
                >
                  {actioningId === offer.id ? "Working..." : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => handleCounter(offer)}
                  disabled={actioningId === offer.id}
                  style={styles.counterButton}
                >
                  {actioningId === offer.id ? "Working..." : "Counter"}
                </button>
              </div>
            ) : null}

            {!isOwnerView && offer.status === "COUNTERED" ? (
              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => handleAcceptCounter(offer.id)}
                  disabled={actioningId === offer.id}
                  style={styles.acceptButton}
                >
                  {actioningId === offer.id ? "Working..." : "Accept Counter"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeclineCounter(offer.id)}
                  disabled={actioningId === offer.id}
                  style={styles.rejectButton}
                >
                  {actioningId === offer.id ? "Working..." : "Decline Counter"}
                </button>
              </div>
            ) : null}
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
  actions: { display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" },
  acceptButton: {
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#7ef0b3",
    color: "#08111f",
    fontWeight: 800,
    cursor: "pointer",
  },
  rejectButton: {
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#ff9ead",
    color: "#08111f",
    fontWeight: 800,
    cursor: "pointer",
  },
  counterButton: {
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#ffd98a",
    color: "#08111f",
    fontWeight: 800,
    cursor: "pointer",
  },
  counterBox: {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255, 217, 138, 0.14)",
    color: "#ffe6ab",
    border: "1px solid rgba(255, 217, 138, 0.24)",
    fontWeight: 700,
  },
  counterMessage: {
    marginTop: 6,
    color: "#f6f1dd",
    fontWeight: 500,
  },
};

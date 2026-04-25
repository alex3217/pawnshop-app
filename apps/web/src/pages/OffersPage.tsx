// File: apps/web/src/pages/OffersPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const isOwnerView = useMemo(
    () => role === "OWNER" || role === "ADMIN",
    [role]
  );

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextOffers = isOwnerView
        ? await getOwnerOffers()
        : await getMyOffers();

      setOffers(nextOffers);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load offers.");
    } finally {
      setLoading(false);
    }
  }, [isOwnerView]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  const handleAccept = useCallback(
    async (id: string) => {
      try {
        setActioningId(id);
        setError(null);
        await acceptOffer(id);
        await loadOffers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to accept offer.");
      } finally {
        setActioningId(null);
      }
    },
    [loadOffers]
  );

  const handleReject = useCallback(
    async (id: string) => {
      try {
        setActioningId(id);
        setError(null);
        await rejectOffer(id);
        await loadOffers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to reject offer.");
      } finally {
        setActioningId(null);
      }
    },
    [loadOffers]
  );

  const handleCounter = useCallback(
    async (offer: Offer) => {
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
        window.prompt(
          "Optional counteroffer message",
          offer.counterMessage || offer.message || ""
        ) || "";

      try {
        setActioningId(offer.id);
        setError(null);
        await counterOffer({
          offerId: offer.id,
          counterAmount: nextAmount,
          counterMessage: nextMessage,
        });
        await loadOffers();
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to counter offer."
        );
      } finally {
        setActioningId(null);
      }
    },
    [loadOffers]
  );

  const handleAcceptCounter = useCallback(
    async (id: string) => {
      try {
        setActioningId(id);
        setError(null);
        await acceptCounterOffer(id);
        await loadOffers();
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to accept counteroffer."
        );
      } finally {
        setActioningId(null);
      }
    },
    [loadOffers]
  );

  const handleDeclineCounter = useCallback(
    async (id: string) => {
      try {
        setActioningId(id);
        setError(null);
        await declineCounterOffer(id);
        await loadOffers();
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to decline counteroffer."
        );
      } finally {
        setActioningId(null);
      }
    },
    [loadOffers]
  );

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>{isOwnerView ? "Incoming Offers" : "My Offers"}</h2>

      {loading ? <div style={styles.card}>Loading offers...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && offers.length === 0 ? (
        <div style={styles.card}>
          {isOwnerView
            ? "No incoming offers yet."
            : "You have not submitted any offers yet."}
        </div>
      ) : null}

      <div style={styles.grid}>
        {offers.map((offer) => (
          <article key={offer.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{offer.item?.title || "Unknown Item"}</h3>
            <div style={styles.meta}>Shop: {offer.item?.shop?.name || "Unknown Shop"}</div>
            <div style={styles.amount}>
              Offer: ${Number(offer.amount || 0).toFixed(2)}
            </div>
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
                  onClick={() => void handleAccept(offer.id)}
                  disabled={actioningId === offer.id}
                  style={styles.acceptButton}
                >
                  {actioningId === offer.id ? "Working..." : "Accept"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleReject(offer.id)}
                  disabled={actioningId === offer.id}
                  style={styles.rejectButton}
                >
                  {actioningId === offer.id ? "Working..." : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCounter(offer)}
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
                  onClick={() => void handleAcceptCounter(offer.id)}
                  disabled={actioningId === offer.id}
                  style={styles.acceptButton}
                >
                  {actioningId === offer.id ? "Working..." : "Accept Counter"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeclineCounter(offer.id)}
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
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    display: "grid",
    gap: 10,
  },
  cardTitle: { margin: 0, fontSize: 20, fontWeight: 700 },
  meta: { color: "#a5b4fc", fontSize: 14 },
  amount: { fontSize: 18, fontWeight: 700 },
  message: {
    margin: 0,
    color: "#e5e7eb",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 12,
  },
  counterBox: {
    background: "rgba(59,130,246,0.12)",
    border: "1px solid rgba(96,165,250,0.3)",
    color: "#dbeafe",
    borderRadius: 12,
    padding: 12,
    fontWeight: 600,
  },
  counterMessage: {
    marginTop: 8,
    color: "#bfdbfe",
    fontWeight: 400,
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  acceptButton: {
    border: "none",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
    background: "#22c55e",
    color: "#08110d",
  },
  rejectButton: {
    border: "none",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
    background: "#ef4444",
    color: "#fff",
  },
  counterButton: {
    border: "none",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
    background: "#3b82f6",
    color: "#fff",
  },
  error: {
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#fecaca",
    borderRadius: 14,
    padding: 14,
  },
};
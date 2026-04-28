import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import { getOwnerOffers, type Offer } from "../../services/offers";

export default function AdminOffersPage() {
  const [rows, setRows] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);

    try {
      const offers = await getOwnerOffers();
      setRows(offers);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load offers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load("initial");
  }, []);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      pending: rows.filter((row) => row.status === "PENDING").length,
      accepted: rows.filter((row) => row.status === "ACCEPTED").length,
      countered: rows.filter((row) => row.status === "COUNTERED").length,
      rejected: rows.filter((row) => row.status === "REJECTED").length,
    };
  }, [rows]);

  return (
    <AdminPageShell
      title="Offers"
      subtitle="Monitor offer activity across marketplace negotiations."
      actions={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load("refresh")}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {error ? <div className="error-text">{error}</div> : null}
      {loading ? <p className="muted">Loading offers…</p> : null}

      {!loading ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}
        >
          <div className="list-card">
            <div className="muted">Offers</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.total}</div>
          </div>
          <div className="list-card">
            <div className="muted">Pending</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.pending}</div>
          </div>
          <div className="list-card">
            <div className="muted">Accepted</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.accepted}</div>
          </div>
          <div className="list-card">
            <div className="muted">Countered</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.countered}</div>
          </div>
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="list-card">
          <strong>No offers found</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            No marketplace offers are visible right now.
          </p>
        </div>
      ) : null}

      <div className="grid">
        {rows.map((offer) => (
          <div key={offer.id} className="list-card">
            <strong>{offer.item?.title || "Unknown Item"}</strong>
            <div className="muted">Shop: {offer.item?.shop?.name || "Unknown Shop"}</div>
            <div className="muted">Status: {offer.status}</div>
            <div className="muted">
              Offer: ${Number(offer.amount || 0).toFixed(2)}
            </div>

            {offer.counterAmount ? (
              <div className="muted">
                Counter: ${Number(offer.counterAmount || 0).toFixed(2)}
              </div>
            ) : null}

            {offer.message ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                {offer.message}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              {offer.item?.id ? (
                <Link to={`/items/${offer.item.id}`} className="btn btn-primary">
                  View Item
                </Link>
              ) : null}

              {offer.item?.shop?.id ? (
                <Link to={`/shops/${offer.item.shop.id}`} className="btn btn-secondary">
                  View Shop
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </AdminPageShell>
  );
}

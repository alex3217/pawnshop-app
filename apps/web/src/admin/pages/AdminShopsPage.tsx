import { useCallback, useEffect, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi, type AdminShopRow } from "../services/adminApi";

export default function AdminShopsPage() {
  const [rows, setRows] = useState<AdminShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const shops = await adminApi.getShops();
      setRows(Array.isArray(shops) ? shops : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load shops.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDelete = useCallback(async (shop: AdminShopRow) => {
    setBusyId(shop.id);
    setError(null);

    try {
      if (shop.isDeleted) {
        await adminApi.restoreShop(shop.id);
      } else {
        await adminApi.softDeleteShop(shop.id);
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === shop.id ? { ...row, isDeleted: !shop.isDeleted } : row
        )
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed shop moderation action."
      );
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <AdminPageShell
      title="Shops"
      subtitle="Inspect all shops and soft delete or restore them from one place."
      actions={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {error ? <div className="error-text">{error}</div> : null}
      {loading ? <p className="muted">Loading shops…</p> : null}

      {!loading && rows.length === 0 ? (
        <div className="list-card">
          <strong>No shops found</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            There are no admin-visible shops right now.
          </p>
        </div>
      ) : null}

      <div className="grid">
        {rows.map((shop) => (
          <div key={shop.id} className="list-card">
            <strong>{shop.name}</strong>
            <div className="muted">Address: {shop.address ?? "Unknown"}</div>
            <div className="muted">Phone: {shop.phone ?? "Unknown"}</div>
            <div className="muted">Deleted: {String(Boolean(shop.isDeleted))}</div>
            <div className="muted">Owner: {shop.ownerId ?? "Unknown"}</div>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className={shop.isDeleted ? "btn btn-secondary" : "btn btn-ghost"}
                onClick={() => void toggleDelete(shop)}
                disabled={busyId === shop.id}
              >
                {busyId === shop.id
                  ? "Working..."
                  : shop.isDeleted
                    ? "Restore"
                    : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </AdminPageShell>
  );
}

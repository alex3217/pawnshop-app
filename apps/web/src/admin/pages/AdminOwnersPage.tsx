import { useEffect, useMemo, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi, type AdminUserRow } from "../services/adminApi";

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function AdminOwnersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);

    try {
      const users = await adminApi.getUsers();
      const owners = users.filter((user) => user.role === "OWNER");
      setRows(owners);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load owners.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load("initial");
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const blocked = rows.filter((row) => row.isBlocked).length;
    const active = total - blocked;

    return { total, active, blocked };
  }, [rows]);

  return (
    <AdminPageShell
      title="Owners"
      subtitle="Review owner accounts and track active versus blocked operator access."
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
      {loading ? <p className="muted">Loading owners…</p> : null}

      {!loading ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}
        >
          <div className="list-card">
            <div className="muted">Total Owners</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.total}</div>
          </div>
          <div className="list-card">
            <div className="muted">Active Owners</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.active}</div>
          </div>
          <div className="list-card">
            <div className="muted">Blocked Owners</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.blocked}</div>
          </div>
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="list-card">
          <strong>No owners found</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            There are no owner accounts visible to admin right now.
          </p>
        </div>
      ) : null}

      <div className="grid">
        {rows.map((owner) => (
          <div key={owner.id} className="list-card">
            <strong>{owner.name || "Unnamed Owner"}</strong>
            <div className="muted">Email: {owner.email}</div>
            <div className="muted">Role: {owner.role}</div>
            <div className="muted">Blocked: {String(Boolean(owner.isBlocked))}</div>
            <div className="muted">Created: {formatDate(owner.createdAt)}</div>
          </div>
        ))}
      </div>
    </AdminPageShell>
  );
}

// File: apps/web/src/pages/AdminItemsPage.tsx

import { useEffect, useState } from "react";
import { API_BASE } from "../config";
import { getAuthRole, getAuthToken } from "../services/auth";

type AdminItem = {
  id: string;
  title: string;
  price: string;
  isDeleted: boolean;
  shop?: {
    name: string;
  };
};

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export default function AdminItemsPage() {
  const token = getAuthToken();
  const role = getAuthRole();

  const [rows, setRows] = useState<AdminItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      console.log("[AdminItemsPage] loading items", {
        hasToken: Boolean(token),
        role,
        url: `${API_BASE}/admin/items`,
      });

      const res = await fetch(`${API_BASE}/admin/items`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const json = await parseJsonSafe(res);

      console.log("[AdminItemsPage] load response", {
        status: res.status,
        ok: res.ok,
        count: Array.isArray(json) ? json.length : 0,
        json,
      });

      if (!res.ok) {
        throw new Error(json?.error || `Failed to load items (${res.status})`);
      }

      setRows(Array.isArray(json) ? json : []);
    } catch (err: unknown) {
      console.error("[AdminItemsPage] load error", err);

      const message =
        err instanceof Error ? err.message : "Failed to load items";
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setError("Missing admin token. Please log in again.");
      setLoading(false);
      return;
    }

    if (role !== "ADMIN") {
      setError("You must be logged in as an admin to view this page.");
      setLoading(false);
      return;
    }

    load();
  }, [token, role]);

  async function toggleDelete(item: AdminItem) {
    setBusyId(item.id);
    setError(null);

    try {
      const method = item.isDeleted ? "PATCH" : "DELETE";
      const path = item.isDeleted
        ? `${API_BASE}/admin/items/${item.id}/restore`
        : `${API_BASE}/admin/items/${item.id}`;

      console.log("[AdminItemsPage] moderation request", {
        method,
        path,
        itemId: item.id,
        currentDeletedState: item.isDeleted,
      });

      const res = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await parseJsonSafe(res);

      console.log("[AdminItemsPage] moderation response", {
        status: res.status,
        ok: res.ok,
        json,
      });

      if (!res.ok) {
        throw new Error(
          json?.error || `Moderation action failed (${res.status})`
        );
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, isDeleted: !item.isDeleted } : row
        )
      );
    } catch (err: unknown) {
      console.error("[AdminItemsPage] moderation error", err);

      const message =
        err instanceof Error ? err.message : "Failed moderation action";
      setError(message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-card">
        <div className="toolbar">
          <div>
            <div className="section-title">Admin Items</div>
            <div className="section-subtitle">
              Review inventory and delete or restore listings.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="muted" style={{ fontSize: 12 }}>
          Role: {role ?? "none"} · Token present: {String(Boolean(token))} ·
          Items loaded: {rows.length}
        </div>

        {error ? <div className="error-text">{error}</div> : null}
        {loading ? <p className="muted">Loading items…</p> : null}

        {!loading && rows.length === 0 ? (
          <div className="list-card">
            <strong>No items found</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              There are no admin-visible items right now.
            </p>
          </div>
        ) : null}

        <div className="grid">
          {rows.map((item) => (
            <div key={item.id} className="list-card">
              <strong>{item.title}</strong>
              <div className="muted">Shop: {item.shop?.name ?? "Unknown"}</div>
              <div className="muted">Price: ${item.price}</div>
              <div className="muted">Deleted: {String(item.isDeleted)}</div>

              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className={item.isDeleted ? "btn btn-secondary" : "btn btn-ghost"}
                  onClick={() => toggleDelete(item)}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id
                    ? "Working..."
                    : item.isDeleted
                    ? "Restore"
                    : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
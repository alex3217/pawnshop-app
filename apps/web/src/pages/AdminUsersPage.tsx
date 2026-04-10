// File: apps/web/src/pages/AdminUsersPage.tsx

import { useEffect, useState } from "react";
import { API_BASE } from "../config";
import { getAuthToken } from "../services/auth";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export default function AdminUsersPage() {
  const token = getAuthToken();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error(json?.error || "Failed to load users");

        setRows(Array.isArray(json) ? json : []);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load users";
        setError(message);
      }
    }

    load();
  }, [token]);

  return (
    <div>
      <h2>Admin Users</h2>
      {error ? <div style={{ color: "crimson" }}>{error}</div> : null}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((user) => (
          <div key={user.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>{user.name}</div>
            <div>{user.email}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Role: {user.role} · Active: {String(user.isActive)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
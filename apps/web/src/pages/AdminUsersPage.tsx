// File: apps/web/src/pages/AdminUsersPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageShell from "../admin/components/AdminPageShell";
import AdminTableShell from "../admin/components/AdminTableShell";
import { adminApi, type AdminUserRow } from "../admin/services/adminApi";
import type { AdminTableConfig } from "../admin/types/admin";

function formatDateTime(value?: string) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const users = await adminApi.getUsers();
      setRows(users);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleBlocked = useCallback(async (user: AdminUserRow) => {
    setBusyId(user.id);
    setError(null);

    try {
      if (user.isBlocked) {
        await adminApi.unblockUser(user.id);
      } else {
        await adminApi.blockUser(user.id);
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === user.id ? { ...row, isBlocked: !user.isBlocked } : row
        )
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed user moderation action."
      );
    } finally {
      setBusyId(null);
    }
  }, []);

  const tableConfig = useMemo<AdminTableConfig<AdminUserRow>>(
    () => ({
      key: "admin-users",
      title: "Users",
      emptyMessage: "There are no admin-visible users right now.",
      rowKey: (row) => row.id,
      columns: [
        {
          key: "name",
          header: "Name",
          render: (row) => row.name || "Unknown",
        },
        {
          key: "email",
          header: "Email",
          render: (row) => row.email,
        },
        {
          key: "role",
          header: "Role",
          render: (row) => row.role,
        },
        {
          key: "status",
          header: "Status",
          render: (row) => (row.isBlocked ? "Blocked" : "Active"),
        },
        {
          key: "createdAt",
          header: "Created",
          render: (row) => formatDateTime(row.createdAt),
        },
        {
          key: "actions",
          header: "Actions",
          render: (row) => (
            <button
              type="button"
              className={row.isBlocked ? "btn btn-secondary" : "btn btn-ghost"}
              onClick={() => void toggleBlocked(row)}
              disabled={busyId === row.id}
            >
              {busyId === row.id
                ? "Working..."
                : row.isBlocked
                  ? "Unblock"
                  : "Block"}
            </button>
          ),
        },
      ],
    }),
    [busyId, toggleBlocked]
  );

  return (
    <AdminPageShell
      title="Users"
      subtitle="Inspect platform users and block or unblock accounts."
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
      <AdminTableShell
        config={tableConfig}
        rows={rows}
        loading={loading}
        error={error}
      />
    </AdminPageShell>
  );
}

// File: apps/web/src/pages/AdminItemsPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../admin/components/AdminPageShell";
import AdminTableShell from "../admin/components/AdminTableShell";
import { adminApi, type AdminItemRow } from "../admin/services/adminApi";
import type { AdminTableConfig } from "../admin/types/admin";

function formatMoney(value?: string | number | null, currency = "USD") {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(num);
}

export default function AdminItemsPage() {
  const [rows, setRows] = useState<AdminItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const items = await adminApi.getItems();
      setRows(items);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDeleted = useCallback(async (item: AdminItemRow) => {
    setBusyId(item.id);
    setError(null);

    try {
      if (item.isDeleted) {
        await adminApi.restoreItem(item.id);
      } else {
        await adminApi.softDeleteItem(item.id);
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, isDeleted: !item.isDeleted } : row
        )
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed inventory moderation action."
      );
    } finally {
      setBusyId(null);
    }
  }, []);

  const tableConfig = useMemo<AdminTableConfig<AdminItemRow>>(
    () => ({
      key: "admin-inventory",
      title: "Inventory",
      emptyMessage: "There are no admin-visible listings right now.",
      rowKey: (row) => row.id,
      columns: [
        {
          key: "title",
          header: "Item",
          render: (row) => (
            <div style={{ display: "grid", gap: 6 }}>
              <strong>{row.title}</strong>
              <div className="muted">Shop: {row.shop?.name || "Unknown"}</div>
            </div>
          ),
        },
        {
          key: "price",
          header: "Price",
          render: (row) => formatMoney(row.price, row.currency || "USD"),
        },
        {
          key: "category",
          header: "Category",
          render: (row) => row.category || "—",
        },
        {
          key: "condition",
          header: "Condition",
          render: (row) => row.condition || "—",
        },
        {
          key: "status",
          header: "Status",
          render: (row) => row.status || "—",
        },
        {
          key: "deleted",
          header: "Deleted",
          render: (row) => String(Boolean(row.isDeleted)),
        },
        {
          key: "actions",
          header: "Actions",
          render: (row) => (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link to={`/items/${row.id}`} className="btn btn-secondary">
                View
              </Link>

              <button
                type="button"
                className={row.isDeleted ? "btn btn-secondary" : "btn btn-ghost"}
                onClick={() => void toggleDeleted(row)}
                disabled={busyId === row.id}
              >
                {busyId === row.id
                  ? "Working..."
                  : row.isDeleted
                    ? "Restore"
                    : "Delete"}
              </button>
            </div>
          ),
        },
      ],
    }),
    [busyId, toggleDeleted]
  );

  return (
    <AdminPageShell
      title="Inventory"
      subtitle="Inspect marketplace listings and soft delete or restore them."
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

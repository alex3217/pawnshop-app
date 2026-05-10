import { useEffect, useMemo, useState } from "react";
import AdminPageShell from "../admin/components/AdminPageShell";
import { adminApi } from "../admin/services/adminApi";
import type { AdminItemRow } from "../admin/services/adminApi";
import {
  compareValues,
  downloadCsv,
  formatDate,
  formatMoney,
  includesSearch,
  type SortDirection,
} from "../admin/utils/adminControlUtils";

type StatusFilter = "ALL" | "ACTIVE" | "DELETED";

function getShopName(item: AdminItemRow) {
  const shop = (item as Record<string, unknown>).shop;
  if (shop && typeof shop === "object") {
    const name = (shop as Record<string, unknown>).name;
    return name ? String(name) : "Unknown shop";
  }

  return "Unknown shop";
}

function getItemStatus(item: AdminItemRow) {
  return item.isDeleted ? "DELETED" : String(item.status || "ACTIVE");
}

export default function AdminItemsPage() {
  const [items, setItems] = useState<AdminItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<keyof AdminItemRow>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      setItems(await adminApi.getItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) =>
        includesSearch(item as Record<string, unknown>, query, [
          "id",
          "title",
          "category",
          "condition",
          "status",
          "description",
        ]) || getShopName(item).toLowerCase().includes(query.trim().toLowerCase()),
      )
      .filter((item) => {
        if (statusFilter === "ALL") return true;
        if (statusFilter === "DELETED") return item.isDeleted === true;
        return item.isDeleted !== true;
      })
      .sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDirection));
  }, [items, query, sortDirection, sortKey, statusFilter]);

  async function toggleItem(item: AdminItemRow) {
    if (!item.id || busyId) return;

    const currentlyDeleted = item.isDeleted === true;
    const confirmed = window.confirm(
      `${currentlyDeleted ? "Restore" : "Delete"} "${item.title || item.id}"?`,
    );

    if (!confirmed) return;

    setBusyId(item.id);
    setError("");
    setNotice("");

    try {
      if (currentlyDeleted) {
        await adminApi.restoreItem(item.id);
      } else {
        await adminApi.softDeleteItem(item.id);
      }

      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, isDeleted: !currentlyDeleted } : entry,
        ),
      );

      setNotice(`${currentlyDeleted ? "Restored" : "Deleted"} ${item.title || "item"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    } finally {
      setBusyId("");
    }
  }

  function exportItems() {
    downloadCsv(
      "admin-inventory.csv",
      filteredItems.map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        category: item.category,
        condition: item.condition,
        status: getItemStatus(item),
        shop: getShopName(item),
        createdAt: item.createdAt,
      })),
    );
  }

  return (
    <AdminPageShell
      title="Admin Inventory Control"
      subtitle="Search, filter, export, delete, and restore marketplace listings."
      actions={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={exportItems}>
            Export CSV
          </button>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      <div className="admin-control-bar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search inventory by title, category, shop, condition, or id..."
          className="admin-control-input"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="admin-control-select"
        >
          <option value="ALL">All listings</option>
          <option value="ACTIVE">Active only</option>
          <option value="DELETED">Deleted only</option>
        </select>

        <select
          value={String(sortKey)}
          onChange={(event) => setSortKey(event.target.value as keyof AdminItemRow)}
          className="admin-control-select"
        >
          <option value="createdAt">Sort by created</option>
          <option value="title">Sort by title</option>
          <option value="price">Sort by price</option>
          <option value="category">Sort by category</option>
          <option value="status">Sort by status</option>
        </select>

        <select
          value={sortDirection}
          onChange={(event) => setSortDirection(event.target.value as SortDirection)}
          className="admin-control-select"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {notice ? <div className="admin-notice success">{notice}</div> : null}
      {error ? <div className="admin-notice danger">{error}</div> : null}

      <div className="admin-table-card">
        <div className="admin-table-meta">
          Showing {filteredItems.length} of {items.length} listings
        </div>

        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Shop</th>
                <th>Price</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Loading inventory...</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6}>No listings match your filters.</td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const status = getItemStatus(item);

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <div className="admin-muted">{item.category || "Uncategorized"} · {item.condition || "Unknown condition"}</div>
                        <div className="admin-muted small">{item.id}</div>
                      </td>
                      <td>{getShopName(item)}</td>
                      <td>{formatMoney(item.price, item.currency || "USD")}</td>
                      <td>
                        <span className={`badge ${item.isDeleted ? "badge-danger" : "badge-success"}`}>
                          {status}
                        </span>
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === item.id}
                          onClick={() => void toggleItem(item)}
                        >
                          {busyId === item.id
                            ? "Saving..."
                            : item.isDeleted
                              ? "Restore"
                              : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageShell>
  );
}

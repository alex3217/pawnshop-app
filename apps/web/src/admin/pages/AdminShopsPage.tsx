import { useEffect, useMemo, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi, type AdminShopRow } from "../services/adminApi";
import {
  compareValues,
  downloadCsv,
  formatDate,
  includesSearch,
  type SortDirection,
} from "../utils/adminControlUtils";

type StatusFilter = "ALL" | "ACTIVE" | "DELETED";

function getShopStatus(shop: AdminShopRow) {
  return shop.isDeleted ? "DELETED" : "ACTIVE";
}

export default function AdminShopsPage() {
  const [shops, setShops] = useState<AdminShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<keyof AdminShopRow>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      setShops(await adminApi.getShops());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shops.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredShops = useMemo(() => {
    return shops
      .filter((shop) =>
        includesSearch(shop as Record<string, unknown>, query, [
          "id",
          "name",
          "address",
          "phone",
          "ownerEmail",
        ]),
      )
      .filter((shop) => {
        if (statusFilter === "ALL") return true;
        return getShopStatus(shop) === statusFilter;
      })
      .sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDirection));
  }, [query, shops, sortDirection, sortKey, statusFilter]);

  async function toggleShop(shop: AdminShopRow) {
    if (!shop.id || busyId) return;

    const currentlyDeleted = shop.isDeleted === true;
    const confirmed = window.confirm(
      `${currentlyDeleted ? "Restore" : "Disable"} "${shop.name || shop.id}"?`,
    );

    if (!confirmed) return;

    setBusyId(shop.id);
    setError("");
    setNotice("");

    try {
      if (currentlyDeleted) {
        await adminApi.restoreShop(shop.id);
      } else {
        await adminApi.softDeleteShop(shop.id);
      }

      setShops((current) =>
        current.map((entry) =>
          entry.id === shop.id ? { ...entry, isDeleted: !currentlyDeleted } : entry,
        ),
      );

      setNotice(`${currentlyDeleted ? "Restored" : "Disabled"} ${shop.name || "shop"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shop.");
    } finally {
      setBusyId("");
    }
  }

  function exportShops() {
    downloadCsv(
      "admin-shops.csv",
      filteredShops.map((shop) => ({
        id: shop.id,
        name: shop.name,
        ownerEmail: shop.ownerEmail,
        phone: shop.phone,
        address: shop.address,
        status: getShopStatus(shop),
        createdAt: shop.createdAt,
      })),
    );
  }

  return (
    <AdminPageShell
      title="Admin Shops"
      subtitle="Search, filter, export, disable, and restore marketplace shops."
      actions={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={exportShops}>
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
          placeholder="Search shops by name, owner, phone, address, or id..."
          className="admin-control-input"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="admin-control-select"
        >
          <option value="ALL">All shops</option>
          <option value="ACTIVE">Active only</option>
          <option value="DELETED">Disabled only</option>
        </select>

        <select
          value={String(sortKey)}
          onChange={(event) => setSortKey(event.target.value as keyof AdminShopRow)}
          className="admin-control-select"
        >
          <option value="createdAt">Sort by created</option>
          <option value="name">Sort by name</option>
          <option value="ownerEmail">Sort by owner</option>
          <option value="phone">Sort by phone</option>
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
          Showing {filteredShops.length} of {shops.length} shops
        </div>

        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Owner</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Loading shops...</td>
                </tr>
              ) : filteredShops.length === 0 ? (
                <tr>
                  <td colSpan={6}>No shops match your filters.</td>
                </tr>
              ) : (
                filteredShops.map((shop) => {
                  const status = getShopStatus(shop);

                  return (
                    <tr key={shop.id}>
                      <td>
                        <strong>{shop.name}</strong>
                        <div className="admin-muted">{shop.address || "No address"}</div>
                        <div className="admin-muted small">{shop.id}</div>
                      </td>
                      <td>{shop.ownerEmail || "Unknown owner"}</td>
                      <td>{shop.phone || "—"}</td>
                      <td>
                        <span className={`badge ${shop.isDeleted ? "badge-danger" : "badge-success"}`}>
                          {status}
                        </span>
                      </td>
                      <td>{formatDate(shop.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === shop.id}
                          onClick={() => void toggleShop(shop)}
                        >
                          {busyId === shop.id
                            ? "Saving..."
                            : shop.isDeleted
                              ? "Restore"
                              : "Disable"}
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

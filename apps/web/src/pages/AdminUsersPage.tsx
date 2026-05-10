import { useEffect, useMemo, useState } from "react";
import AdminPageShell from "../admin/components/AdminPageShell";
import { adminApi } from "../admin/services/adminApi";
import type { AdminUserRow } from "../admin/services/adminApi";
import {
  compareValues,
  downloadCsv,
  formatDate,
  includesSearch,
  type SortDirection,
} from "../admin/utils/adminControlUtils";

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type RoleFilter = "ALL" | "CONSUMER" | "OWNER" | "ADMIN" | "SUPER_ADMIN";

function getUserStatus(user: AdminUserRow) {
  return user.isActive === false ? "INACTIVE" : "ACTIVE";
}

function badgeClass(status: string) {
  if (status === "ACTIVE") return "badge badge-success";
  if (status === "INACTIVE") return "badge badge-danger";
  return "badge";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<keyof AdminUserRow>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      setUsers(await adminApi.getUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredUsers = useMemo(() => {
    return users
      .filter((user) =>
        includesSearch(user as Record<string, unknown>, query, ["email", "name", "role", "id"]),
      )
      .filter((user) => roleFilter === "ALL" || user.role === roleFilter)
      .filter((user) => statusFilter === "ALL" || getUserStatus(user) === statusFilter)
      .sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDirection));
  }, [query, roleFilter, sortDirection, sortKey, statusFilter, users]);

  async function toggleUser(user: AdminUserRow) {
    if (!user.id || busyId) return;

    const currentlyActive = user.isActive !== false;
    const confirmed = window.confirm(
      `${currentlyActive ? "Deactivate" : "Activate"} ${user.email || "this user"}?`,
    );

    if (!confirmed) return;

    setBusyId(user.id);
    setError("");
    setNotice("");

    try {
      if (currentlyActive) {
        await adminApi.blockUser(user.id);
      } else {
        await adminApi.unblockUser(user.id);
      }

      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, isActive: !currentlyActive } : item,
        ),
      );
      setNotice(`${currentlyActive ? "Deactivated" : "Activated"} ${user.email || "user"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setBusyId("");
    }
  }

  function exportUsers() {
    downloadCsv(
      "admin-users.csv",
      filteredUsers.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: getUserStatus(user),
        createdAt: user.createdAt,
      })),
    );
  }

  return (
    <AdminPageShell
      title="Admin Users"
      subtitle="Search, filter, export, activate, and deactivate platform users."
      actions={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={exportUsers}>
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
          placeholder="Search users by name, email, role, or id..."
          className="admin-control-input"
        />

        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
          className="admin-control-select"
        >
          <option value="ALL">All roles</option>
          <option value="CONSUMER">Consumers</option>
          <option value="OWNER">Owners</option>
          <option value="ADMIN">Admins</option>
          <option value="SUPER_ADMIN">Super Admins</option>
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="admin-control-select"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>

        <select
          value={String(sortKey)}
          onChange={(event) => setSortKey(event.target.value as keyof AdminUserRow)}
          className="admin-control-select"
        >
          <option value="createdAt">Sort by created</option>
          <option value="email">Sort by email</option>
          <option value="role">Sort by role</option>
          <option value="name">Sort by name</option>
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
          Showing {filteredUsers.length} of {users.length} users
        </div>

        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Loading users...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5}>No users match your filters.</td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const status = getUserStatus(user);

                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.email}</strong>
                        <div className="admin-muted">{user.name || "Unnamed user"}</div>
                        <div className="admin-muted small">{user.id}</div>
                      </td>
                      <td>{user.role}</td>
                      <td>
                        <span className={badgeClass(status)}>{status}</span>
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === user.id}
                          onClick={() => void toggleUser(user)}
                        >
                          {busyId === user.id
                            ? "Saving..."
                            : status === "ACTIVE"
                              ? "Deactivate"
                              : "Activate"}
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

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import AdminPageShell from "../admin/components/AdminPageShell";
import { adminApi } from "../admin/services/adminApi";
import type {
  AdminUserRow,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from "../admin/services/adminApi";
import {
  compareValues,
  downloadCsv,
  formatDate,
  includesSearch,
  type SortDirection,
} from "../admin/utils/adminControlUtils";

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type RoleFilter = "ALL" | UserRole;
type UserRole = "CONSUMER" | "OWNER" | "ADMIN" | "SUPER_ADMIN";
type ModalMode = "create" | "edit";

type UserFormState = {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
};

const EMPTY_USER_FORM: UserFormState = {
  name: "",
  email: "",
  password: "",
  role: "CONSUMER",
  isActive: true,
};

function getUserStatus(user: AdminUserRow) {
  return user.isActive === false ? "INACTIVE" : "ACTIVE";
}

function badgeClass(status: string) {
  if (status === "ACTIVE") return "badge badge-success";
  if (status === "INACTIVE") return "badge badge-danger";
  return "badge";
}

function toUserRole(value: unknown): UserRole {
  const role = String(value || "").toUpperCase();

  if (role === "OWNER") return "OWNER";
  if (role === "ADMIN") return "ADMIN";
  if (role === "SUPER_ADMIN") return "SUPER_ADMIN";

  return "CONSUMER";
}

function getUserName(user: AdminUserRow) {
  return user.name || "";
}

function buildEditForm(user: AdminUserRow): UserFormState {
  return {
    id: user.id,
    name: getUserName(user),
    email: user.email || "",
    password: "",
    role: toUserRole(user.role),
    isActive: user.isActive !== false,
  };
}

export default function AdminUsersPage() {
  const location = useLocation();
  const isSuperAdminSurface = location.pathname.startsWith("/super-admin");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [savingForm, setSavingForm] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<keyof AdminUserRow>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);

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
        includesSearch(user as Record<string, unknown>, query, [
          "email",
          "name",
          "role",
          "id",
        ]),
      )
      .filter((user) => roleFilter === "ALL" || user.role === roleFilter)
      .filter((user) => statusFilter === "ALL" || getUserStatus(user) === statusFilter)
      .sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDirection));
  }, [query, roleFilter, sortDirection, sortKey, statusFilter, users]);

  function openCreateModal() {
    setError("");
    setNotice("");
    setForm(EMPTY_USER_FORM);
    setModalMode("create");
  }

  function openEditModal(user: AdminUserRow) {
    setError("");
    setNotice("");
    setForm(buildEditForm(user));
    setModalMode("edit");
  }

  function closeModal() {
    if (savingForm) return;

    setModalMode(null);
    setForm(EMPTY_USER_FORM);
  }

  function updateForm<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submitUserForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setNotice("");

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();

    if (!email) {
      setError("Email is required.");
      return;
    }

    if (modalMode === "create" && form.password.length < 8) {
      setError("Temporary password must be at least 8 characters.");
      return;
    }

    if (modalMode === "edit" && form.id) {
      const existing = users.find((user) => user.id === form.id);

      if (existing && existing.role !== form.role) {
        const confirmed = window.confirm(
          `Change ${existing.email} role from ${existing.role} to ${form.role}?`,
        );
        if (!confirmed) return;
      }

      if (existing && existing.isActive !== form.isActive) {
        const confirmed = window.confirm(
          `${form.isActive ? "Activate" : "Deactivate"} ${existing.email}?`,
        );
        if (!confirmed) return;
      }
    }

    setSavingForm(true);

    try {
      if (modalMode === "create") {
        const input: CreateAdminUserInput = {
          name,
          email,
          password: form.password,
          role: form.role,
          isActive: form.isActive,
        };

        const response = await adminApi.createAdminUser(input);

        setUsers((current) => [response.user, ...current]);
        setNotice(`Created ${response.user.email}.`);
      }

      if (modalMode === "edit" && form.id) {
        const input: UpdateAdminUserInput = {
          name,
          email,
          role: form.role,
          isActive: form.isActive,
        };

        const response = await adminApi.updateAdminUser(form.id, input);

        setUsers((current) =>
          current.map((user) => (user.id === response.user.id ? response.user : user)),
        );
        setNotice(`Updated ${response.user.email}.`);
      }

      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user.");
    } finally {
      setSavingForm(false);
    }
  }

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
      isSuperAdminSurface ? "super-admin-users.csv" : isSuperAdminSurface ? "super-admin-users.csv" : isSuperAdminSurface ? "super-admin-users.csv" : "admin-users.csv",
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
      title={isSuperAdminSurface ? "Super Admin Users & Roles" : "Admin Users"}
      subtitle={isSuperAdminSurface ? "Search, add, edit, activate, deactivate, and govern platform users and roles." : "Search, filter, export, create, edit, activate, and deactivate platform users."}
      actions={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={openCreateModal}>
            Add User
          </button>
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

      {isSuperAdminSurface ? (
        <section className="super-admin-control-panel">
          <div className="super-admin-control-header">
            <div>
              <div className="super-admin-control-kicker">Super Admin Controls</div>
              <h2 className="super-admin-control-title">User & Role Command Center</h2>
              <p className="super-admin-control-subtitle">
                Add users, edit user profiles, change roles, activate/deactivate accounts,
                search all users, and export user records.
              </p>
            </div>
            <div className="super-admin-control-actions">
              <button className="btn btn-primary" onClick={openCreateModal}>
                Add User
              </button>
              <button className="btn btn-secondary" onClick={exportUsers}>
                Export CSV
              </button>
              <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
                Refresh
              </button>
            </div>
          </div>
          <ul className="super-admin-control-list">
            <li>Use the search box below to find users by name, email, role, or id.</li>
            <li>Use Edit to modify role, email, name, and account status.</li>
            <li>Use Activate / Deactivate instead of hard deleting users.</li>
          </ul>
        </section>
      ) : null}

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
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-secondary"
                            disabled={Boolean(busyId)}
                            onClick={() => openEditModal(user)}
                          >
                            Edit
                          </button>
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
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode ? (
        <div style={modalStyles.backdrop} role="dialog" aria-modal="true">
          <form onSubmit={submitUserForm} style={modalStyles.card}>
            <div style={modalStyles.header}>
              <div>
                <h2 style={modalStyles.title}>
                  {modalMode === "create" ? "Add User" : "Edit User"}
                </h2>
                <p style={modalStyles.subtitle}>
                  {modalMode === "create"
                    ? "Create a user and assign their starting role."
                    : "Update user profile, role, and active status."}
                </p>
              </div>

              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Close
              </button>
            </div>

            <div style={modalStyles.grid}>
              <label style={modalStyles.label}>
                Name
                <input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  className="admin-control-input"
                  placeholder="Full name"
                />
              </label>

              <label style={modalStyles.label}>
                Email
                <input
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  className="admin-control-input"
                  placeholder="user@example.com"
                  type="email"
                  required
                />
              </label>

              {modalMode === "create" ? (
                <label style={modalStyles.label}>
                  Temporary password
                  <input
                    value={form.password}
                    onChange={(event) => updateForm("password", event.target.value)}
                    className="admin-control-input"
                    placeholder="At least 8 characters"
                    type="password"
                    minLength={8}
                    required
                  />
                </label>
              ) : null}

              <label style={modalStyles.label}>
                Role
                <select
                  value={form.role}
                  onChange={(event) => updateForm("role", event.target.value as UserRole)}
                  className="admin-control-select"
                >
                  <option value="CONSUMER">Consumer</option>
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </label>

              <label style={modalStyles.checkboxLabel}>
                <input
                  checked={form.isActive}
                  onChange={(event) => updateForm("isActive", event.target.checked)}
                  type="checkbox"
                />
                Active account
              </label>
            </div>

            <div style={modalStyles.footer}>
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={savingForm} type="submit">
                {savingForm
                  ? "Saving..."
                  : modalMode === "create"
                    ? "Create User"
                    : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AdminPageShell>
  );
}

const modalStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "rgba(2, 6, 23, 0.72)",
    backdropFilter: "blur(6px)",
  },
  card: {
    width: "min(760px, 100%)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: 22,
    background: "#0f172a",
    boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
    padding: 20,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 18,
  },
  title: {
    margin: 0,
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: 900,
  },
  subtitle: {
    margin: "4px 0 0",
    color: "#aab6d3",
    fontSize: 13,
  },
  grid: {
    display: "grid",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 6,
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 800,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 800,
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
} as const;

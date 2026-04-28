import { useEffect, useMemo, useState } from "react";
import { exportCsv } from "../utils/exportCsv";
import {
  adminApi,
  type AdminUserRow,
  type AdminUserRole,
} from "../services/adminApi";

const CURRENT_SUPER_ADMIN_EMAIL = "you@example.com";

const ROLE_OPTIONS: AdminUserRole[] = [
  "CONSUMER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "ADMIN" as "ADMIN" | "SUPER_ADMIN",
  });

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const result = await adminApi.getUsersPaged({ limit: 100 });
      setUsers(result.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;

    return users.filter((user) =>
      [user.name, user.email, user.role, user.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, users]);

  async function createAdminUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const response = await adminApi.createSuperAdminUser(createForm);

      setUsers((current) => [response.user, ...current]);
      setCreateForm({
        name: "",
        email: "",
        password: "",
        role: "ADMIN",
      });
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    }
  }

  async function updateUser(
    user: AdminUserRow,
    input: Partial<Pick<AdminUserRow, "role" | "isActive">>
  ) {
    const isSelf = user.email === CURRENT_SUPER_ADMIN_EMAIL;

    if (isSelf && input.role && input.role !== "SUPER_ADMIN") {
      setError("You cannot remove your own Super Admin role.");
      return;
    }

    if (isSelf && input.isActive === false) {
      setError("You cannot deactivate your own Super Admin account.");
      return;
    }

    if (input.isActive === false) {
      const confirmed = window.confirm(
        `Deactivate ${user.email}? They will lose access.`
      );
      if (!confirmed) return;
    }

    if (input.role && input.role !== user.role) {
      const confirmed = window.confirm(
        `Change ${user.email} role from ${user.role} to ${input.role}?`
      );
      if (!confirmed) return;
    }

    setSavingId(user.id);
    setError("");

    try {
      const response = await adminApi.updateSuperAdminUser(user.id, input);

      setUsers((current) =>
        current.map((item) => (item.id === user.id ? response.user : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage users, roles, and access across the entire marketplace.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            className="button"
            onClick={() => setShowCreateForm((value) => !value)}
          >
            {showCreateForm ? "Cancel" : "+ Create Admin User"}
          </button>

          <button
            className="button"
            onClick={() =>
              exportCsv(
                "platform-users.csv",
                filteredUsers.map((user) => ({
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  isActive: user.isActive,
                  createdAt: user.createdAt,
                  updatedAt: user.updatedAt,
                }))
              )
            }
          >
            Export CSV
          </button>

          <button className="button" onClick={loadUsers} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showCreateForm ? (
        <form
          onSubmit={createAdminUser}
          className="grid gap-3 rounded-2xl border bg-background p-4 shadow-sm md:grid-cols-[1fr_1fr_1fr_180px_auto]"
        >
          <input
            value={createForm.name}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="Name"
            required
            className="rounded-lg border px-3 py-2 text-sm"
          />

          <input
            value={createForm.email}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            placeholder="Email"
            type="email"
            required
            className="rounded-lg border px-3 py-2 text-sm"
          />

          <input
            value={createForm.password}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
            placeholder="Temporary password"
            type="password"
            minLength={8}
            required
            className="rounded-lg border px-3 py-2 text-sm"
          />

          <select
            value={createForm.role}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                role: event.target.value as "ADMIN" | "SUPER_ADMIN",
              }))
            }
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="ADMIN">ADMIN</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>

          <button className="button" type="submit">
            Create
          </button>
        </form>
      ) : null}

      <div className="rounded-2xl border bg-background p-4 shadow-sm">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search users by name, email, role, or id..."
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSaving = savingId === user.id;
                  const isActive = user.isActive !== false;

                  return (
                    <tr key={user.id} className="border-b last:border-b-0">
                      <td className="p-3">
                        <div className="font-medium">{user.name || "Unnamed"}</div>
                        <div className="text-muted-foreground">{user.email}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {user.id}
                        </div>
                      </td>

                      <td className="p-3">
                        <select
                          value={user.role}
                          disabled={isSaving}
                          onChange={(event) =>
                            updateUser(user, {
                              role: event.target.value as AdminUserRole,
                            })
                          }
                          className="rounded-lg border px-2 py-1 text-sm"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="p-3 text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          disabled={isSaving}
                          onClick={() => updateUser(user, { isActive: !isActive })}
                          className="button"
                        >
                          {isSaving ? "Saving..." : isActive ? "Deactivate" : "Activate"}
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
    </div>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import {
  adminApi,
  type AdminShopRow,
  type AdminUserRow,
  type CreateAdminShopInput,
  type UpdateAdminShopInput,
} from "../services/adminApi";
import {
  compareValues,
  downloadCsv,
  formatDate,
  includesSearch,
  type SortDirection,
} from "../utils/adminControlUtils";

type StatusFilter = "ALL" | "ACTIVE" | "DELETED";
type ModalMode = "create" | "edit";

type ShopFormState = {
  id?: string;
  name: string;
  ownerId: string;
  address: string;
  phone: string;
  description: string;
  hours: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  isDeleted: boolean;
};

const EMPTY_SHOP_FORM: ShopFormState = {
  name: "",
  ownerId: "",
  address: "",
  phone: "",
  description: "",
  hours: "",
  subscriptionPlan: "FREE",
  subscriptionStatus: "ACTIVE",
  isDeleted: false,
};

const PLAN_OPTIONS = ["FREE", "PRO", "PREMIUM", "ULTRA"];
const SUBSCRIPTION_STATUS_OPTIONS = [
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "CANCELED",
  "PAUSED",
  "UNKNOWN",
];

function getShopStatus(shop: AdminShopRow) {
  return shop.isDeleted ? "DELETED" : "ACTIVE";
}

function toText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function getShopOwnerId(shop: AdminShopRow) {
  return toText(shop.ownerId);
}

function buildEditForm(shop: AdminShopRow): ShopFormState {
  return {
    id: shop.id,
    name: toText(shop.name),
    ownerId: getShopOwnerId(shop),
    address: toText(shop.address),
    phone: toText(shop.phone),
    description: toText(shop.description),
    hours: toText(shop.hours),
    subscriptionPlan: toText(shop.subscriptionPlan, "FREE").toUpperCase(),
    subscriptionStatus: toText(shop.subscriptionStatus, "ACTIVE").toUpperCase(),
    isDeleted: Boolean(shop.isDeleted),
  };
}

function ownerLabel(owner: AdminUserRow) {
  const name = owner.name ? `${owner.name} · ` : "";
  return `${name}${owner.email}`;
}

export default function AdminShopsPage() {
  const location = useLocation();
  const isSuperAdminSurface = location.pathname.startsWith("/super-admin");
  const [shops, setShops] = useState<AdminShopRow[]>([]);
  const [owners, setOwners] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [savingForm, setSavingForm] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<keyof AdminShopRow>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [form, setForm] = useState<ShopFormState>(EMPTY_SHOP_FORM);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [nextShops, users] = await Promise.all([
        adminApi.getShops(),
        adminApi.getUsers(),
      ]);

      const ownerRows = users.filter((user) => user.role === "OWNER");

      setShops(nextShops);
      setOwners(ownerRows);
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
          "ownerName",
          "subscriptionPlan",
          "subscriptionStatus",
        ]),
      )
      .filter((shop) => {
        if (statusFilter === "ALL") return true;
        return getShopStatus(shop) === statusFilter;
      })
      .sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDirection));
  }, [query, shops, sortDirection, sortKey, statusFilter]);

  function openCreateModal() {
    setError("");
    setNotice("");
    setForm({
      ...EMPTY_SHOP_FORM,
      ownerId: owners[0]?.id || "",
    });
    setModalMode("create");
  }

  function openEditModal(shop: AdminShopRow) {
    setError("");
    setNotice("");
    setForm(buildEditForm(shop));
    setModalMode("edit");
  }

  function closeModal() {
    if (savingForm) return;

    setModalMode(null);
    setForm(EMPTY_SHOP_FORM);
  }

  function updateForm<K extends keyof ShopFormState>(key: K, value: ShopFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submitShopForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setNotice("");

    const name = form.name.trim();
    const ownerId = form.ownerId.trim();

    if (!name) {
      setError("Shop name is required.");
      return;
    }

    if (!ownerId) {
      setError("Owner is required. Create an owner user first, then assign the shop.");
      return;
    }

    if (modalMode === "edit" && form.id) {
      const existing = shops.find((shop) => shop.id === form.id);

      if (existing && getShopOwnerId(existing) !== ownerId) {
        const confirmed = window.confirm(
          `Reassign "${existing.name}" to a different owner?`,
        );
        if (!confirmed) return;
      }

      if (existing && Boolean(existing.isDeleted) !== form.isDeleted) {
        const confirmed = window.confirm(
          `${form.isDeleted ? "Disable" : "Restore"} "${existing.name}"?`,
        );
        if (!confirmed) return;
      }
    }

    setSavingForm(true);

    try {
      if (modalMode === "create") {
        const input: CreateAdminShopInput = {
          name,
          ownerId,
          address: form.address.trim(),
          phone: form.phone.trim(),
          description: form.description.trim(),
          hours: form.hours.trim(),
          subscriptionPlan: form.subscriptionPlan,
          subscriptionStatus: form.subscriptionStatus,
        };

        const response = await adminApi.createAdminShop(input);

        setShops((current) => [response.shop, ...current]);
        setNotice(`Created ${response.shop.name}.`);
      }

      if (modalMode === "edit" && form.id) {
        const input: UpdateAdminShopInput = {
          name,
          ownerId,
          address: form.address.trim(),
          phone: form.phone.trim(),
          description: form.description.trim(),
          hours: form.hours.trim(),
          subscriptionPlan: form.subscriptionPlan,
          subscriptionStatus: form.subscriptionStatus,
          isDeleted: form.isDeleted,
        };

        const response = await adminApi.updateAdminShop(form.id, input);

        setShops((current) =>
          current.map((shop) => (shop.id === response.shop.id ? response.shop : shop)),
        );
        setNotice(`Updated ${response.shop.name}.`);
      }

      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save shop.");
    } finally {
      setSavingForm(false);
    }
  }

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
      isSuperAdminSurface ? "super-admin-shops.csv" : isSuperAdminSurface ? "super-admin-shops.csv" : isSuperAdminSurface ? "super-admin-shops.csv" : "admin-shops.csv",
      filteredShops.map((shop) => ({
        id: shop.id,
        name: shop.name,
        ownerId: shop.ownerId,
        ownerName: shop.ownerName,
        ownerEmail: shop.ownerEmail,
        phone: shop.phone,
        address: shop.address,
        subscriptionPlan: shop.subscriptionPlan,
        subscriptionStatus: shop.subscriptionStatus,
        status: getShopStatus(shop),
        createdAt: shop.createdAt,
      })),
    );
  }

  return (
    <AdminPageShell
      title={isSuperAdminSurface ? "Super Admin Shop Management" : "Admin Shops"}
      subtitle={isSuperAdminSurface ? "Search, add, edit, reassign owners, update plan/status, disable, and restore shops." : "Search, filter, export, create, edit, assign owners, disable, and restore marketplace shops."}
      actions={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={openCreateModal}>
            Add Shop
          </button>
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
          placeholder="Search shops by name, owner, phone, address, plan, status, or id..."
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
          <option value="subscriptionPlan">Sort by plan</option>
          <option value="subscriptionStatus">Sort by subscription</option>
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
              <h2 className="super-admin-control-title">Shop Governance Command Center</h2>
              <p className="super-admin-control-subtitle">
                Add shops, edit shop profiles, reassign owners, update plan/status,
                disable or restore shops, search records, and export shop data.
              </p>
            </div>
            <div className="super-admin-control-actions">
              <button className="btn btn-primary" onClick={openCreateModal}>
                Add Shop
              </button>
              <button className="btn btn-secondary" onClick={exportShops}>
                Export CSV
              </button>
              <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
                Refresh
              </button>
            </div>
          </div>
          <ul className="super-admin-control-list">
            <li>Use the search box below to find shops by name, owner, phone, plan, status, or id.</li>
            <li>Use Edit to reassign owner, update shop profile, and change subscription controls.</li>
            <li>Use Disable / Restore instead of hard deleting shops.</li>
          </ul>
        </section>
      ) : null}

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
                <th>Plan</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Loading shops...</td>
                </tr>
              ) : filteredShops.length === 0 ? (
                <tr>
                  <td colSpan={7}>No shops match your filters.</td>
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
                      <td>
                        <strong>{shop.ownerEmail || "Unknown owner"}</strong>
                        <div className="admin-muted">{shop.ownerName || shop.ownerId || "—"}</div>
                      </td>
                      <td>
                        <strong>{shop.subscriptionPlan || "FREE"}</strong>
                        <div className="admin-muted">{shop.subscriptionStatus || "UNKNOWN"}</div>
                      </td>
                      <td>{shop.phone || "—"}</td>
                      <td>
                        <span className={`badge ${shop.isDeleted ? "badge-danger" : "badge-success"}`}>
                          {status}
                        </span>
                      </td>
                      <td>{formatDate(shop.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-secondary"
                            disabled={Boolean(busyId)}
                            onClick={() => openEditModal(shop)}
                          >
                            Edit
                          </button>
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
          <form onSubmit={submitShopForm} style={modalStyles.card}>
            <div style={modalStyles.header}>
              <div>
                <h2 style={modalStyles.title}>
                  {modalMode === "create" ? "Add Shop" : "Edit Shop"}
                </h2>
                <p style={modalStyles.subtitle}>
                  {modalMode === "create"
                    ? "Create a shop and assign it to an owner."
                    : "Update shop profile, owner assignment, plan, and status."}
                </p>
              </div>

              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Close
              </button>
            </div>

            <div style={modalStyles.grid}>
              <label style={modalStyles.label}>
                Shop name
                <input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  className="admin-control-input"
                  placeholder="Shop name"
                  required
                />
              </label>

              <label style={modalStyles.label}>
                Owner
                <select
                  value={form.ownerId}
                  onChange={(event) => updateForm("ownerId", event.target.value)}
                  className="admin-control-select"
                  required
                >
                  <option value="">Select owner</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {ownerLabel(owner)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={modalStyles.label}>
                Phone
                <input
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  className="admin-control-input"
                  placeholder="555-0100"
                />
              </label>

              <label style={modalStyles.label}>
                Address
                <input
                  value={form.address}
                  onChange={(event) => updateForm("address", event.target.value)}
                  className="admin-control-input"
                  placeholder="Street, city, state"
                />
              </label>

              <label style={modalStyles.label}>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  className="admin-control-input"
                  placeholder="Short shop description"
                  rows={3}
                />
              </label>

              <label style={modalStyles.label}>
                Hours
                <input
                  value={form.hours}
                  onChange={(event) => updateForm("hours", event.target.value)}
                  className="admin-control-input"
                  placeholder="Mon-Fri 9am-6pm"
                />
              </label>

              <label style={modalStyles.label}>
                Plan
                <select
                  value={form.subscriptionPlan}
                  onChange={(event) => updateForm("subscriptionPlan", event.target.value)}
                  className="admin-control-select"
                >
                  {PLAN_OPTIONS.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                </select>
              </label>

              <label style={modalStyles.label}>
                Subscription status
                <select
                  value={form.subscriptionStatus}
                  onChange={(event) => updateForm("subscriptionStatus", event.target.value)}
                  className="admin-control-select"
                >
                  {SUBSCRIPTION_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label style={modalStyles.checkboxLabel}>
                <input
                  checked={!form.isDeleted}
                  onChange={(event) => updateForm("isDeleted", !event.target.checked)}
                  type="checkbox"
                />
                Shop is active
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
                    ? "Create Shop"
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
    width: "min(820px, 100%)",
    maxHeight: "92vh",
    overflowY: "auto",
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

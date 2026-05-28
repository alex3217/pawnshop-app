import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import AdminPageShell from "../admin/components/AdminPageShell";
import { adminApi } from "../admin/services/adminApi";
import type {
  AdminItemRow,
  AdminShopRow,
  CreateAdminItemInput,
  UpdateAdminItemInput,
} from "../admin/services/adminApi";
import {
  compareValues,
  downloadCsv,
  formatDate,
  formatMoney,
  includesSearch,
  type SortDirection,
} from "../admin/utils/adminControlUtils";
import "../styles/admin-items-readability.css";

type StatusFilter = "ALL" | "ACTIVE" | "DELETED";
type ModalMode = "create" | "edit";

type ItemFormState = {
  id?: string;
  shopId: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  category: string;
  condition: string;
  status: string;
  isDeleted: boolean;
};

const EMPTY_ITEM_FORM: ItemFormState = {
  shopId: "",
  title: "",
  description: "",
  price: "",
  currency: "USD",
  category: "",
  condition: "",
  status: "AVAILABLE",
  isDeleted: false,
};

const ITEM_STATUS_OPTIONS = ["AVAILABLE", "PENDING", "SOLD", "DRAFT", "ARCHIVED", "UNKNOWN"];
const CONDITION_OPTIONS = ["", "NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR", "USED", "REFURBISHED"];

function toText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function getShopName(item: AdminItemRow) {
  const shop = (item as Record<string, unknown>).shop;
  if (shop && typeof shop === "object") {
    const name = (shop as Record<string, unknown>).name;
    return name ? String(name) : "Unknown shop";
  }

  return "Unknown shop";
}

function getItemShopId(item: AdminItemRow) {
  const record = item as Record<string, unknown>;
  const nested = record.shop;

  if (record.shopId) return String(record.shopId);
  if (record.pawnShopId) return String(record.pawnShopId);

  if (nested && typeof nested === "object") {
    const id = (nested as Record<string, unknown>).id;
    if (id) return String(id);
  }

  return "";
}

function getItemStatus(item: AdminItemRow) {
  return item.isDeleted ? "DELETED" : String(item.status || "ACTIVE");
}

function buildEditForm(item: AdminItemRow): ItemFormState {
  const record = item as Record<string, unknown>;

  return {
    id: item.id,
    shopId: getItemShopId(item),
    title: toText(item.title),
    description: toText(record.description),
    price: item.price === null || item.price === undefined ? "" : String(item.price),
    currency: toText(item.currency, "USD").toUpperCase(),
    category: toText(item.category),
    condition: toText(item.condition),
    status: toText(item.status, "AVAILABLE").toUpperCase(),
    isDeleted: Boolean(item.isDeleted),
  };
}

function shopLabel(shop: AdminShopRow) {
  const owner = shop.ownerEmail ? ` · ${shop.ownerEmail}` : "";
  return `${shop.name}${owner}`;
}

export default function AdminItemsPage() {
  const location = useLocation();
  const isSuperAdminSurface = location.pathname.startsWith("/super-admin");
  const [items, setItems] = useState<AdminItemRow[]>([]);
  const [shops, setShops] = useState<AdminShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [savingForm, setSavingForm] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<keyof AdminItemRow>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_ITEM_FORM);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [nextItems, nextShops] = await Promise.all([
        adminApi.getItems(),
        adminApi.getShops(),
      ]);

      setItems(nextItems);
      setShops(nextShops);
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
      .filter(
        (item) =>
          includesSearch(item as Record<string, unknown>, query, [
            "id",
            "title",
            "category",
            "condition",
            "status",
            "description",
            "currency",
          ]) || getShopName(item).toLowerCase().includes(query.trim().toLowerCase()),
      )
      .filter((item) => {
        if (statusFilter === "ALL") return true;
        if (statusFilter === "DELETED") return item.isDeleted === true;
        return item.isDeleted !== true;
      })
      .sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDirection));
  }, [items, query, sortDirection, sortKey, statusFilter]);

  function openCreateModal() {
    setError("");
    setNotice("");
    setForm({
      ...EMPTY_ITEM_FORM,
      shopId: shops[0]?.id || "",
    });
    setModalMode("create");
  }

  function openEditModal(item: AdminItemRow) {
    setError("");
    setNotice("");
    setForm(buildEditForm(item));
    setModalMode("edit");
  }

  function closeModal() {
    if (savingForm) return;

    setModalMode(null);
    setForm(EMPTY_ITEM_FORM);
  }

  function updateForm<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submitItemForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setNotice("");

    const title = form.title.trim();
    const shopId = form.shopId.trim();
    const price = form.price.trim() === "" ? undefined : Number(form.price);

    if (!title) {
      setError("Item title is required.");
      return;
    }

    if (!shopId) {
      setError("Shop is required.");
      return;
    }

    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      setError("Price must be a valid non-negative number.");
      return;
    }

    const existing = form.id ? items.find((item) => item.id === form.id) : null;

    if (modalMode === "edit" && existing && Boolean(existing.isDeleted) !== form.isDeleted) {
      const confirmed = window.confirm(
        `${form.isDeleted ? "Delete" : "Restore"} "${existing.title || existing.id}"?`,
      );
      if (!confirmed) return;
    }

    setSavingForm(true);

    try {
      const baseInput = {
        shopId,
        title,
        description: form.description.trim(),
        category: form.category.trim(),
        condition: form.condition.trim(),
        status: form.status.trim().toUpperCase(),
        currency: form.currency.trim().toUpperCase() || "USD",
        isDeleted: form.isDeleted,
        ...(price !== undefined ? { price } : {}),
      };

      if (modalMode === "create") {
        const response = await adminApi.createAdminItem(baseInput as CreateAdminItemInput);

        setItems((current) => [response.item, ...current]);
        setNotice(`Created ${response.item.title || "item"}.`);
      }

      if (modalMode === "edit" && form.id) {
        const response = await adminApi.updateAdminItem(
          form.id,
          baseInput as UpdateAdminItemInput,
        );

        setItems((current) =>
          current.map((item) => (item.id === response.item.id ? response.item : item)),
        );
        setNotice(`Updated ${response.item.title || "item"}.`);
      }

      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item.");
    } finally {
      setSavingForm(false);
    }
  }

  async function markItemSold(item: AdminItemRow) {
    if (!item.id || busyId) return;

    const confirmed = window.confirm(`Mark "${item.title || item.id}" as SOLD?`);
    if (!confirmed) return;

    setBusyId(item.id);
    setError("");
    setNotice("");

    try {
      const response = await adminApi.updateAdminItem(item.id, { status: "SOLD" });

      setItems((current) =>
        current.map((entry) => (entry.id === response.item.id ? response.item : entry)),
      );

      setNotice(`Marked ${response.item.title || "item"} as sold.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark item sold.");
    } finally {
      setBusyId("");
    }
  }

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
      isSuperAdminSurface ? "super-admin-inventory.csv" : "admin-inventory.csv",
      filteredItems.map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        currency: item.currency,
        category: item.category,
        condition: item.condition,
        status: getItemStatus(item),
        shop: getShopName(item),
        createdAt: item.createdAt,
      })),
    );
  }

  return (
    <div className="admin-items-readability">
      <AdminPageShell
      title={isSuperAdminSurface ? "Super Admin Inventory Control" : "Admin Inventory Control"}
      subtitle={
        isSuperAdminSurface
          ? "Search, add, edit, change status, delete, restore, and govern marketplace listings."
          : "Search, filter, export, edit, delete, and restore marketplace listings."
      }
      actions={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isSuperAdminSurface ? (
            <button className="btn btn-primary" onClick={openCreateModal}>
              Add Item
            </button>
          ) : null}
          <button className="btn btn-secondary" onClick={exportItems}>
            Export CSV
          </button>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      {isSuperAdminSurface ? (
        <section className="super-admin-master-toolbar">
          <div>
            <h3 className="super-admin-master-toolbar-title">Inventory Master Controls</h3>
            <p className="super-admin-master-toolbar-subtitle">
              Add items, view listings, edit listing details, mark items sold,
              audit activity, or delete/restore records.
            </p>
          </div>
          <div className="super-admin-master-actions">
            <button className="btn btn-primary" onClick={openCreateModal}>
              Add Item
            </button>
            <button className="btn btn-secondary" onClick={exportItems}>
              Export CSV
            </button>
            <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
              Refresh
            </button>
          </div>
        </section>
      ) : null}

      <div className="admin-control-bar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search inventory by title, category, shop, condition, status, or id..."
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
                        <div className="admin-muted">
                          {item.category || "Uncategorized"} ·{" "}
                          {item.condition || "Unknown condition"}
                        </div>
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
                        <div className="super-admin-row-actions">
                          {isSuperAdminSurface ? (
                            <>
                              <Link className="btn btn-secondary" to={`/items/${item.id}`}>
                                View
                              </Link>
                              <button
                                className="btn btn-secondary"
                                disabled={busyId === item.id}
                                onClick={() => void markItemSold(item)}
                              >
                                Mark Sold
                              </button>
                              <Link className="btn btn-secondary" to={`/super-admin/audit?targetType=ITEM&targetId=${item.id}`}>
                                Audit
                              </Link>
                            </>
                          ) : null}
                          <button
                            className="btn btn-secondary"
                            disabled={Boolean(busyId)}
                            onClick={() => openEditModal(item)}
                          >
                            Edit
                          </button>
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
          <form onSubmit={submitItemForm} style={modalStyles.card}>
            <div style={modalStyles.header}>
              <div>
                <h2 style={modalStyles.title}>
                  {modalMode === "create" ? "Add Item" : "Edit Item"}
                </h2>
                <p style={modalStyles.subtitle}>
                  {modalMode === "create"
                    ? "Create an item directly from the Super Admin inventory page."
                    : "Update listing title, price, status, category, condition, shop, and visibility."}
                </p>
              </div>

              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Close
              </button>
            </div>

            <div style={modalStyles.grid}>
              <label style={modalStyles.label}>
                Shop
                <select
                  value={form.shopId}
                  onChange={(event) => updateForm("shopId", event.target.value)}
                  className="admin-control-select"
                  required
                >
                  <option value="">Select shop</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shopLabel(shop)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={modalStyles.label}>
                Title
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  className="admin-control-input"
                  placeholder="Item title"
                  required
                />
              </label>

              <label style={modalStyles.label}>
                Price
                <input
                  value={form.price}
                  onChange={(event) => updateForm("price", event.target.value)}
                  className="admin-control-input"
                  min={0}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                />
              </label>

              <label style={modalStyles.label}>
                Currency
                <input
                  value={form.currency}
                  onChange={(event) => updateForm("currency", event.target.value)}
                  className="admin-control-input"
                  placeholder="USD"
                  maxLength={3}
                />
              </label>

              <label style={modalStyles.label}>
                Category
                <input
                  value={form.category}
                  onChange={(event) => updateForm("category", event.target.value)}
                  className="admin-control-input"
                  placeholder="Category"
                />
              </label>

              <label style={modalStyles.label}>
                Condition
                <select
                  value={form.condition}
                  onChange={(event) => updateForm("condition", event.target.value)}
                  className="admin-control-select"
                >
                  {CONDITION_OPTIONS.map((condition) => (
                    <option key={condition || "blank"} value={condition}>
                      {condition || "Unspecified"}
                    </option>
                  ))}
                </select>
              </label>

              <label style={modalStyles.label}>
                Status
                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value)}
                  className="admin-control-select"
                >
                  {ITEM_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label style={modalStyles.label}>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  className="admin-control-input"
                  placeholder="Item description"
                  rows={4}
                />
              </label>

              <label style={modalStyles.checkboxLabel}>
                <input
                  checked={!form.isDeleted}
                  onChange={(event) => updateForm("isDeleted", !event.target.checked)}
                  type="checkbox"
                />
                Listing is active
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
                    ? "Create Item"
                    : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      </AdminPageShell>
    </div>
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

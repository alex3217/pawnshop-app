import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import ItemImagePicker from "../components/ItemImagePicker";
import { ITEM_CATEGORY_OPTIONS, ITEM_CONDITION_OPTIONS } from "../constants/itemOptions";
import { ApiError } from "../services/apiClient";
import { getAuthToken } from "../services/auth";
import {
  deleteItem,
  getItemById,
  getMyItemById,
  markItemSold,
  restoreItem,
  type Item,
} from "../services/items";
import { updateItemWithPhotos } from "../services/ownerPhotoWorkflows";
import "../styles/owner-workspace-readability.css";

function formatPrice(value: string | number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function parsePositiveNumber(value: string, fieldName: string) {
  const num = Number(value);

  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`);
  }

  return num;
}

function normalizeOption(value: string, options: readonly string[], fallback: string) {
  return options.includes(value) ? value : fallback;
}

async function getEditableOwnerItem(id: string) {
  try {
    return await getMyItemById(id);
  } catch (error) {
    const ownerRouteUnavailable =
      error instanceof ApiError &&
      error.status === 404 &&
      /^Cannot GET /i.test(error.message);

    if (!ownerRouteUnavailable) throw error;
    return getItemById(id);
  }
}

function getItemStatusTone(status: string): CSSProperties {
  const normalized = String(status || "").toUpperCase();

  if (["AVAILABLE", "ACTIVE"].includes(normalized)) {
    return {
      color: "var(--owner-success-text)",
      background: "var(--owner-success-surface)",
      border: "1px solid var(--owner-success-border)",
    };
  }

  if (["PENDING", "ARCHIVED"].includes(normalized)) {
    return {
      color: "var(--owner-warning-text)",
      background: "var(--owner-warning-surface)",
      border: "1px solid var(--owner-warning-border)",
    };
  }

  if (["SOLD", "INACTIVE", "REMOVED"].includes(normalized)) {
    return {
      color: "var(--owner-danger-text)",
      background: "var(--owner-danger-surface)",
      border: "1px solid var(--owner-danger-border)",
    };
  }

  return {
    color: "var(--owner-info-text)",
    background: "var(--owner-info-surface)",
    border: "1px solid var(--owner-info-border)",
  };
}

export default function OwnerItemEditPage() {
  const { id = "" } = useParams();
  const token = getAuthToken();

  const [item, setItem] = useState<Item | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("100");
  const [category, setCategory] = useState("Electronics");
  const [condition, setCondition] = useState("Good");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  const archived = Boolean(item?.isDeleted);
  const itemStatus = useMemo(
    () => (item?.isDeleted ? "ARCHIVED" : item?.status || "UNKNOWN"),
    [item],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadItem() {
      if (!id) {
        setError("Missing item id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setNotice(null);

      try {
        const nextItem = await getEditableOwnerItem(id);

        if (cancelled) return;

        setItem(nextItem);
        setTitle(nextItem.title || "");
        setDescription(nextItem.description || "");
        setPrice(String(nextItem.price || "100"));
        setCategory(normalizeOption(nextItem.category || "Electronics", ITEM_CATEGORY_OPTIONS, "Electronics"));
        setCondition(normalizeOption(nextItem.condition || "Good", ITEM_CONDITION_OPTIONS, "Good"));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load item.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadItem();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!token) {
      setError("You must be logged in as an owner.");
      return;
    }

    if (!id || !item) {
      setError("Missing item.");
      return;
    }

    if (archived) {
      setError("Restore this item before editing it.");
      return;
    }

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);

    try {
      const parsedPrice = parsePositiveNumber(price, "Price");

      const updated = await updateItemWithPhotos(item, {
        title,
        description,
        price: parsedPrice,
        category,
        condition,
      }, photoFiles);

      setItem(updated);
      setPhotoFiles([]);
      setNotice("Item updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkSold() {
    if (!id || !item || actionLoading) return;

    const confirmed = window.confirm("Mark this item as sold?");
    if (!confirmed) return;

    setActionLoading("sold");
    setError(null);
    setNotice(null);

    try {
      await markItemSold(id);
      const refreshed = await getEditableOwnerItem(id);
      setItem(refreshed);
      setNotice("Item marked as sold.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark item sold.");
    } finally {
      setActionLoading("");
    }
  }

  async function handleDelete() {
    if (!id || !item || actionLoading) return;

    const confirmed = window.confirm(
      "Archive this item? It will be hidden from active inventory and public listings until restored."
    );
    if (!confirmed) return;

    setActionLoading("delete");
    setError(null);
    setNotice(null);

    try {
      await deleteItem(id);
      setItem({ ...item, isDeleted: true, images: [] });
      setPhotoFiles([]);
      setNotice("Item archived. Use Restore Item to return it to active inventory.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive item.");
    } finally {
      setActionLoading("");
    }
  }

  async function handleRestore() {
    if (!id || !item || actionLoading || !archived) return;

    setActionLoading("restore");
    setError(null);
    setNotice(null);

    try {
      const restored = await restoreItem(id);
      setItem(restored);
      setNotice("Item restored to active inventory.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore item.");
    } finally {
      setActionLoading("");
    }
  }

  if (loading) {
    return (
      <div className="page-stack owner-readable-page owner-edit-item-page" style={styles.page}>
        <div className="owner-readable-card" style={styles.card}>Loading item...</div>
      </div>
    );
  }

  if (error && !item) {
    const missingItem = error === "Item not found";

    return (
      <div className="page-stack owner-readable-page owner-edit-item-page" style={styles.page}>
        <section className="owner-readable-card owner-edit-item-card" style={styles.card}>
          <h2 style={styles.title}>{missingItem ? "Item unavailable" : "Unable to load item"}</h2>
          <p style={styles.subtitle}>
            {missingItem
              ? "This item is no longer active. It may have been archived or removed. Return to Inventory to choose another item, or create a replacement."
              : error}
          </p>
          <div style={styles.actions}>
            <Link to="/owner/inventory" style={styles.primaryLink}>
              Back to Inventory
            </Link>
            <Link to="/owner/items/new" style={styles.secondaryLink}>
              Create New Item
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="page-stack owner-readable-page owner-edit-item-page" style={styles.page}>
        <div className="owner-readable-card" style={styles.card}>Item not found.</div>
        <Link to="/owner/inventory" style={styles.secondaryLink}>
          Back to Inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="page-stack owner-readable-page owner-edit-item-page" style={styles.page}>
      <div className="owner-edit-item-header" style={styles.header}>
        <div>
          <h2 style={styles.title}>Edit Item</h2>
          <p style={styles.subtitle}>Update listing details and manage inventory status.</p>
        </div>

        <div style={styles.actions}>
          <Link to="/owner/inventory" style={styles.secondaryLink}>
            Back to Inventory
          </Link>
          {!archived ? (
            <Link to={`/items/${item.id}`} style={styles.primaryLink}>
              View Public Listing
            </Link>
          ) : null}
        </div>
      </div>

      <section className="owner-readable-card owner-edit-item-card" style={styles.card}>
        <div style={styles.statusRow}>
          <span style={{ ...styles.metaPill, ...getItemStatusTone(itemStatus) }}>
            {itemStatus}
          </span>
          <span style={styles.metaPill}>Current price: {formatPrice(item.price)}</span>
          <span style={styles.metaPill}>Shop: {item.shop?.name || item.pawnShopId}</span>
        </div>

        {notice ? <div style={styles.notice}>{notice}</div> : null}
        {error ? <div style={styles.error}>{error}</div> : null}

        {archived ? (
          <div style={styles.archivedPanel}>
            <div>
              <strong>Archived item</strong>
              <p style={{ ...styles.subtitle, marginBottom: 0 }}>
                Restore this item before changing its details or publishing it again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRestore()}
              disabled={actionLoading !== ""}
              style={{
                ...styles.primaryButton,
                ...(actionLoading !== "" ? styles.disabledButton : {}),
              }}
            >
              {actionLoading === "restore" ? "Restoring..." : "Restore Item"}
            </button>
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.field}>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving || archived}
              required
              style={styles.input}
            />
          </label>

          <ItemImagePicker
            files={photoFiles}
            onChange={setPhotoFiles}
            existingImages={item.images || []}
            disabled={saving || actionLoading !== "" || archived}
            cameraLabel="Take Item Photo"
            galleryLabel="Choose Files"
          />

          <label style={styles.field}>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving || archived}
              rows={6}
              style={{ ...styles.input, resize: "vertical", paddingTop: 10 }}
            />
          </label>

          <div style={styles.twoColumn}>
            <label style={styles.field}>
              Price
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                disabled={saving || archived}
                type="number"
                min="0"
                step="0.01"
                required
                style={styles.input}
              />
            </label>

            <label style={styles.field}>
              Category
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={saving || archived}
                required
                style={styles.input}
              >
                {ITEM_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={styles.field}>
            Condition
            <select
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              disabled={saving || archived}
              required
              style={styles.input}
            >
              {ITEM_CONDITION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div style={styles.actions}>
            <button
              type="submit"
              disabled={saving || actionLoading !== "" || archived}
              style={{
                ...styles.primaryButton,
                ...(saving || actionLoading !== "" ? styles.disabledButton : {}),
              }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button
              type="button"
              onClick={handleMarkSold}
              disabled={saving || actionLoading !== "" || archived || String(itemStatus).toUpperCase() === "SOLD"}
              style={{
                ...styles.secondaryButton,
                ...(saving || actionLoading !== "" ? styles.disabledButton : {}),
              }}
            >
              {actionLoading === "sold" ? "Marking Sold..." : "Mark Sold"}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || actionLoading !== "" || archived}
              style={{
                ...styles.dangerButton,
                ...(saving || actionLoading !== "" ? styles.disabledButton : {}),
              }}
            >
              {actionLoading === "delete" ? "Archiving..." : "Archive Item"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
    color: "var(--owner-text)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  subtitle: {
    marginTop: 8,
    color: "var(--owner-text-secondary)",
  },
  card: {
    background: "var(--owner-surface)",
    border: "1px solid var(--owner-border)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
  },
  statusRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  archivedPanel: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    color: "var(--owner-warning-text)",
    background: "var(--owner-warning-surface)",
    border: "1px solid var(--owner-warning-border)",
  },
  metaPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "var(--owner-info-surface)",
    color: "var(--owner-info-text)",
    border: "1px solid var(--owner-info-border)",
    fontSize: 13,
    fontWeight: 700,
  },
  form: {
    display: "grid",
    gap: 14,
  },
  field: {
    display: "grid",
    gap: 8,
    color: "var(--owner-text)",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    border: "1px solid var(--owner-border)",
    background: "var(--owner-input)",
    color: "var(--owner-text)",
    padding: "10px 12px",
    borderRadius: 12,
    font: "inherit",
  },
  twoColumn: {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  },
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  primaryButton: {
    border: "none",
    color: "var(--owner-primary-text)",
    background: "var(--owner-primary)",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid var(--owner-border)",
    color: "var(--owner-text)",
    background: "var(--owner-surface)",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid var(--owner-danger-border)",
    color: "var(--owner-danger-text)",
    background: "var(--owner-danger-surface)",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
  primaryLink: {
    textDecoration: "none",
    border: "none",
    color: "var(--owner-primary-text)",
    background: "var(--owner-primary)",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
  },
  secondaryLink: {
    color: "var(--owner-primary)",
    textDecoration: "none",
    fontWeight: 700,
    padding: "10px 2px",
  },
  notice: {
    color: "var(--owner-success-text)",
    fontWeight: 700,
    marginBottom: 12,
  },
  error: {
    color: "var(--owner-danger-text)",
    fontWeight: 700,
    marginBottom: 12,
  },
  help: {
    color: "var(--owner-text-secondary)",
    fontSize: 13,
    fontWeight: 500,
  },
};

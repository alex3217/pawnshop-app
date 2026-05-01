import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ITEM_CATEGORY_OPTIONS, ITEM_CONDITION_OPTIONS } from "../constants/itemOptions";
import { getAuthToken } from "../services/auth";
import {
  deleteItem,
  getItemById,
  markItemSold,
  updateItem,
  type Item,
} from "../services/items";

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

function getItemStatusTone(status: string): CSSProperties {
  const normalized = String(status || "").toUpperCase();

  if (["AVAILABLE", "ACTIVE"].includes(normalized)) {
    return {
      color: "#7ef0b3",
      background: "rgba(46, 204, 113, 0.12)",
      border: "1px solid rgba(46, 204, 113, 0.24)",
    };
  }

  if (["PENDING"].includes(normalized)) {
    return {
      color: "#ffd98a",
      background: "rgba(255, 193, 7, 0.12)",
      border: "1px solid rgba(255, 193, 7, 0.24)",
    };
  }

  if (["SOLD", "INACTIVE", "REMOVED"].includes(normalized)) {
    return {
      color: "#ffb2bc",
      background: "rgba(255, 128, 143, 0.10)",
      border: "1px solid rgba(255, 128, 143, 0.18)",
    };
  }

  return {
    color: "#c7d2fe",
    background: "rgba(199, 210, 254, 0.10)",
    border: "1px solid rgba(199, 210, 254, 0.18)",
  };
}

export default function OwnerItemEditPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
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

  const itemStatus = useMemo(() => item?.status || "UNKNOWN", [item]);

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
        const nextItem = await getItemById(id);

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

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);

    try {
      const parsedPrice = parsePositiveNumber(price, "Price");

      const updated = await updateItem(id, {
        title,
        description,
        price: parsedPrice,
        category,
        condition,
      });

      setItem(updated);
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
      const refreshed = await getItemById(id);
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
      "Delete/archive this item? This action removes it from active owner inventory."
    );
    if (!confirmed) return;

    setActionLoading("delete");
    setError(null);
    setNotice(null);

    try {
      await deleteItem(id);
      nav("/owner/inventory");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setActionLoading("");
    }
  }

  if (loading) return <div style={styles.card}>Loading item...</div>;

  if (error && !item) {
    return (
      <div style={styles.page}>
        <div style={styles.error}>{error}</div>
        <Link to="/owner/inventory" style={styles.secondaryLink}>
          Back to Inventory
        </Link>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>Item not found.</div>
        <Link to="/owner/inventory" style={styles.secondaryLink}>
          Back to Inventory
        </Link>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Edit Item</h2>
          <p style={styles.subtitle}>Update listing details and manage inventory status.</p>
        </div>

        <div style={styles.actions}>
          <Link to="/owner/inventory" style={styles.secondaryLink}>
            Back to Inventory
          </Link>
          <Link to={`/items/${item.id}`} style={styles.primaryLink}>
            View Public Listing
          </Link>
        </div>
      </div>

      <section style={styles.card}>
        <div style={styles.statusRow}>
          <span style={{ ...styles.metaPill, ...getItemStatusTone(itemStatus) }}>
            {itemStatus}
          </span>
          <span style={styles.metaPill}>Current price: {formatPrice(item.price)}</span>
          <span style={styles.metaPill}>Shop: {item.shop?.name || item.pawnShopId}</span>
        </div>

        {notice ? <div style={styles.notice}>{notice}</div> : null}
        {error ? <div style={styles.error}>{error}</div> : null}

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.field}>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
              required
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
              disabled={saving}
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
              disabled={saving || actionLoading !== ""}
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
              disabled={saving || actionLoading !== "" || String(itemStatus).toUpperCase() === "SOLD"}
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
              disabled={saving || actionLoading !== ""}
              style={{
                ...styles.dangerButton,
                ...(saving || actionLoading !== "" ? styles.disabledButton : {}),
              }}
            >
              {actionLoading === "delete" ? "Deleting..." : "Delete / Archive"}
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
    color: "#eef2ff",
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
    color: "#a7b0d8",
  },
  card: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
  },
  statusRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  metaPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(110,168,254,0.12)",
    color: "#cfe0ff",
    border: "1px solid rgba(110,168,254,0.2)",
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
    color: "#d7def7",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0c1330",
    color: "#eef2ff",
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
    color: "#08111f",
    background: "#6ea8fe",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#121935",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid rgba(248,113,113,0.35)",
    color: "#fecaca",
    background: "rgba(220,38,38,0.14)",
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
    color: "#08111f",
    background: "#6ea8fe",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
  },
  secondaryLink: {
    color: "#c7d2fe",
    textDecoration: "none",
    fontWeight: 700,
    padding: "10px 2px",
  },
  notice: {
    color: "#c7f9d3",
    fontWeight: 700,
    marginBottom: 12,
  },
  error: {
    color: "#ff9ead",
    fontWeight: 700,
    marginBottom: 12,
  },
};

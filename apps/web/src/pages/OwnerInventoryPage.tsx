import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { deleteItem, getMyItems, markItemSold, type Item } from "../services/items";

type StatusFilter = "ALL" | "ACTIVE" | "PENDING" | "SOLD" | "DELETED";
type SortKey = "createdAt" | "title" | "price" | "status" | "category";

function formatPrice(value: string | number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function getRecordValue(item: Item, key: string) {
  return (item as unknown as Record<string, unknown>)[key];
}

function getCreatedAt(item: Item) {
  const value = getRecordValue(item, "createdAt");
  return value ? String(value) : "";
}

function getShopName(item: Item) {
  return item.shop?.name || item.pawnShopId || "Unknown shop";
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

  if (["SOLD", "INACTIVE", "REMOVED", "DELETED"].includes(normalized)) {
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

function normalizeStatus(status: unknown) {
  return String(status || "").trim().toUpperCase();
}

function itemMatchesStatus(item: Item, statusFilter: StatusFilter) {
  const status = normalizeStatus(item.status);

  if (statusFilter === "ALL") return true;
  if (statusFilter === "ACTIVE") return ["AVAILABLE", "ACTIVE"].includes(status);
  return status === statusFilter;
}

function sortItems(items: Item[], sortKey: SortKey) {
  return [...items].sort((a, b) => {
    if (sortKey === "price") return Number(b.price || 0) - Number(a.price || 0);
    if (sortKey === "createdAt") return getCreatedAt(b).localeCompare(getCreatedAt(a));

    const left = String(getRecordValue(a, sortKey) || "").toLowerCase();
    const right = String(getRecordValue(b, sortKey) || "").toLowerCase();
    return left.localeCompare(right);
  });
}

function exportInventoryCsv(items: Item[]) {
  const rows = items.map((item) => ({
    id: item.id,
    title: item.title,
    price: item.price,
    status: item.status,
    category: item.category || "",
    condition: item.condition || "",
    shop: getShopName(item),
    createdAt: getCreatedAt(item),
  }));

  const headers = Object.keys(
    rows[0] || {
      id: "",
      title: "",
      price: "",
      status: "",
      category: "",
      condition: "",
      shop: "",
      createdAt: "",
    },
  );

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((key) => {
          const value = String((row as Record<string, unknown>)[key] ?? "");
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "owner-inventory.csv";
  anchor.click();

  URL.revokeObjectURL(url);
}

export default function OwnerInventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionItemId, setActionItemId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const nextItems = await getMyItems();
      setItems(nextItems);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(() => {
    return items.filter((item) =>
      ["AVAILABLE", "PENDING", "ACTIVE"].includes(normalizeStatus(item.status)),
    ).length;
  }, [items]);

  const soldCount = useMemo(() => {
    return items.filter((item) => normalizeStatus(item.status) === "SOLD").length;
  }, [items]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const next = items
      .filter((item) => itemMatchesStatus(item, statusFilter))
      .filter((item) => {
        if (!needle) return true;

        return [
          item.id,
          item.title,
          item.description,
          item.category,
          item.condition,
          item.status,
          item.pawnShopId,
          item.shop?.name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      });

    return sortItems(next, sortKey);
  }, [items, query, sortKey, statusFilter]);

  async function handleMarkSold(item: Item) {
    if (!item.id || actionItemId) return;

    const confirmed = window.confirm(`Mark "${item.title}" as sold?`);
    if (!confirmed) return;

    setActionItemId(item.id);
    setNotice(null);
    setError(null);

    try {
      await markItemSold(item.id);
      setNotice(`Marked "${item.title}" as sold.`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark item sold.");
    } finally {
      setActionItemId("");
    }
  }

  async function handleDelete(item: Item) {
    if (!item.id || actionItemId) return;

    const confirmed = window.confirm(`Delete/archive "${item.title}"?`);
    if (!confirmed) return;

    setActionItemId(item.id);
    setNotice(null);
    setError(null);

    try {
      await deleteItem(item.id);
      setNotice(`Deleted/archived "${item.title}".`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setActionItemId("");
    }
  }

  return (
    <div className="owner-inventory-page" style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Owner Inventory</h2>
          <p style={styles.subtitle}>
            Search, add, edit, sell, archive, scan, upload, and export shop inventory.
          </p>
        </div>

        <div style={styles.actions}>
          <Link to="/owner/items/new" style={styles.primaryLink}>
            Add Item
          </Link>
          <Link to="/owner/bulk-upload" style={styles.linkButton}>
            Bulk Upload
          </Link>
          <Link to="/owner/scan-console" style={styles.linkButton}>
            Scan Console
          </Link>
          <button
            type="button"
            onClick={() => exportInventoryCsv(filteredItems)}
            style={styles.secondaryButton}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            style={{
              ...styles.secondaryButton,
              ...(loading || refreshing ? styles.disabledButton : {}),
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <section style={styles.commandPanel}>
        <div>
          <div style={styles.kicker}>Inventory Command Center</div>
          <h3 style={styles.sectionTitle}>Daily Inventory Controls</h3>
          <p style={styles.subtitle}>
            Use these controls to find items quickly, update status, sell items,
            archive bad records, and keep inventory moving.
          </p>
        </div>

        <div style={styles.quickGrid}>
          <div style={styles.card}>
            <div style={styles.kicker}>Total Items</div>
            <div style={styles.bigValue}>{items.length}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.kicker}>Active</div>
            <div style={styles.bigValue}>{activeCount}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.kicker}>Sold</div>
            <div style={styles.bigValue}>{soldCount}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.kicker}>Showing</div>
            <div style={styles.bigValue}>{filteredItems.length}</div>
          </div>
        </div>
      </section>

      <section style={styles.controlBar}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title, category, condition, status, shop, or id..."
          style={styles.input}
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          style={styles.select}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING">Pending</option>
          <option value="SOLD">Sold</option>
          <option value="DELETED">Deleted</option>
        </select>

        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          style={styles.select}
        >
          <option value="createdAt">Newest first</option>
          <option value="title">Title</option>
          <option value="price">Price high to low</option>
          <option value="status">Status</option>
          <option value="category">Category</option>
        </select>
      </section>

      {!loading && !error ? (
        <div style={styles.summary}>
          Total items: {items.length} · Active items: {activeCount} · Showing: {filteredItems.length}
        </div>
      ) : null}

      {notice ? <div style={styles.notice}>{notice}</div> : null}
      {loading ? <div style={styles.card}>Loading inventory...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && filteredItems.length === 0 ? (
        <div style={styles.card}>
          <strong>No inventory found.</strong>
          <p style={styles.subtitle}>Adjust search/filter controls or create a new item.</p>
        </div>
      ) : null}

      <div style={styles.grid}>
        {filteredItems.map((item) => {
          const isActioning = actionItemId === item.id;
          const isSold = normalizeStatus(item.status) === "SOLD";

          return (
            <article key={item.id} style={styles.card}>
              <h3 style={styles.cardTitle}>{item.title}</h3>
              <div style={styles.price}>{formatPrice(item.price)}</div>

              <div style={styles.metaRow}>
                <span style={{ ...styles.metaPill, ...getItemStatusTone(item.status) }}>
                  {item.status}
                </span>
                {item.category ? <span style={styles.metaPill}>{item.category}</span> : null}
                {item.condition ? <span style={styles.metaPill}>{item.condition}</span> : null}
              </div>

              <div style={styles.meta}>Shop: {getShopName(item)}</div>

              {item.description ? <p style={styles.description}>{item.description}</p> : null}

              <div style={styles.actionRow}>
                <Link to={`/items/${item.id}`} style={styles.linkButton}>
                  View
                </Link>

                <Link to={`/owner/items/${item.id}/edit`} style={styles.primarySmallLink}>
                  Edit
                </Link>

                {item.pawnShopId ? (
                  <Link to={`/shops/${item.pawnShopId}`} style={styles.linkButton}>
                    Shop
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={() => handleMarkSold(item)}
                  disabled={isActioning || isSold}
                  style={{
                    ...styles.smallButton,
                    ...(isActioning || isSold ? styles.disabledButton : {}),
                  }}
                >
                  {isActioning ? "Working..." : isSold ? "Sold" : "Mark Sold"}
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={isActioning}
                  style={{
                    ...styles.dangerSmallButton,
                    ...(isActioning ? styles.disabledButton : {}),
                  }}
                >
                  Delete / Archive
                </button>
              </div>
            </article>
          );
        })}
      </div>
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
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  commandPanel: {
    border: "1px solid rgba(110,168,254,0.28)",
    borderRadius: 18,
    padding: 18,
    background:
      "radial-gradient(circle at top left, rgba(110,168,254,0.20), transparent 30%), #121935",
    display: "grid",
    gap: 16,
  },
  quickGrid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  },
  controlBar: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "minmax(240px, 1fr) repeat(auto-fit, minmax(150px, 220px))",
    alignItems: "center",
  },
  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#121935",
    color: "#eef2ff",
  },
  select: {
    minWidth: 170,
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#121935",
    color: "#eef2ff",
  },
  summary: {
    color: "#c7d2fe",
    fontWeight: 700,
  },
  grid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  },
  card: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
  },
  kicker: {
    fontSize: 12,
    color: "#6ea8fe",
    textTransform: "uppercase",
    fontWeight: 800,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  bigValue: {
    fontWeight: 800,
    fontSize: 24,
  },
  cardTitle: {
    margin: "0 0 8px",
    fontSize: 20,
    fontWeight: 800,
  },
  price: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 8,
  },
  meta: {
    color: "#a7b0d8",
    marginTop: 6,
  },
  metaRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12,
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
  description: {
    color: "#d7def7",
    lineHeight: 1.5,
    marginTop: 12,
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 16,
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
  primarySmallLink: {
    textDecoration: "none",
    border: "none",
    color: "#08111f",
    background: "#6ea8fe",
    padding: "9px 12px",
    borderRadius: 12,
    fontWeight: 800,
  },
  linkButton: {
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#121935",
    padding: "9px 12px",
    borderRadius: 12,
    fontWeight: 700,
  },
  smallButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#121935",
    padding: "9px 12px",
    borderRadius: 12,
    fontWeight: 700,
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
  dangerSmallButton: {
    border: "1px solid rgba(248,113,113,0.35)",
    color: "#fecaca",
    background: "rgba(220,38,38,0.14)",
    padding: "9px 12px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
  notice: {
    color: "#c7f9d3",
    fontWeight: 700,
  },
  error: {
    color: "#ff9ead",
    fontWeight: 700,
  },
};

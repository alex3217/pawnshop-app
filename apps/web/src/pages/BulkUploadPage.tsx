import { useEffect, useState, type FormEvent } from "react";
import { getMyShops, type Shop } from "../services/shops";
import { importInventoryCsv } from "../services/uploads";

type ImportResult = {
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors?: Array<{ line: number; error: string }>;
};

export default function BulkUploadPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loadingShops, setLoadingShops] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadShops() {
      setLoadingShops(true);
      setError(null);

      try {
        const nextShops = await getMyShops();
        if (!cancelled) {
          setShops(nextShops);
          setShopId(nextShops[0]?.id || "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load shops.");
        }
      } finally {
        if (!cancelled) {
          setLoadingShops(false);
        }
      }
    }

    void loadShops();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setResult(null);

    if (!shopId) {
      setError("Select a shop first.");
      return;
    }

    if (!file) {
      setError("Choose a CSV file to upload.");
      return;
    }

    setSubmitting(true);

    try {
      const data = await importInventoryCsv(shopId, file);

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Bulk Upload Inventory</h2>

      {loadingShops ? <div style={styles.card}>Loading shops...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      <form onSubmit={onSubmit} style={styles.card}>
        <div style={styles.formRow}>
          <label style={styles.label}>Shop</label>
          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            style={styles.input}
            disabled={loadingShops || shops.length === 0}
          >
            {shops.length === 0 ? (
              <option value="">No shops available</option>
            ) : (
              shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div style={styles.formRow}>
          <label style={styles.label}>CSV File</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={styles.input}
          />
        </div>

        <div style={styles.hint}>
          Expected columns: title, description, price, category, condition, status, currency
        </div>

        <button type="submit" disabled={submitting} style={styles.primaryButton}>
          {submitting ? "Uploading..." : "Upload CSV"}
        </button>
      </form>

      {result ? (
        <section style={styles.card}>
          <h3 style={styles.sectionTitle}>Import Result</h3>
          <div style={styles.meta}>Rows: {result.totalRows}</div>
          <div style={styles.meta}>Imported: {result.successCount}</div>
          <div style={styles.meta}>Failed: {result.failedCount}</div>

          {result.errors && result.errors.length > 0 ? (
            <div style={styles.errorList}>
              {result.errors.map((entry, index) => (
                <div key={`${entry.line}-${index}`} style={styles.errorItem}>
                  Line {entry.line}: {entry.error}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: "grid", gap: 20, color: "#eef2ff" },
  title: { margin: 0, fontSize: 30, fontWeight: 800 },
  sectionTitle: { margin: "0 0 10px", fontSize: 22, fontWeight: 800 },
  card: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
    display: "grid",
    gap: 14,
  },
  formRow: { display: "grid", gap: 8 },
  label: { fontWeight: 700, color: "#d7def7" },
  input: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0c1330",
    color: "#eef2ff",
    padding: "12px 14px",
  },
  hint: { color: "#a7b0d8" },
  meta: { color: "#d7def7" },
  primaryButton: {
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    background: "#6ea8fe",
    color: "#08111f",
    fontWeight: 800,
    cursor: "pointer",
  },
  error: { color: "#ff9ead", fontWeight: 700 },
  errorList: { display: "grid", gap: 8 },
  errorItem: {
    color: "#ffb2bc",
    background: "rgba(255, 128, 143, 0.12)",
    padding: "10px 12px",
    borderRadius: 12,
  },
};

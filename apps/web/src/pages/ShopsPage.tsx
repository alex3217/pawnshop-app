// File: apps/web/src/pages/ShopsPage.tsx

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { getMarketplaceShops, type Shop } from "../services/shops";

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function hasValue(value: string | null | undefined) {
  return String(value || "").trim().length > 0;
}

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [query, setQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireHours, setRequireHours] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextShops = await getMarketplaceShops();
        if (!cancelled) {
          setShops(nextShops);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load shops.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredShops = useMemo(() => {
    const q = normalizeText(query);
    const locationQ = normalizeText(locationQuery);

    return shops.filter((shop) => {
      const searchable = [
        shop.name,
        shop.address || "",
        shop.phone || "",
        shop.description || "",
        shop.hours || "",
      ]
        .join(" ")
        .toLowerCase();

      const locationHaystack = [shop.address || "", shop.name].join(" ").toLowerCase();

      if (q && !searchable.includes(q)) return false;
      if (locationQ && !locationHaystack.includes(locationQ)) return false;
      if (requirePhone && !hasValue(shop.phone)) return false;
      if (requireHours && !hasValue(shop.hours)) return false;

      return true;
    });
  }, [shops, query, locationQuery, requirePhone, requireHours]);

  const stats = useMemo(() => {
    const withPhone = filteredShops.filter((shop) => hasValue(shop.phone)).length;
    const withHours = filteredShops.filter((shop) => hasValue(shop.hours)).length;

    return {
      total: shops.length,
      filtered: filteredShops.length,
      withPhone,
      withHours,
    };
  }, [shops, filteredShops]);

  function clearFilters() {
    setQuery("");
    setLocationQuery("");
    setRequirePhone(false);
    setRequireHours(false);
  }

  const hasActiveFilters =
    query.trim() ||
    locationQuery.trim() ||
    requirePhone ||
    requireHours;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Shops</h2>
          <p style={styles.subtitle}>
            Browse pawnshop storefronts and explore inventory by store.
          </p>
        </div>
      </div>

      <section style={styles.filterCard}>
        <div style={styles.filterTopRow}>
          <div style={styles.filterTitleWrap}>
            <div style={styles.filterTitle}>Find stores</div>
            <div style={styles.filterSubtitle}>
              Search by name, address, phone, or store details.
            </div>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            style={{
              ...styles.clearButton,
              ...(!hasActiveFilters ? styles.disabledButton : {}),
            }}
          >
            Clear Filters
          </button>
        </div>

        <div style={styles.filterGrid}>
          <label style={styles.field}>
            <span style={styles.label}>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shops by name, phone, description..."
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Location</span>
            <input
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="City, area, address..."
              style={styles.input}
            />
          </label>
        </div>

        <div style={styles.toggleRow}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={requirePhone}
              onChange={(e) => setRequirePhone(e.target.checked)}
            />
            <span>Only shops with phone listed</span>
          </label>

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={requireHours}
              onChange={(e) => setRequireHours(e.target.checked)}
            />
            <span>Only shops with hours listed</span>
          </label>
        </div>
      </section>

      <section style={styles.statsRow}>
        <div style={styles.statPill}>All shops: {stats.total}</div>
        <div style={styles.statPill}>Matching: {stats.filtered}</div>
        <div style={styles.statPill}>With phone: {stats.withPhone}</div>
        <div style={styles.statPill}>With hours: {stats.withHours}</div>
      </section>

      {loading ? <div style={styles.card}>Loading shops...</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {!loading && !error && filteredShops.length === 0 ? (
        <div style={styles.card}>No shops matched your filters.</div>
      ) : null}

      <div style={styles.grid}>
        {filteredShops.map((shop) => (
          <article key={shop.id} style={styles.card}>
            <h3 style={styles.cardTitle}>{shop.name}</h3>

            <div style={styles.meta}>
              <div>{shop.address || "No address provided"}</div>
              <div>{shop.phone || "No phone listed"}</div>
              <div>{shop.hours || "Hours not listed"}</div>
            </div>

            {shop.description ? (
              <p style={styles.description}>{shop.description}</p>
            ) : null}

            <div style={styles.actions}>
              <Link to={`/shops/${shop.id}`} style={styles.primaryLink}>
                View Storefront
              </Link>
              <Link to="/marketplace" style={styles.secondaryLink}>
                Browse Inventory
              </Link>
            </div>
          </article>
        ))}
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
  },
  filterCard: {
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
    display: "grid",
    gap: 16,
  },
  filterTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  filterTitleWrap: {
    display: "grid",
    gap: 6,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: 800,
  },
  filterSubtitle: {
    color: "#a7b0d8",
    fontSize: 14,
  },
  filterGrid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  },
  field: {
    display: "grid",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#c7d2fe",
  },
  input: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0c1330",
    color: "#eef2ff",
    padding: "12px 14px",
  },
  toggleRow: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#d7def7",
    fontSize: 14,
  },
  clearButton: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  statsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  statPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(110,168,254,0.12)",
    color: "#cfe0ff",
    border: "1px solid rgba(110,168,254,0.2)",
    fontSize: 13,
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
  cardTitle: {
    margin: "0 0 12px",
    fontSize: 22,
    fontWeight: 800,
  },
  meta: {
    display: "grid",
    gap: 6,
    color: "#c7d2fe",
    fontSize: 14,
    marginBottom: 12,
  },
  description: {
    color: "#d7def7",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: 12,
    marginTop: 16,
    flexWrap: "wrap",
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
  },
  error: {
    color: "#ff9ead",
    fontWeight: 700,
  },
};
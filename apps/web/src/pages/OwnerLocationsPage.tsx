// File: apps/web/src/pages/OwnerLocationsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { getAuthHeaders, getAuthToken } from "../services/auth";

type LocationRecord = {
  id: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  staffCount: number;
  inventoryCount: number;
  status: string;
};

type ApiLocationRecord = Partial<{
  id: string;
  name: string;
  shopName: string;
  title: string;
  address: string;
  location: string;
  phone: string;
  hours: string;
  staffCount: number;
  inventoryCount: number;
  itemCount: number;
  status: string;
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStatus(value: string | undefined) {
  const normalized = String(value || "ACTIVE").trim().toUpperCase();
  return normalized || "ACTIVE";
}

function normalizeLocation(
  row: ApiLocationRecord,
  index: number,
): LocationRecord {
  return {
    id: String(row.id || `location-${index}`),
    name: String(
      row.name || row.shopName || row.title || `Location ${index + 1}`,
    ),
    address: String(row.address || row.location || "Address not available"),
    phone: String(row.phone || "—"),
    hours: String(row.hours || "—"),
    staffCount: Number.isFinite(row.staffCount) ? Number(row.staffCount) : 0,
    inventoryCount: Number.isFinite(row.inventoryCount)
      ? Number(row.inventoryCount)
      : Number.isFinite(row.itemCount)
        ? Number(row.itemCount)
        : 0,
    status: normalizeStatus(row.status),
  };
}

function extractLocationRows(payload: unknown): ApiLocationRecord[] {
  if (Array.isArray(payload)) return payload as ApiLocationRecord[];

  if (isObject(payload)) {
    if (Array.isArray(payload.data)) {
      return payload.data as ApiLocationRecord[];
    }
    if (Array.isArray(payload.shops)) {
      return payload.shops as ApiLocationRecord[];
    }
    if (Array.isArray(payload.locations)) {
      return payload.locations as ApiLocationRecord[];
    }
  }

  return [];
}

function extractMessage(payload: unknown) {
  if (isObject(payload) && typeof payload.message === "string") {
    return payload.message;
  }
  if (isObject(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  return null;
}

function sortLocations(items: LocationRecord[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchOwnerLocations(
  signal?: AbortSignal,
): Promise<LocationRecord[]> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing owner token. Please log in again.");
  }

  const candidates = ["/api/locations/mine", "/api/shops/mine"];

  let lastError: unknown = null;

  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        signal,
      });

      if (response.status === 404) {
        lastError = new Error(`Endpoint not found: ${endpoint}`);
        continue;
      }

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          extractMessage(payload) || `Request failed (${response.status})`;
        throw new Error(message);
      }

      const rawList = extractLocationRows(payload);

      return sortLocations(
        rawList.map((row: ApiLocationRecord, index: number) =>
          normalizeLocation(row, index),
        ),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load owner locations.");
}

export default function OwnerLocationsPage() {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      signal?: AbortSignal,
    ) => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const data = await fetchOwnerLocations(signal);
        setLocations(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load locations.");
      } finally {
        if (mode === "refresh") setRefreshing(false);
        else setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load("initial", controller.signal);
    return () => controller.abort();
  }, [load]);

  const summary = useMemo(() => {
    return {
      count: locations.length,
      totalInventory: locations.reduce(
        (sum, item) => sum + item.inventoryCount,
        0,
      ),
      totalStaff: locations.reduce((sum, item) => sum + item.staffCount, 0),
      activeLocations: locations.filter((item) => item.status === "ACTIVE")
        .length,
    };
  }, [locations]);

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Owner</div>
          <h1 style={styles.title}>Locations</h1>
          <p style={styles.subtitle}>
            Track your shop footprint, inventory distribution, and staff
            coverage by location.
          </p>
        </div>

        <div style={styles.heroActions}>
          <button
            type="button"
            onClick={() => void load("refresh")}
            disabled={loading || refreshing}
            style={{
              ...styles.secondaryButton,
              ...(loading || refreshing ? styles.buttonDisabled : {}),
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <Link to="/owner/shops/new" style={styles.primaryLink}>
            Add location
          </Link>
        </div>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Locations</div>
          <div style={styles.statValue}>{summary.count}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Active locations</div>
          <div style={styles.statValue}>{summary.activeLocations}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Inventory across locations</div>
          <div style={styles.statValue}>{summary.totalInventory}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Staff assigned</div>
          <div style={styles.statValue}>{summary.totalStaff}</div>
        </div>
      </div>

      {loading ? (
        <div style={styles.stateCard}>Loading locations...</div>
      ) : error ? (
        <div style={styles.errorCard}>
          <div style={styles.emptyTitle}>Unable to load locations</div>
          <p style={styles.emptyText}>{error}</p>
        </div>
      ) : locations.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No locations found</div>
          <p style={styles.emptyText}>
            Create your first shop location to start managing inventory and
            staff.
          </p>
          <Link to="/owner/shops/new" style={styles.primaryLink}>
            Create location
          </Link>
        </div>
      ) : (
        <div style={styles.list}>
          {locations.map((location) => (
            <article key={location.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>{location.name}</h2>
                  <div style={styles.metaRow}>
                    <span>{location.address}</span>
                    <span>•</span>
                    <span>Status: {location.status}</span>
                  </div>
                </div>

                <div style={styles.statusPill}>{location.status}</div>
              </div>

              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.detailLabel}>Phone</div>
                  <div style={styles.detailValue}>{location.phone}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Hours</div>
                  <div style={styles.detailValue}>{location.hours}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Inventory</div>
                  <div style={styles.detailValue}>{location.inventoryCount}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Staff</div>
                  <div style={styles.detailValue}>{location.staffCount}</div>
                </div>
              </div>

              <div style={styles.cardActions}>
                <Link to="/owner/inventory" style={styles.secondaryLink}>
                  View inventory
                </Link>
                <Link to="/owner/staff" style={styles.secondaryLink}>
                  View staff
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 20 },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    opacity: 0.72,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 4vw, 2.6rem)",
    fontWeight: 900,
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 760,
    color: "rgba(238,242,255,0.78)",
    lineHeight: 1.6,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  statCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 18,
  },
  statLabel: {
    fontSize: 13,
    color: "rgba(238,242,255,0.7)",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 900,
  },
  stateCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 22,
  },
  errorCard: {
    border: "1px solid rgba(255,120,120,0.25)",
    background: "rgba(255,120,120,0.09)",
    color: "#ffd4d4",
    borderRadius: 18,
    padding: 22,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 8,
  },
  emptyText: {
    margin: 0,
    color: "rgba(238,242,255,0.76)",
  },
  primaryLink: {
    display: "inline-flex",
    textDecoration: "none",
    color: "#0b1020",
    background: "#eef2ff",
    fontWeight: 800,
    padding: "10px 14px",
    borderRadius: 12,
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  list: {
    display: "grid",
    gap: 16,
  },
  card: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 20,
    display: "grid",
    gap: 18,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
  },
  metaRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8,
    color: "rgba(238,242,255,0.72)",
    fontSize: 14,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(34,197,94,0.18)",
    border: "1px solid rgba(74,222,128,0.3)",
    fontWeight: 900,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  detailLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(238,242,255,0.6)",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: 700,
  },
  cardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  secondaryLink: {
    textDecoration: "none",
    color: "#eef2ff",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
  },
};
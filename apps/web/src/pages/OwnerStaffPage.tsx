// File: apps/web/src/pages/OwnerStaffPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { getAuthHeaders, getAuthToken } from "../services/auth";

type StaffRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  locationName: string;
  status: string;
};

type ApiStaffRecord = Partial<{
  id: string;
  name: string;
  fullName: string;
  email: string;
  userEmail: string;
  role: string;
  staffRole: string;
  locationName: string;
  shopName: string;
  pawnShopName: string;
  status: string;
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeLabel(value: string | undefined, fallback: string) {
  const normalized = String(value || fallback).trim();
  return normalized || fallback;
}

function normalizeUpper(value: string | undefined, fallback: string) {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized || fallback;
}

function normalizeStaff(
  row: ApiStaffRecord,
  index: number,
): StaffRecord {
  return {
    id: String(row.id || `staff-${index}`),
    name: String(row.name || row.fullName || `Staff ${index + 1}`),
    email: String(row.email || row.userEmail || "—"),
    role: normalizeUpper(row.role || row.staffRole, "TEAM_MEMBER"),
    locationName: normalizeLabel(
      row.locationName || row.shopName || row.pawnShopName,
      "Unassigned",
    ),
    status: normalizeUpper(row.status, "ACTIVE"),
  };
}

function extractStaffRows(payload: unknown): ApiStaffRecord[] {
  if (Array.isArray(payload)) return payload as ApiStaffRecord[];

  if (isObject(payload)) {
    if (Array.isArray(payload.data)) return payload.data as ApiStaffRecord[];
    if (Array.isArray(payload.staff)) return payload.staff as ApiStaffRecord[];
    if (Array.isArray(payload.items)) return payload.items as ApiStaffRecord[];
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

async function fetchOwnerStaff(
  signal?: AbortSignal,
): Promise<StaffRecord[]> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing owner token. Please log in again.");
  }

  const endpoint = "/api/staff/mine";

  const response = await fetch(endpoint, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "include",
    signal,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      extractMessage(payload) || `Request failed (${response.status})`;
    throw new Error(message);
  }

  const rawList = extractStaffRows(payload);

  return rawList.map((row: ApiStaffRecord, index: number) =>
    normalizeStaff(row, index),
  );
}

export default function OwnerStaffPage() {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
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
        const data = await fetchOwnerStaff(signal);
        setStaff(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load staff.");
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
      staffCount: staff.length,
      activeCount: staff.filter((row) => row.status === "ACTIVE").length,
      locationsCovered: new Set(
        staff.map((row) => row.locationName).filter(Boolean),
      ).size,
    };
  }, [staff]);

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Owner</div>
          <h1 style={styles.title}>Staff</h1>
          <p style={styles.subtitle}>
            Review your assigned team members, roles, and location coverage.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load("refresh")}
          disabled={loading || refreshing}
          style={{
            ...styles.actionButton,
            ...(loading || refreshing ? styles.actionButtonDisabled : {}),
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total staff</div>
          <div style={styles.statValue}>{summary.staffCount}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Active staff</div>
          <div style={styles.statValue}>{summary.activeCount}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Locations covered</div>
          <div style={styles.statValue}>{summary.locationsCovered}</div>
        </div>
      </div>

      {loading ? (
        <div style={styles.stateCard}>Loading staff...</div>
      ) : error ? (
        <div style={styles.errorCard}>
          <div style={styles.emptyTitle}>Unable to load staff</div>
          <p style={styles.emptyText}>{error}</p>
        </div>
      ) : staff.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No staff assigned yet</div>
          <p style={styles.emptyText}>
            Staff records are not assigned to this owner yet. Once team members
            are added, they will appear here with role and location details.
          </p>
          <Link to="/owner/locations" style={styles.primaryLink}>
            Review locations
          </Link>
        </div>
      ) : (
        <div style={styles.list}>
          {staff.map((member) => (
            <article key={member.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>{member.name}</h2>
                  <div style={styles.metaRow}>
                    <span>{member.email}</span>
                    <span>•</span>
                    <span>{member.locationName}</span>
                  </div>
                </div>

                <div style={styles.statusPill}>{member.status}</div>
              </div>

              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.detailLabel}>Role</div>
                  <div style={styles.detailValue}>{member.role}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Location</div>
                  <div style={styles.detailValue}>{member.locationName}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Status</div>
                  <div style={styles.detailValue}>{member.status}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
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
  actionButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
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
    marginTop: 16,
    color: "#0b1020",
    background: "#eef2ff",
    textDecoration: "none",
    fontWeight: 800,
    padding: "10px 14px",
    borderRadius: 12,
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
};